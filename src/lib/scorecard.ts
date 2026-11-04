/**
 * Scorecard data from a lock's projections and the results. Pure: fed by the database during a
 * cycle (`scorecard()` in forecasts.ts) or by an archived lock afterwards (archive.ts).
 */
import { FINAL_LOCK_AT } from "./election";
import { calibration, MAIN_SOURCES, scoreAll, withTimesSiena, type ForecastRow, type RaceResult } from "./scoring";
import { byDisagreement, compareRace } from "./vs-polls";
import type { WatchPick } from "./watch";

export type LockedForecast = ForecastRow & { detail: unknown };
export type ScorecardRace = RaceResult & { title: string };

const MAIN_SCOPES = ["all", "office:senate", "office:governor", "office:house", "office:control", "watch"] as const;

export function buildScorecard({
  lock,
  forecasts: locked,
  races: allRaces,
  leanOf,
  watch,
}: {
  /** `preview`: no lock yet, these are today's numbers. `archived`: served from data/archive/. */
  lock: { id: string; asOf: Date; preview: boolean; archived: boolean };
  forecasts: LockedForecast[];
  races: ScorecardRace[];
  leanOf: (pollster: string) => string | null;
  /** "Races to watch" in rank order: frozen with the lock, or today's pick in a preview. */
  watch: WatchPick[];
}) {
  const forecasts = withTimesSiena(locked);
  const races = allRaces.filter((r) => r.office !== "generic");
  const scores = scoreAll(forecasts, races, new Set(watch.map((w) => w.key)));
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
  const rows = [...byRace].flatMap(([key, f]) => {
    const r = raceByKey.get(key);
    return r ? [{ key, office: r.office, state: r.state, title: r.title, winner: r.winnerParty, demPct: r.demPct, repPct: r.repPct, f }] : [];
  });

  // Where markets and nonpartisan polls disagreed most, ranked as on the Markets vs polls page.
  const pollAvg = new Map<string, { margin: number; p: number | null; polls: number; pollsters: number }>();
  for (const f of forecasts) {
    if ((f.source !== "polls:all" && f.source !== "polls:nonpartisan") || f.margin == null) continue;
    const d = f.detail as { polls?: number; pollsters?: number } | null;
    pollAvg.set(`${f.raceKey} ${f.source}`, { margin: f.margin, p: f.demWinProb ?? null, polls: d?.polls ?? 1, pollsters: d?.pollsters ?? 1 });
  }
  const vsPolls = rows
    .flatMap(({ f, ...r }) => {
      const both = [f.polymarket?.p, f.kalshi?.p].filter((x): x is number => x != null);
      const all = pollAvg.get(`${r.key} polls:all`);
      if (r.office === "control" || !all || !both.length) return [];
      const markets = { polymarket: f.polymarket?.p ?? null, kalshi: f.kalshi?.p ?? null, avg: both.reduce((a, b) => a + b, 0) / both.length };
      const polls = { all, nonpartisan: pollAvg.get(`${r.key} polls:nonpartisan`) ?? null };
      return [compareRace({ ...r, markets, polls, siena: f["times-siena"] ?? null }, "nonpartisan")];
    })
    .filter((r) => !r.fallback)
    .sort(byDisagreement)
    .slice(0, 10);

  const calib = (source: string) =>
    calibration(forecasts.filter((f) => f.source === source).flatMap((f) => (raceByKey.has(f.raceKey) ? [{ p: f.demWinProb ?? null, race: raceByKey.get(f.raceKey)! }] : [])));

  return {
    lock: { ...lock, asOf: lock.asOf.toISOString() },
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
    watch,
    /** Top 10 market-vs-poll disagreements in the projections. */
    vsPolls,
  };
}

export type Scorecard = ReturnType<typeof buildScorecard>;

/** One row per race and source with the result alongside: the lock's CSV download. */
export function lockCsvText(data: { lockId: string; asOf: string; watch: WatchPick[]; forecasts: LockedForecast[]; races: Map<string, ScorecardRace & { calledAt?: Date | string | null; resultSource?: string | null }> }) {
  const watchRank = new Map(data.watch.map((w) => [w.key, w.rank]));
  const cols = ["lock_id", "as_of", "race_key", "office", "state", "watch_rank", "source", "dem_win_prob", "margin", "winner_party", "dem_pct", "rep_pct", "called_at", "result_source"];
  const cell = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...data.forecasts]
    .filter((f) => data.races.has(f.raceKey))
    .sort((a, b) => a.raceKey.localeCompare(b.raceKey) || a.source.localeCompare(b.source))
    .map((f) => {
      const r = data.races.get(f.raceKey)!;
      return [data.lockId, data.asOf, f.raceKey, r.office, r.state, watchRank.get(f.raceKey) ?? null, f.source, f.demWinProb, f.margin, r.winnerParty, r.demPct, r.repPct, r.calledAt, r.resultSource];
    });
  return [cols.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}
