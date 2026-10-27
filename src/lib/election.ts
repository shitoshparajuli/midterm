/** Election-night timing. Pure module: safe to import from client components. */

export const ELECTION_DAY = "2026-11-03";
/** 7pm ET on Nov 3 (EST, UTC−5): first polls close. Start of the "Nov 3" chart range. */
export const NIGHT_START = Date.parse("2026-11-04T00:00:00Z");
/** Election night views stay "live" until this point. */
export const NIGHT_END = Date.parse("2026-11-05T12:00:00Z");

/** Last poll close in each state, as an ET hour on election night (24 = midnight, 25 = 1am Nov 4). */
const POLL_CLOSE_ET: Record<string, number> = {
  GA: 19, IN: 19, KY: 19, SC: 19, VA: 19, VT: 19,
  NC: 19.5, OH: 19.5, WV: 19.5,
  AL: 20, CT: 20, DE: 20, FL: 20, IL: 20, ME: 20, MD: 20, MA: 20, MS: 20, MO: 20, NH: 20,
  NJ: 20, OK: 20, PA: 20, RI: 20, TN: 20,
  AR: 20.5,
  AZ: 21, CO: 21, IA: 21, KS: 21, LA: 21, MI: 21, MN: 21, NE: 21, NM: 21, NY: 21, ND: 21,
  SD: 21, TX: 21, WI: 21, WY: 21,
  MT: 22, NV: 22, UT: 22,
  CA: 23, ID: 23, OR: 23, WA: 23,
  HI: 24,
  AK: 25,
};

/** Unix ms when polls close in a state; national races use the first close (7pm ET). */
export function pollCloseAt(state: string | null): number {
  const h = (state && POLL_CLOSE_ET[state]) || 19;
  return NIGHT_START + (h - 19) * 3600_000;
}

export const isNight = (now = Date.now()) => now >= NIGHT_START && now < NIGHT_END;
export const nightStarted = (now = Date.now()) => now >= NIGHT_START;

/** Final projections are frozen at 9pm ET on Nov 2 (EST, UTC−5) and scored against results. */
export const FINAL_LOCK_ID = "2026-final";
export const FINAL_LOCK_AT = Date.parse("2026-11-03T02:00:00Z");
