/**
 * Turning per-market price points into one "probability Democrat wins" line per platform.
 * Used by both the live (upstream) and stored (DB) chart paths.
 */
export type Pt = { t: number; p: number };

export interface PartyMarkets {
  D?: Pt[];
  R?: Pt[];
}

/**
 * Bucket to `step` seconds, forward-fill each side, and de-vig:
 *   pD = D / (D + R)   when both sides exist, else D, else 1 - R.
 * `seed` lets callers pass the last known value before `start`.
 */
export function demProbSeries(
  sides: PartyMarkets,
  start: number,
  end: number,
  step: number,
): Pt[] {
  const fill = (pts: Pt[] | undefined) => {
    if (!pts?.length) return null;
    const sorted = [...pts].sort((a, b) => a.t - b.t);
    const out = new Map<number, number>();
    let i = 0;
    let cur: number | null = null;
    for (let b = Math.floor(start / step) * step; b <= end; b += step) {
      while (i < sorted.length && sorted[i].t <= b + step - 1) cur = sorted[i++].p;
      if (cur !== null) out.set(b, cur);
    }
    return out;
  };
  const d = fill(sides.D);
  const r = fill(sides.R);
  const out: Pt[] = [];
  for (let b = Math.floor(start / step) * step; b <= end; b += step) {
    const dv = d?.get(b);
    const rv = r?.get(b);
    let p: number | undefined;
    if (dv !== undefined && rv !== undefined && dv + rv > 0) p = dv / (dv + rv);
    else if (dv !== undefined) p = dv;
    else if (rv !== undefined) p = 1 - rv;
    if (p !== undefined && b >= start) out.push({ t: b, p: Math.round(p * 10000) / 10000 });
  }
  return out;
}

export const RANGES = {
  "1h": { seconds: 3600, step: 60 },
  "1d": { seconds: 86400, step: 300 },
  "1w": { seconds: 7 * 86400, step: 3600 },
  "30d": { seconds: 30 * 86400, step: 4 * 3600 },
  all: { seconds: 365 * 86400, step: 86400 },
  // Election night: 7pm ET Nov 3 onward (start is fixed, see raceHistory).
  night: { seconds: 0, step: 120 },
} as const;
export type RangeKey = keyof typeof RANGES;
export const isRange = (r: string | null): r is RangeKey => !!r && r in RANGES;
