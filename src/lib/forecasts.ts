/**
 * Locked projections: build a snapshot of every source's call for every race as of a moment,
 * freeze it, and score it against results.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { demProb, leanMap, priceAt, primaryMarkets, PLATFORMS } from "@/lib/queries";
import { inGroup, LEAN_GROUPS, pollAverage } from "@/lib/poll-average";
import { marginToProb } from "@/lib/stats";
import { calibration, MAIN_SOURCES, scoreAll, type ForecastRow } from "@/lib/scoring";
import { FINAL_LOCK_AT, FINAL_LOCK_ID } from "@/lib/election";

type NewForecast = typeof schema.forecasts.$inferInsert;
/** A pollster's latest poll counts toward its record if it ended within this window before the lock. */
const POLLSTER_WINDOW_DAYS = 60;

/**
 * Every source's projection as of `asOf`. Market prices come from stored history at or before
 * `asOf`; markets too small to store history fall back to the live price when we're close to `asOf`.
 */
export async function buildForecasts(asOf: Date): Promise<Omit<NewForecast, "lockId">[]> {
  const races = await db.select().from(schema.races).where(sql`${schema.races.office} <> 'generic'`);
  const keys = races.map((r) => r.key);
  const pm = await primaryMarkets(keys);
  const ids = [...pm.values()].flatMap((x) => PLATFORMS.flatMap((p) => [x[p].D?.id, x[p].R?.id])).filter(Boolean) as string[];
  const stored = await priceAt(ids, asOf);
  const liveOk = Math.abs(Date.now() - asOf.getTime()) < 6 * 3600_000;
  const out: Omit<NewForecast, "lockId">[] = [];

  for (const r of races) {
    const mk = pm.get(r.key);
    if (!mk) continue;
    for (const p of PLATFORMS) {
      const side = (party: "D" | "R") => {
        const m = mk[p][party];
        if (!m) return null;
        const price = stored.get(m.id) ?? (liveOk ? m.lastPrice : null) ?? null;
        return { id: m.id, price, volume: m.volume, from: stored.has(m.id) ? "history" : "live" };
      };
      const d = side("D");
      const rep = side("R");
      if (!d && !rep) continue;
      out.push({
        raceKey: r.key,
        source: p,
        demWinProb: demProb(d?.price, rep?.price),
        margin: null,
        detail: { D: d, R: rep },
      });
    }
  }

  const asOfDay = asOf.toISOString().slice(0, 10);
  const pollRows = await db
    .select()
    .from(schema.polls)
    .where(and(isNotNull(schema.polls.raceKey), isNotNull(schema.polls.margin), sql`${schema.polls.endDate} <= ${asOfDay}`));
  const leanOf = await leanMap();
  const office = new Map(races.map((r) => [r.key, r.office]));
  const byRace = new Map<string, typeof pollRows>();
  for (const p of pollRows) byRace.set(p.raceKey!, [...(byRace.get(p.raceKey!) ?? []), p]);

  const cutoff = new Date(asOf.getTime() - POLLSTER_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  for (const [raceKey, polls] of byRace) {
    const off = office.get(raceKey);
    if (!off) continue;
    for (const g of LEAN_GROUPS) {
      const a = pollAverage(polls.filter((p) => inGroup(p, g, leanOf)), asOf);
      if (a) out.push({ raceKey, source: `polls:${g}`, demWinProb: marginToProb(a.margin, off), margin: a.margin, detail: a });
    }
    // Each pollster's latest poll in the race (window-limited), for the pollster leaderboard.
    const latest = new Map<string, (typeof polls)[number]>();
    for (const p of polls) {
      if (p.endDate < cutoff) continue;
      const cur = latest.get(p.pollster);
      if (!cur || p.endDate > cur.endDate) latest.set(p.pollster, p);
    }
    for (const [pollster, p] of latest) {
      out.push({
        raceKey,
        source: `pollster:${pollster}`,
        demWinProb: marginToProb(p.margin!, off),
        margin: p.margin,
        detail: { pollId: p.id, endDate: p.endDate, sampleSize: p.sampleSize, lean: leanOf(pollster), partisan: p.partisan },
      });
    }
  }
  return out;
}

/** Freeze a snapshot. Refuses to overwrite an existing lock unless `force` (for test locks only). */
export async function lockForecasts(id: string, asOf: Date, { force = false, note }: { force?: boolean; note?: string } = {}) {
  const [existing] = await db.select().from(schema.forecastLocks).where(eq(schema.forecastLocks.id, id));
  if (existing && !force) return { id, created: false, asOf: existing.asOf.toISOString() };
  const rows = await buildForecasts(asOf);
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.delete(schema.forecastScores).where(eq(schema.forecastScores.lockId, id));
      await tx.delete(schema.forecasts).where(eq(schema.forecasts.lockId, id));
      await tx.delete(schema.forecastLocks).where(eq(schema.forecastLocks.id, id));
    }
    await tx.insert(schema.forecastLocks).values({ id, asOf, note });
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.insert(schema.forecasts).values(rows.slice(i, i + 1000).map((r) => ({ ...r, lockId: id })));
    }
  });
  return { id, created: true, asOf: asOf.toISOString(), forecasts: rows.length };
}

export async function loadForecasts(lockId: string) {
  return db
    .select({
      raceKey: schema.forecasts.raceKey,
      source: schema.forecasts.source,
      demWinProb: schema.forecasts.demWinProb,
      margin: schema.forecasts.margin,
    })
    .from(schema.forecasts)
    .where(eq(schema.forecasts.lockId, lockId));
}

/** Recompute and store scores for a lock against current results. */
export async function storeScores(lockId: string) {
  const [forecasts, races] = await Promise.all([loadForecasts(lockId), db.select().from(schema.races)]);
  const scores = scoreAll(forecasts, races);
  await db.transaction(async (tx) => {
    await tx.delete(schema.forecastScores).where(eq(schema.forecastScores.lockId, lockId));
    for (let i = 0; i < scores.length; i += 1000) {
      await tx.insert(schema.forecastScores).values(scores.slice(i, i + 1000).map((s) => ({ ...s, lockId })));
    }
  });
  return { lockId, scores: scores.length, scored: scores.find((s) => s.source === "polymarket" && s.scope === "all")?.n ?? 0 };
}

const MAIN_SCOPES = ["all", "office:senate", "office:governor", "office:house", "office:control"] as const;

/**
 * Everything the Scorecard page needs. Uses the final lock once it exists; before that, a live
 * preview of what would be locked right now (not stored).
 */
export async function scorecard(lockId: string = FINAL_LOCK_ID) {
  const [lock] = await db.select().from(schema.forecastLocks).where(eq(schema.forecastLocks.id, lockId));
  const now = new Date();
  const [forecasts, races, leanOf] = await Promise.all([
    lock ? loadForecasts(lockId) : buildForecasts(now),
    db.select().from(schema.races).where(sql`${schema.races.office} <> 'generic'`),
    leanMap(),
  ]);
  const scores = scoreAll(forecasts as ForecastRow[], races);
  const get = (source: string, scope: string) => scores.find((s) => s.source === source && s.scope === scope) ?? null;

  const byRace = new Map<string, Record<string, { p: number | null; margin: number | null }>>();
  for (const f of forecasts) {
    if (f.source.startsWith("pollster:")) continue;
    const m = byRace.get(f.raceKey) ?? {};
    m[f.source] = { p: f.demWinProb ?? null, margin: f.margin ?? null };
    byRace.set(f.raceKey, m);
  }

  const pollsterCounts = new Map<string, number>();
  for (const f of forecasts) if (f.source.startsWith("pollster:")) pollsterCounts.set(f.source, (pollsterCounts.get(f.source) ?? 0) + 1);
  const pollsters = [...pollsterCounts].map(([source, races]) => {
    const name = source.slice("pollster:".length);
    return { name, lean: leanOf(name), races, score: get(source, "all") };
  });

  const raceByKey = new Map(races.map((r) => [r.key, r]));
  const rows = [...byRace]
    .map(([key, f]) => {
      const r = raceByKey.get(key)!;
      return { key, office: r.office, state: r.state, title: r.title, winner: r.winnerParty, demPct: r.demPct, repPct: r.repPct, f };
    })
    .filter((r) => r.office !== "generic");

  const calib = (source: string) =>
    calibration(forecasts.filter((f) => f.source === source).map((f) => ({ p: f.demWinProb ?? null, race: raceByKey.get(f.raceKey)! })).filter((x) => x.race));

  return {
    lock: lock ? { id: lock.id, asOf: lock.asOf.toISOString(), preview: false } : { id: lockId, asOf: now.toISOString(), preview: true },
    lockAt: new Date(FINAL_LOCK_AT).toISOString(),
    counts: {
      races: rows.filter((r) => r.office !== "control").length,
      resolved: rows.filter((r) => r.office !== "control" && (r.winner === "D" || r.winner === "R")).length,
      withVotes: rows.filter((r) => r.demPct != null && r.repPct != null).length,
    },
    summary: Object.fromEntries(MAIN_SOURCES.map((s) => [s, Object.fromEntries(MAIN_SCOPES.map((sc) => [sc, get(s, sc)]))])),
    calibration: { polymarket: calib("polymarket"), kalshi: calib("kalshi"), "polls:all": calib("polls:all") },
    pollsters,
    races: rows,
  };
}

export type Scorecard = Awaited<ReturnType<typeof scorecard>>;

/** Flat CSV of a lock: one row per race and source, with the result alongside. */
export async function lockCsv(lockId: string) {
  const rows = await db.execute<Record<string, string | number | null>>(sql`
    select f.lock_id, l.as_of, f.race_key, r.office, r.state, f.source, f.dem_win_prob, f.margin,
      r.winner_party, r.dem_pct, r.rep_pct, r.called_at, r.result_source
    from forecasts f join forecast_locks l on l.id = f.lock_id join races r on r.key = f.race_key
    where f.lock_id = ${lockId}
    order by f.race_key, f.source`);
  const cols = ["lock_id", "as_of", "race_key", "office", "state", "source", "dem_win_prob", "margin", "winner_party", "dem_pct", "rep_pct", "called_at", "result_source"];
  const cell = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}
