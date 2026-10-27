/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |err| < 1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp((-x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Historical std-dev of (final polling average margin − actual margin), in points.
 * Used to turn a polling lead into a rough win probability comparable to market prices.
 */
export const POLL_ERROR_SD: Record<string, number> = { senate: 6.5, governor: 6.5, house: 7.5 };

export const marginToProb = (margin: number, office: string) =>
  POLL_ERROR_SD[office] ? normCdf(margin / POLL_ERROR_SD[office]) : null;
