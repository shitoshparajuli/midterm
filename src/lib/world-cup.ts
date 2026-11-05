/**
 * "Did the World Cup move votes?": data/analysis/world-cup.json, built by `pnpm analysis:world-cup`
 * (scripts/world-cup.ts). Margins are D minus R as a share of the two-party vote, in points;
 * a swing is the change in that margin, positive toward Democrats. Pure and client-safe.
 */

export interface HouseResult {
  district: string;
  /** Two-party D−R margin; null when one party had no candidate. */
  margin: number | null;
  winner: "D" | "R" | null;
}

export interface Place {
  city: string;
  stadium: string;
  /** Where the stadium is, when the metro's name doesn't say. */
  site: string | null;
  fips: string;
  county: string;
  state: string;
  /** The 2026 race the swing is measured on: "Senate", "Governor" or "House" (every district summed). */
  race: string | null;
  m20: number | null;
  m24: number | null;
  m26: number | null;
  swing: number | null;
  /** The same swing for the state with this county taken out. */
  restSwing: number | null;
  /** swing − restSwing: how much more this county moved toward Democrats than the rest of its state. */
  gap: number | null;
  /** Share of the expected 2026 vote counted. */
  counted: number | null;
  /** 2026 votes as a share of 2024's, relative to the rest of the state (0.03 = 3% higher turnout). */
  turnoutGap: number | null;
  senate24: number | null;
  house24: HouseResult;
  house26: HouseResult;
}

export interface County {
  fips: string;
  name: string;
  state: string;
  votes24: number;
  m24: number;
  /** m24 − m20: the 2020 → 2024 presidential swing. */
  shift24: number;
  swing: number;
  gap: number;
  counted: number;
  turnoutGap: number | null;
}

export interface WorldCupData {
  /** Latest result update across the races used. */
  asOf: string;
  /** Counties with less of their vote counted are shown but left out of averages. */
  minCounted: number;
  /** A "big county" cast at least this many votes in 2024. */
  minVotes: number;
  hosts: Place[];
  /** US finalists FIFA passed over in June 2022. */
  notPicked: Place[];
  /** Every big county with a 2026 statewide (or all-House) race. */
  big: County[];
  stats: {
    host: { n: number; swing: number; restSwing: number; gap: number; turnoutGap: number };
    notPicked: { n: number; gap: number };
    /** Gaps of big counties other than the hosts, counted ≥ minCounted. */
    others: { n: number; p10: number; p25: number; p50: number; p75: number; p90: number };
    /** Share of random same-size draws from `others` whose average gap is at least as far from zero as the hosts'. */
    chance: number;
    /** gap ≈ a + b × shift24, fit on `others`; sd is the typical distance of a county from that line. */
    trend: { a: number; b: number; sd: number };
    /** Host gaps minus the trend, averaged. */
    hostVsTrend: number;
  };
}

/** "+2.1" / "−0.4" / "0.0" */
export function signed(v: number, d = 1) {
  const s = Math.abs(v).toFixed(d);
  return Number(s) === 0 ? s : `${v > 0 ? "+" : "−"}${s}`;
}
