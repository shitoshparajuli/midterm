/**
 * "Races to watch": the races people are putting money on and reading about, with a small nudge
 * toward close ones. Pure: the Overview shows the current pick, and each lock freezes its own pick,
 * which becomes the "watch" scope on the Scorecard.
 */

export const WATCH_COUNT = 12;
/** Volume and online attention decide the list; closeness only breaks near-ties. */
export const WATCH_WEIGHTS = { volume: 0.45, attention: 0.45, closeness: 0.1 };
/** Races the markets already treat as settled (average D chance outside 12–88%) aren't eligible. */
const BAND: [number, number] = [0.12, 0.88];
/** Days of Wikipedia pageviews that count as current attention. */
export const ATTENTION_DAYS = 7;

export interface WatchInput {
  key: string;
  p: number; // Polymarket P(D)
  k: number; // Kalshi P(D)
  pmVolume: number; // dollars
  kVolume: number; // contracts
  views: number; // pageviews over ATTENTION_DAYS
}

/** A pick, with each component as 0..1 so the ranking can be explained. */
export interface WatchPick {
  key: string;
  rank: number;
  score: number;
  volume: number;
  attention: number;
  closeness: number;
  views: number;
}

/** Percentile rank (0 = lowest, 1 = highest) of each value; ties share their average rank. */
function pctRank(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 1);
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const below = sorted.findIndex((x) => x >= v);
    const equal = sorted.lastIndexOf(v) - below;
    return (below + equal / 2) / (values.length - 1);
  });
}

export function pickWatch(inputs: WatchInput[], n = WATCH_COUNT): WatchPick[] {
  const pool = inputs.filter((x) => {
    const avg = (x.p + x.k) / 2;
    return avg >= BAND[0] && avg <= BAND[1];
  });
  // Each platform's volume is ranked on its own (Polymarket reports dollars, Kalshi contracts).
  const pm = pctRank(pool.map((x) => x.pmVolume));
  const k = pctRank(pool.map((x) => x.kVolume));
  const views = pctRank(pool.map((x) => x.views));
  return pool
    .map((x, i) => {
      const volume = (pm[i] + k[i]) / 2;
      const attention = views[i];
      const closeness = 1 - Math.abs((x.p + x.k) / 2 - 0.5) * 2;
      const score = WATCH_WEIGHTS.volume * volume + WATCH_WEIGHTS.attention * attention + WATCH_WEIGHTS.closeness * closeness;
      return { key: x.key, score, volume, attention, closeness, views: x.views };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}
