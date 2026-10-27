/** Markets vs polls comparison rules. Pure: shared by the page and the Overview card. */
import type { MarketsVsPolls } from "./queries";

export type Basis = "nonpartisan" | "all";
/** Same favorite, but this far apart (0..1) still counts as a notable gap. */
export const BIG_GAP = 0.15;

export function compareRace(r: MarketsVsPolls[number], basis: Basis) {
  const fallback = basis === "nonpartisan" && !r.polls.nonpartisan;
  const poll = (basis === "nonpartisan" ? r.polls.nonpartisan : null) ?? r.polls.all!;
  const m = r.markets.avg;
  const pp = poll.p ?? 0.5;
  const gap = m - pp;
  // A tied poll average (exactly 50%) has no favorite, so it can't disagree.
  const split = pp !== 0.5 && m !== 0.5 && m > 0.5 !== pp > 0.5;
  return { ...r, poll, pollP: pp, fallback, gap, split, big: !split && Math.abs(gap) >= BIG_GAP };
}
export type Compared = ReturnType<typeof compareRace>;

/** Size of the gap, discounted when few polls back it up (1 poll counts half, 4+ in full). */
export const strength = (r: Compared) => Math.abs(r.gap) * Math.sqrt(Math.min(r.poll.polls, 4) / 4);

/** Disagreements first (different favorite, then big gaps), strongest first. */
export const byDisagreement = (a: Compared, b: Compared) =>
  Number(b.split) - Number(a.split) || Number(b.big) - Number(a.big) || strength(b) - strength(a);
