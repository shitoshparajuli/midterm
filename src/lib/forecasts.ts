/**
 * Locked projections: build a snapshot of every source's call for every race as of a moment,
 * freeze it (with that moment's "Races to watch"), and score it against results.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { demProb, leanMap, priceAt, primaryMarkets, racesToWatch, PLATFORMS } from "@/lib/queries";
import { inGroup, LEAN_GROUPS, pollAverage } from "@/lib/poll-average";
import { marginToProb } from "@/lib/stats";
import { scoreAll, withTimesSiena } from "@/lib/scoring";
import { buildScorecard, lockCsvText, type LockedForecast } from "@/lib/scorecard";
import { FINAL_LOCK_ID } from "@/lib/election";

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
  // Pick the watch list from the locked odds, so a late run still picks what 9pm looked like.
  const prices = new Map<string, { p: number | null; k: number | null }>();
  for (const r of rows) {
    if (r.source !== "polymarket" && r.source !== "kalshi") continue;
    const cur = prices.get(r.raceKey) ?? { p: null, k: null };
    cur[r.source === "polymarket" ? "p" : "k"] = r.demWinProb ?? null;
    prices.set(r.raceKey, cur);
  }
  const watch = await racesToWatch({ asOf, prices });
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.delete(schema.forecastScores).where(eq(schema.forecastScores.lockId, id));
      await tx.delete(schema.forecasts).where(eq(schema.forecasts.lockId, id));
      await tx.delete(schema.forecastLocks).where(eq(schema.forecastLocks.id, id));
    }
    await tx.insert(schema.forecastLocks).values({ id, asOf, note, watch });
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.insert(schema.forecasts).values(rows.slice(i, i + 1000).map((r) => ({ ...r, lockId: id })));
    }
  });
  return { id, created: true, asOf: asOf.toISOString(), forecasts: rows.length, watch: watch.map((w) => w.key) };
}

export async function loadForecasts(lockId: string) {
  return db
    .select({
      raceKey: schema.forecasts.raceKey,
      source: schema.forecasts.source,
      demWinProb: schema.forecasts.demWinProb,
      margin: schema.forecasts.margin,
      detail: schema.forecasts.detail,
    })
    .from(schema.forecasts)
    .where(eq(schema.forecasts.lockId, lockId));
}

/** Recompute and store scores for a lock against current results. */
export async function storeScores(lockId: string) {
  const [forecasts, races, [lock]] = await Promise.all([
    loadForecasts(lockId).then(withTimesSiena),
    db.select().from(schema.races),
    db.select({ watch: schema.forecastLocks.watch }).from(schema.forecastLocks).where(eq(schema.forecastLocks.id, lockId)),
  ]);
  const scores = scoreAll(forecasts, races, new Set(lock?.watch?.map((w) => w.key)));
  await db.transaction(async (tx) => {
    await tx.delete(schema.forecastScores).where(eq(schema.forecastScores.lockId, lockId));
    for (let i = 0; i < scores.length; i += 1000) {
      await tx.insert(schema.forecastScores).values(scores.slice(i, i + 1000).map((s) => ({ ...s, lockId })));
    }
  });
  return { lockId, scores: scores.length, scored: scores.find((s) => s.source === "polymarket" && s.scope === "all")?.n ?? 0 };
}

/**
 * Everything the Scorecard page needs. Uses the final lock once it exists; before that, a live
 * preview of what would be locked right now (not stored).
 */
export async function scorecard(lockId: string = FINAL_LOCK_ID) {
  const [lock] = await db.select().from(schema.forecastLocks).where(eq(schema.forecastLocks.id, lockId));
  const now = new Date();
  const [forecasts, races, leanOf, watch] = await Promise.all([
    lock ? loadForecasts(lockId) : buildForecasts(now),
    db.select().from(schema.races),
    leanMap(),
    lock ? (lock.watch ?? []) : racesToWatch(),
  ]);
  return buildScorecard({
    lock: { id: lockId, asOf: lock?.asOf ?? now, preview: !lock, archived: false },
    forecasts: forecasts as LockedForecast[],
    races,
    leanOf,
    watch,
  });
}

/** Flat CSV of a lock: one row per race and source, with the result alongside. */
export async function lockCsv(lockId: string) {
  const [[lock], forecasts, races] = await Promise.all([
    db.select().from(schema.forecastLocks).where(eq(schema.forecastLocks.id, lockId)),
    loadForecasts(lockId),
    db.select().from(schema.races),
  ]);
  return lockCsvText({
    lockId,
    asOf: lock?.asOf.toISOString() ?? "",
    watch: lock?.watch ?? [],
    forecasts: forecasts as LockedForecast[],
    races: new Map(races.map((r) => [r.key, r])),
  });
}
