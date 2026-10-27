import { marginToProb } from "./stats";

export type LeanGroup = "all" | "nonpartisan" | "D" | "R";
export const LEAN_GROUPS: LeanGroup[] = ["all", "nonpartisan", "D", "R"];

export interface PollLite {
  pollster: string;
  endDate: string; // YYYY-MM-DD
  margin: number | null;
  sampleSize: number | null;
  partisan: string | null;
  internal: boolean;
}

const DAY = 86400_000;
const HALF_LIFE_DAYS = 14;

export function inGroup(p: PollLite, group: LeanGroup, leanOf: (pollster: string) => string | null) {
  switch (group) {
    case "all":
      return true;
    case "nonpartisan":
      return !p.partisan && !p.internal && leanOf(p.pollster) !== "D" && leanOf(p.pollster) !== "R";
    case "D":
    case "R":
      // A poll counts for a side if the pollster leans that way OR a party/campaign sponsored it.
      return leanOf(p.pollster) === group || p.partisan === group;
  }
}

/**
 * Recency- and size-weighted average D−R margin as of `asOf`.
 * Each pollster's weight is split across its polls so prolific firms can't dominate.
 */
export function pollAverage(polls: PollLite[], asOf: Date, windowDays = 45) {
  const cutoff = asOf.getTime();
  let window = polls.filter((p) => {
    const t = Date.parse(p.endDate);
    return p.margin !== null && t <= cutoff && t >= cutoff - windowDays * DAY;
  });
  if (!window.length) {
    // Sparse races: fall back to a longer window rather than showing nothing.
    window = polls.filter((p) => {
      const t = Date.parse(p.endDate);
      return p.margin !== null && t <= cutoff && t >= cutoff - 120 * DAY;
    });
  }
  if (!window.length) return null;

  const perPollster = new Map<string, number>();
  for (const p of window) perPollster.set(p.pollster, (perPollster.get(p.pollster) ?? 0) + 1);

  let wSum = 0;
  let mSum = 0;
  for (const p of window) {
    const ageDays = (cutoff - Date.parse(p.endDate)) / DAY;
    const w =
      Math.pow(0.5, ageDays / HALF_LIFE_DAYS) *
      Math.sqrt(Math.min(p.sampleSize ?? 600, 2000) / 600) /
      perPollster.get(p.pollster)!;
    wSum += w;
    mSum += w * p.margin!;
  }
  return {
    margin: Math.round((mSum / wSum) * 10) / 10,
    polls: window.length,
    pollsters: perPollster.size,
  };
}

export function groupAverages(
  polls: PollLite[],
  asOf: Date,
  office: string,
  leanOf: (pollster: string) => string | null,
) {
  return Object.fromEntries(
    LEAN_GROUPS.map((g) => {
      const avg = pollAverage(polls.filter((p) => inGroup(p, g, leanOf)), asOf);
      return [g, avg && { ...avg, demWinProb: marginToProb(avg.margin, office) }];
    }),
  ) as Record<LeanGroup, (ReturnType<typeof pollAverage> & { demWinProb: number | null }) | null>;
}
