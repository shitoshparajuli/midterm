/**
 * Scoring locked projections against results. Pure: used by the `scores` pipeline step (which
 * stores the numbers) and the Scorecard page (which shows them).
 */

export interface ForecastRow {
  raceKey: string;
  source: string;
  demWinProb: number | null;
  margin: number | null;
}
export interface RaceResult {
  key: string;
  office: string;
  state: string | null;
  winnerParty: string | null;
  demPct: number | null;
  repPct: number | null;
}

export interface Score {
  n: number;
  correct: number;
  brier: number | null;
  logLoss: number | null;
  avgWinnerProb: number | null;
  marginN: number;
  marginBias: number | null;
  marginMae: number | null;
}

/** Sources shown as first-class rows; individual pollsters are `pollster:<name>`. */
export const MAIN_SOURCES = ["polymarket", "kalshi", "polls:all", "polls:nonpartisan", "polls:D", "polls:R"] as const;
export const SOURCE_LABEL: Record<string, string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  "polls:all": "Poll average",
  "polls:nonpartisan": "Nonpartisan polls",
  "polls:D": "Left-leaning polls",
  "polls:R": "Right-leaning polls",
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s.replace(/^pollster:/, "");

const clamp = (p: number) => Math.min(Math.max(p, 0.001), 0.999);

/** A race counts once its winner is D or R (independents/others can't be scored on P(D)). */
export const scorable = (r: RaceResult) => r.winnerParty === "D" || r.winnerParty === "R";
export const actualMargin = (r: RaceResult) => (r.demPct != null && r.repPct != null ? r.demPct - r.repPct : null);

/** Credit for calling the winner: 1 right, 0 wrong, ½ for an exact coin flip. */
export const callCredit = (p: number, demWon: boolean): number => (p === 0.5 ? 0.5 : p > 0.5 === demWon ? 1 : 0);

export function score(rows: { p: number | null; margin: number | null; race: RaceResult }[]): Score {
  const probs = rows.filter((r) => r.p != null && scorable(r.race));
  const n = probs.length;
  const y = (r: (typeof probs)[number]) => (r.race.winnerParty === "D" ? 1 : 0);
  const margins = rows.filter((r) => r.margin != null && actualMargin(r.race) != null);
  const errs = margins.map((r) => r.margin! - actualMargin(r.race)!);
  return {
    n,
    correct: probs.reduce((a, r) => a + callCredit(r.p!, y(r) === 1), 0),
    brier: n ? probs.reduce((a, r) => a + (r.p! - y(r)) ** 2, 0) / n : null,
    logLoss: n ? probs.reduce((a, r) => a - (y(r) * Math.log(clamp(r.p!)) + (1 - y(r)) * Math.log(1 - clamp(r.p!))), 0) / n : null,
    avgWinnerProb: n ? probs.reduce((a, r) => a + (y(r) ? r.p! : 1 - r.p!), 0) / n : null,
    marginN: errs.length,
    marginBias: errs.length ? errs.reduce((a, e) => a + e, 0) / errs.length : null,
    marginMae: errs.length ? errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length : null,
  };
}

/** Scopes a race falls into. Chamber control is scored on its own, never in "all". */
export function scopesOf(r: RaceResult) {
  if (r.office === "control") return ["office:control"];
  return ["all", `office:${r.office}`, ...(r.state ? [`state:${r.state}`] : [])];
}

/** Every (source, scope) score. Individual pollsters get "all" and office scopes only. */
export function scoreAll(forecasts: ForecastRow[], races: RaceResult[]) {
  const byKey = new Map(races.map((r) => [r.key, r]));
  const groups = new Map<string, { p: number | null; margin: number | null; race: RaceResult }[]>();
  for (const f of forecasts) {
    const race = byKey.get(f.raceKey);
    if (!race) continue;
    const pollster = f.source.startsWith("pollster:");
    for (const scope of scopesOf(race)) {
      if (pollster && scope.startsWith("state:")) continue;
      const k = `${f.source}\u0000${scope}`;
      groups.set(k, [...(groups.get(k) ?? []), { p: f.demWinProb, margin: f.margin, race }]);
    }
  }
  return [...groups].map(([k, rows]) => {
    const [source, scope] = k.split("\u0000");
    return { source, scope, ...score(rows) };
  });
}

/** Calibration: bucket the favourite's chance (50–60%, …, 90–100%) and count how often they won. */
export function calibration(rows: { p: number | null; race: RaceResult }[]) {
  const bins = Array.from({ length: 5 }, (_, i) => ({ lo: 0.5 + i * 0.1, hi: 0.6 + i * 0.1, n: 0, wins: 0, pSum: 0 }));
  for (const r of rows) {
    if (r.p == null || !scorable(r.race) || r.race.office === "control") continue;
    const fav = Math.max(r.p, 1 - r.p);
    const favWon = r.p >= 0.5 === (r.race.winnerParty === "D");
    const b = bins[Math.min(4, Math.floor((fav - 0.5) / 0.1))];
    b.n++;
    b.pSum += fav;
    if (favWon) b.wins++;
  }
  return bins.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, winRate: b.n ? b.wins / b.n : null, avgP: b.n ? b.pSum / b.n : null }));
}
