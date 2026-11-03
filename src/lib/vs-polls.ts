/** Markets vs polls comparison rules. Pure: shared by the page, the Overview card and the Scorecard. */
import type { MarketsVsPolls } from "./queries";

export type Basis = "nonpartisan" | "all";
/** Same favorite, but this far apart (0..1) still counts as a notable gap. */
export const BIG_GAP = 0.15;

type PollAvg = { margin: number; p: number | null; polls: number; pollsters: number };
/** What a comparison needs: live rows from `marketsVsPolls()` or rows rebuilt from a lock. */
export type VsInput = {
  markets: { polymarket: number | null; kalshi: number | null; avg: number };
  polls: { all: PollAvg | null; nonpartisan: PollAvg | null };
};

export function compareRace<T extends VsInput>(r: T, basis: Basis) {
  const fallback = basis === "nonpartisan" && !r.polls.nonpartisan;
  const poll = (basis === "nonpartisan" ? r.polls.nonpartisan : null) ?? r.polls.all!;
  const m = r.markets.avg;
  const pp = poll.p ?? 0.5;
  const gap = m - pp;
  // A tied poll average (exactly 50%) has no favorite, so it can't disagree.
  const split = pp !== 0.5 && m !== 0.5 && m > 0.5 !== pp > 0.5;
  return { ...r, poll, pollP: pp, fallback, gap, split, big: !split && Math.abs(gap) >= BIG_GAP };
}
export type Compared = ReturnType<typeof compareRace<MarketsVsPolls[number]>>;
type Ranked = Pick<Compared, "gap" | "split" | "big"> & { poll: { polls: number } };

/** Size of the gap, discounted when few polls back it up (1 poll counts half, 4+ in full). */
export const strength = (r: Ranked) => Math.abs(r.gap) * Math.sqrt(Math.min(r.poll.polls, 4) / 4);

/** Disagreements first (different favorite, then big gaps), strongest first. */
export const byDisagreement = (a: Ranked, b: Ranked) =>
  Number(b.split) - Number(a.split) || Number(b.big) - Number(a.big) || strength(b) - strength(a);
