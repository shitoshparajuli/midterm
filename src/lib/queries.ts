import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { groupAverages, inGroup, pollAverage, LEAN_GROUPS, type LeanGroup, type PollLite } from "@/lib/poll-average";
import { demProbSeries, RANGES, type Pt, type RangeKey } from "@/lib/series";
import { fetchPmHistory } from "@/lib/sources/polymarket";
import { fetchKalshiHistory } from "@/lib/sources/kalshi";
import { marginToProb } from "@/lib/stats";
import { NIGHT_END, NIGHT_START, pollCloseAt } from "@/lib/election";

type Market = typeof schema.markets.$inferSelect;
export const PLATFORMS = ["polymarket", "kalshi"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Highest-volume D and R contract per platform for each race. */
export async function primaryMarkets(raceKeys?: string[]) {
  if (raceKeys && !raceKeys.length) return new Map<string, Record<Platform, { D?: Market; R?: Market }>>();
  const rows = await db.execute<{ id: string }>(sql`
    select distinct on (race_key, platform, party) id
    from markets
    where party in ('D','R') ${raceKeys ? sql`and race_key in ${raceKeys}` : sql``}
    order by race_key, platform, party, volume desc`);
  if (!rows.length) return new Map<string, Record<Platform, { D?: Market; R?: Market }>>();
  const ms = await db.select().from(schema.markets).where(inArray(schema.markets.id, rows.map((r) => r.id)));
  const out = new Map<string, Record<Platform, { D?: Market; R?: Market }>>();
  for (const m of ms) {
    if (!out.has(m.raceKey)) out.set(m.raceKey, { polymarket: {}, kalshi: {} });
    out.get(m.raceKey)![m.platform as Platform][m.party as "D" | "R"] = m;
  }
  return out;
}

export const demProb = (d?: number | null, r?: number | null) => {
  if (d != null && r != null && d + r > 0) return d / (d + r);
  if (d != null) return d;
  if (r != null) return 1 - r;
  return null;
};

export async function leanMap() {
  const rows = await db.select({ name: schema.pollsters.name, lean: schema.pollsters.lean }).from(schema.pollsters);
  const m = new Map(rows.map((r) => [r.name, r.lean]));
  return (name: string) => m.get(name) ?? null;
}

async function pollsFor(raceKeys: string[]) {
  if (!raceKeys.length) return new Map<string, PollLite[]>();
  const rows = await db
    .select({
      raceKey: schema.polls.raceKey,
      pollster: schema.polls.pollster,
      endDate: schema.polls.endDate,
      margin: schema.polls.margin,
      sampleSize: schema.polls.sampleSize,
      partisan: schema.polls.partisan,
      internal: schema.polls.internal,
    })
    .from(schema.polls)
    .where(inArray(schema.polls.raceKey, raceKeys));
  const out = new Map<string, PollLite[]>();
  for (const r of rows) out.set(r.raceKey!, [...(out.get(r.raceKey!) ?? []), r]);
  return out;
}

// ---------------------------------------------------------------- list / detail

export async function listRaces(office?: string) {
  const races = await db
    .select()
    .from(schema.races)
    .where(office ? eq(schema.races.office, office) : undefined)
    .orderBy(asc(schema.races.key));
  const keys = races.map((r) => r.key);
  const [pm, polls] = await Promise.all([primaryMarkets(keys), pollsFor(keys)]);
  const now = new Date();
  return races
    .map((r) => {
      const mk = pm.get(r.key);
      const avg = pollAverage(polls.get(r.key) ?? [], now);
      return {
        ...r,
        markets: Object.fromEntries(
          PLATFORMS.map((p) => [
            p,
            mk?.[p].D || mk?.[p].R
              ? {
                  demWinProb: demProb(mk[p].D?.lastPrice, mk[p].R?.lastPrice),
                  volume: (mk[p].D?.volume ?? 0) + (mk[p].R?.volume ?? 0),
                  url: (mk[p].D ?? mk[p].R)!.url,
                }
              : null,
          ]),
        ),
        names: [mk?.polymarket.D ?? mk?.kalshi.D, mk?.polymarket.R ?? mk?.kalshi.R]
          .map((m) => m?.candidateName)
          .filter((n): n is string => !!n),
        polls: avg && { ...avg, demWinProb: marginToProb(avg.margin, r.office) },
        pollCount: polls.get(r.key)?.length ?? 0,
      };
    })
    .filter((r) => r.markets.polymarket || r.markets.kalshi || r.pollCount);
}

export async function raceDetail(key: string) {
  const [race] = await db.select().from(schema.races).where(eq(schema.races.key, key));
  if (!race) return null;
  const [cands, markets, pollRows, leanOf, primary] = await Promise.all([
    db.select().from(schema.candidates).where(eq(schema.candidates.raceKey, key)),
    db.select().from(schema.markets).where(eq(schema.markets.raceKey, key)).orderBy(desc(schema.markets.volume)),
    db.select().from(schema.polls).where(eq(schema.polls.raceKey, key)).orderBy(desc(schema.polls.endDate)),
    leanMap(),
    primaryMarkets([key]),
  ]);
  const mk = primary.get(key);
  const nameOf = (party: "D" | "R") => mk?.polymarket[party]?.candidateName ?? mk?.kalshi[party]?.candidateName ?? null;
  const end = Math.floor(Date.now() / 1000);
  const datedPolls = pollRows.filter((p) => p.margin != null);
  const firstPoll = datedPolls.length ? Date.parse(datedPolls[datedPolls.length - 1].endDate) / 1000 : end;
  const pollStart = Math.max(end - 120 * 86400, Math.min(firstPoll, end - 30 * 86400));
  return {
    race,
    names: { D: nameOf("D"), R: nameOf("R") },
    pollLines: { start: pollStart, end, lines: dailyPollLines(datedPolls, race.office, leanOf, pollStart, end) },
    candidates: cands,
    markets,
    current: Object.fromEntries(
      PLATFORMS.map((p) => [p, mk ? demProb(mk[p].D?.lastPrice, mk[p].R?.lastPrice) : null]),
    ) as Record<Platform, number | null>,
    pollAverages: groupAverages(pollRows, new Date(), race.office, leanOf),
    polls: pollRows.map((p) => ({ ...p, pollsterLean: leanOf(p.pollster) })),
  };
}

// ---------------------------------------------------------------- history

/** 1-min data straight from upstream: used for 1h / 1d so the chart is live on election night. */
async function liveHistory(m: Market, start: number, end: number): Promise<Pt[]> {
  if (m.platform === "polymarket") return fetchPmHistory(m.tokenId!, start, end, end - start > 7200 ? 5 : 1);
  return fetchKalshiHistory(m.seriesTicker!, m.externalId, start, end, 1);
}

async function storedHistory(ids: string[], start: number): Promise<Map<string, Pt[]>> {
  const out = new Map<string, Pt[]>();
  if (!ids.length) return out;
  const startDate = new Date(start * 1000);
  // Points in range plus the last point before it (so the line starts at the left edge).
  const rows = await db.execute<{ market_id: string; ts: string; price: number }>(sql`
    select market_id, ts, price from price_points
    where market_id in ${ids} and ts >= ${startDate.toISOString()}
    union all
    (select distinct on (market_id) market_id, ts, price from price_points
    where market_id in ${ids} and ts < ${startDate.toISOString()}
    order by market_id, ts desc)`);
  for (const r of rows) {
    const pts = out.get(r.market_id) ?? [];
    pts.push({ t: Math.floor(new Date(r.ts).getTime() / 1000), p: r.price });
    out.set(r.market_id, pts);
  }
  return out;
}

type PollPt = { t: number; margin: number; demWinProb: number | null };

/** One poll-average point per day (and one at `end`) for each lean group. */
function dailyPollLines(
  rp: PollLite[],
  office: string,
  leanOf: (pollster: string) => string | null,
  start: number,
  end: number,
) {
  const acc = Object.fromEntries(LEAN_GROUPS.map((g) => [g, [] as PollPt[]])) as Record<LeanGroup, PollPt[]>;
  const subset = Object.fromEntries(LEAN_GROUPS.map((g) => [g, rp.filter((p) => inGroup(p, g, leanOf))]));
  for (let t = Math.floor(start / 86400) * 86400 + 86400; t <= end + 86400; t += 86400) {
    const asOf = new Date(Math.min(t, end) * 1000);
    for (const g of LEAN_GROUPS) {
      const a = pollAverage(subset[g], asOf);
      if (a) acc[g].push({ t: Math.min(t, end), margin: a.margin, demWinProb: marginToProb(a.margin, office) });
    }
  }
  return acc;
}

export async function raceHistory(key: string, range: RangeKey) {
  const { seconds } = RANGES[range];
  let { step } = RANGES[range];
  let end = Math.floor(Date.now() / 1000);
  let start = end - seconds;
  if (range === "night") {
    start = NIGHT_START / 1000;
    end = Math.min(end, NIGHT_END / 1000);
    if (end - start > 6 * 3600) step = 300;
  }
  const mk = (await primaryMarkets([key])).get(key);
  const markets = mk ? PLATFORMS.flatMap((p) => [mk[p].D, mk[p].R].filter((m): m is Market => !!m)) : [];

  let pts: Map<string, Pt[]>;
  if (range === "night" && end <= start) {
    pts = new Map();
  } else if (range === "1h" || range === "1d" || range === "night") {
    pts = new Map(
      await Promise.all(
        markets.map(async (m) => [m.id, await liveHistory(m, start, end).catch(() => [])] as const),
      ),
    );
  } else {
    pts = await storedHistory(markets.map((m) => m.id), start);
    // Not ingested yet (fresh deploy): fall back to upstream hourly.
    await Promise.all(
      markets
        .filter((m) => !pts.get(m.id)?.length)
        .map(async (m) => {
          const h =
            m.platform === "polymarket"
              ? await fetchPmHistory(m.tokenId!, start, end, 60).catch(() => [])
              : await fetchKalshiHistory(m.seriesTicker!, m.externalId, start, end, 60).catch(() => []);
          pts.set(m.id, h);
        }),
    );
  }

  const series = Object.fromEntries(
    PLATFORMS.map((p) => [
      p,
      mk && (mk[p].D || mk[p].R)
        ? demProbSeries({ D: mk[p].D && pts.get(mk[p].D!.id), R: mk[p].R && pts.get(mk[p].R!.id) }, start, end, step)
        : [],
    ]),
  ) as Record<Platform, Pt[]>;

  // Daily poll-average lines (per lean group) for the longer ranges.
  let polls: Record<LeanGroup, PollPt[]> | null = null;
  if (range === "1w" || range === "30d" || range === "all") {
    const [[race], pollMap, leanOf] = await Promise.all([
      db.select().from(schema.races).where(eq(schema.races.key, key)),
      pollsFor([key]),
      leanMap(),
    ]);
    const rp = pollMap.get(key) ?? [];
    if (rp.length && race) polls = dailyPollLines(rp, race.office, leanOf, start, end);
  }

  return { key, range, step, start, end, series, polls, calledAt: null as string | null };
}

// ---------------------------------------------------------------- accuracy

/** Morning of election day, before polls open anywhere (6am ET). */
export const ELECTION_MORNING = Date.parse("2026-11-03T11:00:00Z");
export const CHECKPOINTS = { "30d": 30, "7d": 7, "1d": 1, "0d": 0 } as const;
export type Checkpoint = keyof typeof CHECKPOINTS;

export async function priceAt(ids: string[], at: Date) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db.execute<{ market_id: string; price: number }>(sql`
    select distinct on (market_id) market_id, price from price_points
    where market_id in ${ids} and ts <= ${at.toISOString()}
    order by market_id, ts desc`);
  return new Map(rows.map((r) => [r.market_id, r.price]));
}

const brier = (p: number, y: number) => (p - y) ** 2;
const logLoss = (p: number, y: number) => {
  const q = Math.min(Math.max(p, 0.001), 0.999);
  return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
};

export async function accuracy(checkpoint: Checkpoint = "1d", office?: string) {
  const at = new Date(ELECTION_MORNING - CHECKPOINTS[checkpoint] * 86400_000);
  const races = await db
    .select()
    .from(schema.races)
    .where(
      and(
        sql`${schema.races.winnerParty} in ('D','R')`,
        office ? eq(schema.races.office, office) : undefined,
        sql`${schema.races.office} <> 'generic'`,
      ),
    );
  const keys = races.map((r) => r.key);
  const [pm, polls, leanOf] = await Promise.all([primaryMarkets(keys), pollsFor(keys), leanMap()]);
  const allIds = [...pm.values()].flatMap((x) => PLATFORMS.flatMap((p) => [x[p].D?.id, x[p].R?.id])).filter(Boolean) as string[];
  const prices = await priceAt(allIds, at);

  type Src = Platform | `polls:${LeanGroup}`;
  const sources: Src[] = [...PLATFORMS, ...LEAN_GROUPS.map((g) => `polls:${g}` as const)];
  const perRace = races.map((r) => {
    const mk = pm.get(r.key);
    const probs: Partial<Record<Src, number | null>> = {};
    for (const p of PLATFORMS) {
      probs[p] = mk ? demProb(mk[p].D && prices.get(mk[p].D!.id), mk[p].R && prices.get(mk[p].R!.id)) : null;
    }
    const rp = polls.get(r.key) ?? [];
    const pollMargins: Partial<Record<LeanGroup, number | null>> = {};
    for (const g of LEAN_GROUPS) {
      const a = pollAverage(rp.filter((p) => inGroup(p, g, leanOf)), at);
      pollMargins[g] = a?.margin ?? null;
      probs[`polls:${g}`] = a ? marginToProb(a.margin, r.office) : null;
    }
    const actualMargin = r.demPct != null && r.repPct != null ? r.demPct - r.repPct : null;
    return { key: r.key, title: r.title, office: r.office, winner: r.winnerParty, actualMargin, demWinProb: probs, pollMargins };
  });

  const summary = Object.fromEntries(
    sources.map((s) => {
      const scored = perRace.filter((r) => r.demWinProb[s] != null);
      const y = (r: (typeof perRace)[number]) => (r.winner === "D" ? 1 : 0);
      const n = scored.length;
      const g = s.startsWith("polls:") ? (s.slice(6) as LeanGroup) : null;
      const withMargin = g ? perRace.filter((r) => r.pollMargins[g] != null && r.actualMargin != null) : [];
      return [
        s,
        n
          ? {
              n,
              brier: scored.reduce((a, r) => a + brier(r.demWinProb[s]!, y(r)), 0) / n,
              logLoss: scored.reduce((a, r) => a + logLoss(r.demWinProb[s]!, y(r)), 0) / n,
              correct: scored.filter((r) => (r.demWinProb[s]! > 0.5 ? 1 : 0) === y(r)).length / n,
              // polls only: signed error of D−R margin (+ = overstated Democrats)
              marginBias: withMargin.length
                ? withMargin.reduce((a, r) => a + (r.pollMargins[g!]! - r.actualMargin!), 0) / withMargin.length
                : null,
              marginMae: withMargin.length
                ? withMargin.reduce((a, r) => a + Math.abs(r.pollMargins[g!]! - r.actualMargin!), 0) / withMargin.length
                : null,
            }
          : null,
      ];
    }),
  );

  // Calibration for markets: bucket the favourite's probability.
  const calibration = Object.fromEntries(
    PLATFORMS.map((p) => {
      const bins = Array.from({ length: 5 }, (_, i) => ({ lo: 0.5 + i * 0.1, hi: 0.6 + i * 0.1, n: 0, wins: 0 }));
      for (const r of perRace) {
        const pd = r.demWinProb[p];
        if (pd == null) continue;
        const fav = Math.max(pd, 1 - pd);
        const favWon = (pd >= 0.5) === (r.winner === "D");
        const b = bins[Math.min(4, Math.floor((fav - 0.5) / 0.1))];
        b.n++;
        if (favWon) b.wins++;
      }
      return [p, bins];
    }),
  );

  const pending = await db.$count(schema.races, sql`${schema.races.winnerParty} is null and ${schema.races.office} <> 'generic'`);
  return { checkpoint, asOf: at.toISOString(), resolved: perRace.length, pending, summary, calibration, races: perRace };
}

export async function pipelineStatus() {
  return db
    .select()
    .from(schema.pipelineRuns)
    .orderBy(desc(schema.pipelineRuns.startedAt))
    .limit(20);
}

export async function listPollsters() {
  return db.select().from(schema.pollsters).orderBy(desc(schema.pollsters.houseEffectN));
}

export async function listPolls(raceKey?: string, lean?: string, limit = 200) {
  const leanOf = await leanMap();
  const rows = await db
    .select()
    .from(schema.polls)
    .where(and(raceKey ? eq(schema.polls.raceKey, raceKey) : undefined, gte(schema.polls.endDate, "2025-01-01"), lte(schema.polls.endDate, "2027-12-31")))
    .orderBy(desc(schema.polls.endDate))
    .limit(lean ? 5000 : limit);
  const out = rows.map((p) => ({ ...p, pollsterLean: leanOf(p.pollster) }));
  return lean ? out.filter((p) => p.pollsterLean === lean || p.partisan === lean).slice(0, limit) : out;
}

// ---------------------------------------------------------------- screens

/** Stored P(D) lines for many races at once (for tiles and row sparklines). Values only, 0..1. */
export async function sparklines(raceKeys: string[], start: number, step: number) {
  const pm = await primaryMarkets(raceKeys);
  const end = Math.floor(Date.now() / 1000);
  const ids = [...pm.values()].flatMap((x) => PLATFORMS.flatMap((p) => [x[p].D?.id, x[p].R?.id])).filter(Boolean) as string[];
  const pts = await storedHistory(ids, start);
  const out = new Map<string, Record<Platform, number[]>>();
  for (const [key, mk] of pm) {
    out.set(
      key,
      Object.fromEntries(
        PLATFORMS.map((p) => [
          p,
          demProbSeries({ D: mk[p].D && pts.get(mk[p].D!.id), R: mk[p].R && pts.get(mk[p].R!.id) }, start, end, step).map((x) => x.p),
        ]),
      ) as Record<Platform, number[]>,
    );
  }
  return out;
}

export type RaceRow = Awaited<ReturnType<typeof listRaces>>[number];
const volumeOf = (r: RaceRow) => (r.markets.polymarket?.volume ?? 0) + (r.markets.kalshi?.volume ?? 0);

/** Overview: chamber control now + "races to watch" (contested, split calls first, then by volume). */
export async function overview() {
  const races = await listRaces();
  const control = Object.fromEntries(
    ["SENATE", "HOUSE"].map((c) => {
      const r = races.find((x) => x.key === `CONTROL-${c}`);
      return [c.toLowerCase(), { p: r?.markets.polymarket?.demWinProb ?? null, k: r?.markets.kalshi?.demWinProb ?? null }];
    }),
  ) as Record<"senate" | "house", { p: number | null; k: number | null }>;

  const contested = races
    .filter((r) => ["senate", "governor", "house"].includes(r.office))
    .map((r) => ({ r, p: r.markets.polymarket?.demWinProb, k: r.markets.kalshi?.demWinProb }))
    .filter((x) => x.p != null && x.k != null && (x.p + x.k) / 2 >= 0.12 && (x.p + x.k) / 2 <= 0.88)
    .map((x) => ({ ...x, split: x.p! > 0.5 !== x.k! > 0.5 }))
    .sort((a, b) => Number(b.split) - Number(a.split) || volumeOf(b.r) - volumeOf(a.r))
    .slice(0, 12);

  const start = Math.floor(Date.now() / 1000) - 30 * 86400;
  const spark = await sparklines(contested.map((x) => x.r.key), start, 12 * 3600);
  return {
    control,
    watch: contested.map(({ r, p, k }) => ({
      key: r.key,
      office: r.office,
      state: r.state,
      title: r.title,
      p: p!,
      k: k!,
      spark: spark.get(r.key) ?? { polymarket: [], kalshi: [] },
    })),
  };
}

/** Seats not up in 2026 (Dem caucus incl. King and Sanders). */
const SENATE_HOLDOVER = { D: 34, R: 31 };

/** Everything the Live screen needs: chambers, rows with poll-close vs. now odds, scorecard. */
export async function liveBoard() {
  const nowMs = Date.now();
  const all = await listRaces();
  const races = all.filter((r) => ["senate", "governor", "house"].includes(r.office));

  // Odds at each state's poll close (grouped by close time to keep it to a few queries).
  const pm = await primaryMarkets(races.map((r) => r.key));
  const byClose = new Map<number, string[]>();
  for (const r of races) {
    const at = pollCloseAt(r.state);
    if (at <= nowMs) byClose.set(at, [...(byClose.get(at) ?? []), r.key]);
  }
  const closeOdds = new Map<string, Record<Platform, number | null>>();
  await Promise.all(
    [...byClose].map(async ([at, keys]) => {
      const ids = keys.flatMap((k) => PLATFORMS.flatMap((p) => [pm.get(k)?.[p].D?.id, pm.get(k)?.[p].R?.id])).filter(Boolean) as string[];
      const prices = await priceAt(ids, new Date(at));
      for (const k of keys) {
        const mk = pm.get(k);
        closeOdds.set(
          k,
          Object.fromEntries(
            PLATFORMS.map((p) => [p, mk ? demProb(mk[p].D && prices.get(mk[p].D!.id), mk[p].R && prices.get(mk[p].R!.id)) : null]),
          ) as Record<Platform, number | null>,
        );
      }
    }),
  );

  // Sparklines: tonight once polls start closing, else the last 24 hours.
  const sparkStart = Math.floor((nowMs >= NIGHT_START ? NIGHT_START : nowMs - 86400_000) / 1000);
  const spark = await sparklines(races.map((r) => r.key), sparkStart, 1800);

  const rows = races
    .map((r) => ({
      key: r.key,
      office: r.office,
      state: r.state,
      title: r.title,
      names: r.names,
      volume: volumeOf(r),
      p: r.markets.polymarket?.demWinProb ?? null,
      k: r.markets.kalshi?.demWinProb ?? null,
      p0: closeOdds.get(r.key)?.polymarket ?? null,
      k0: closeOdds.get(r.key)?.kalshi ?? null,
      winner: r.winnerParty,
      demPct: r.demPct,
      repPct: r.repPct,
      calledAt: r.calledAt?.toISOString() ?? null,
      spark: spark.get(r.key) ?? { polymarket: [], kalshi: [] },
    }))
    .sort((a, b) => Number(!!a.winner) - Number(!!b.winner) || b.volume - a.volume);

  const chamber = (office: "senate" | "house") => {
    const rs = rows.filter((r) => r.office === office);
    const base = office === "senate" ? SENATE_HOLDOVER : { D: 0, R: 0 };
    const d = base.D + rs.filter((r) => r.winner === "D").length;
    const rep = base.R + rs.filter((r) => r.winner === "R").length;
    return {
      total: office === "senate" ? 100 : 435,
      need: office === "senate" ? 51 : 218,
      d,
      r: rep,
      uncalled: rs.filter((r) => !r.winner).length,
    };
  };

  // Chamber control odds at first poll close, for "change since poll close".
  const ctl = await primaryMarkets(["CONTROL-SENATE", "CONTROL-HOUSE"]);
  const ctlIds = [...ctl.values()].flatMap((x) => PLATFORMS.flatMap((p) => [x[p].D?.id, x[p].R?.id])).filter(Boolean) as string[];
  const ctlPrices = nowMs >= NIGHT_START ? await priceAt(ctlIds, new Date(NIGHT_START)) : new Map<string, number>();
  const controlAt = (key: string) => {
    const mk = ctl.get(key);
    const nowR = all.find((r) => r.key === key);
    return Object.fromEntries(
      PLATFORMS.map((p) => [
        p,
        {
          now: nowR?.markets[p]?.demWinProb ?? null,
          close: mk && ctlPrices.size ? demProb(mk[p].D && ctlPrices.get(mk[p].D!.id), mk[p].R && ctlPrices.get(mk[p].R!.id)) : null,
        },
      ]),
    ) as Record<Platform, { now: number | null; close: number | null }>;
  };

  // Scorecard: called races, odds at poll close. "Right" = winner above 50%.
  const called = rows.filter((r) => r.winner === "D" || r.winner === "R");
  const score = Object.fromEntries(
    PLATFORMS.map((p) => {
      const key = p === "polymarket" ? "p0" : "k0";
      const scored = called.filter((r) => r[key] != null);
      const y = (r: (typeof rows)[number]) => (r.winner === "D" ? 1 : 0);
      return [
        p,
        {
          n: scored.length,
          right: scored.filter((r) => (r[key]! > 0.5 ? 1 : 0) === y(r)).length,
          brier: scored.length ? scored.reduce((a, r) => a + brier(r[key]!, y(r)), 0) / scored.length : null,
        },
      ];
    }),
  ) as Record<Platform, { n: number; right: number; brier: number | null }>;

  return {
    now: nowMs,
    chambers: { senate: chamber("senate"), house: chamber("house") },
    control: { senate: controlAt("CONTROL-SENATE"), house: controlAt("CONTROL-HOUSE") },
    called: called.length,
    score,
    rows,
  };
}

/** Compact index for the header search: every race with all known candidate names and current odds. */
export async function searchIndex() {
  const [races, cands] = await Promise.all([
    listRaces(),
    db.select({ raceKey: schema.candidates.raceKey, name: schema.candidates.name }).from(schema.candidates),
  ]);
  const byRace = new Map<string, Set<string>>();
  for (const c of cands) byRace.set(c.raceKey, (byRace.get(c.raceKey) ?? new Set()).add(c.name));
  return races
    .filter((r) => r.office !== "generic")
    .map((r) => ({
      key: r.key,
      office: r.office,
      state: r.state,
      title: r.title,
      // Main D/R names first, then everyone else the markets list.
      names: [...new Set([...r.names, ...(byRace.get(r.key) ?? [])])],
      p: r.markets.polymarket?.demWinProb ?? null,
      k: r.markets.kalshi?.demWinProb ?? null,
      volume: volumeOf(r),
    }));
}

/**
 * Markets vs polls: for every race with both, the markets' P(D) next to the poll-implied P(D),
 * from all polls and from nonpartisan polls only.
 */
export async function marketsVsPolls() {
  const races = (await listRaces()).filter(
    (r) => ["senate", "governor", "house"].includes(r.office) && r.pollCount && (r.markets.polymarket || r.markets.kalshi),
  );
  const keys = races.map((r) => r.key);
  const [polls, leanOf] = await Promise.all([pollsFor(keys), leanMap()]);
  const now = new Date();
  return races
    .map((r) => {
      const g = groupAverages(polls.get(r.key) ?? [], now, r.office, leanOf);
      const p = r.markets.polymarket?.demWinProb ?? null;
      const k = r.markets.kalshi?.demWinProb ?? null;
      const both = [p, k].filter((x): x is number => x != null);
      const avg = (x: (typeof g)["all"]) => x && { margin: x.margin, p: x.demWinProb, polls: x.polls, pollsters: x.pollsters };
      return {
        key: r.key,
        office: r.office,
        state: r.state,
        title: r.title,
        names: r.names,
        volume: volumeOf(r),
        markets: { polymarket: p, kalshi: k, avg: both.reduce((a, b) => a + b, 0) / both.length },
        polls: { all: avg(g.all), nonpartisan: avg(g.nonpartisan) },
      };
    })
    .filter((r) => r.polls.all);
}
export type MarketsVsPolls = Awaited<ReturnType<typeof marketsVsPolls>>;
