export type Party = "D" | "R" | "I" | "O";
export type Office = "senate" | "house" | "governor" | "control" | "generic";

export const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming",
};
const NAME_TO_CODE = Object.fromEntries(
  Object.entries(STATES).map(([code, name]) => [name.toLowerCase(), code]),
);

/** States with a single at-large House seat (keyed as district 0 / "AL"). */
export const AT_LARGE = new Set(["AK", "DE", "ND", "SD", "VT", "WY"]);

export const stateCode = (name: string): string | null => {
  const s = name.trim();
  if (/^[A-Z]{2}$/.test(s) && STATES[s]) return s;
  return NAME_TO_CODE[s.toLowerCase()] ?? null;
};

export interface RaceRef {
  key: string;
  office: Office;
  state: string | null;
  district: number | null;
  title: string;
}

export function raceRef(office: Office, state: string | null = null, district: number | null = null): RaceRef {
  switch (office) {
    case "senate":
      return { key: `SEN-${state}`, office, state, district, title: `${STATES[state!]} Senate` };
    case "governor":
      return { key: `GOV-${state}`, office, state, district, title: `${STATES[state!]} Governor` };
    case "house": {
      // district 0 = at-large
      const d = district === 0 ? "AL" : String(district).padStart(2, "0");
      return { key: `HOUSE-${state}${d}`, office, state, district, title: `${state}-${d} House` };
    }
    case "control":
      // state slot doubles as the chamber name for control races
      return {
        key: `CONTROL-${state}`,
        office,
        state: null,
        district: null,
        title: `${state === "SENATE" ? "Senate" : "House"} control`,
      };
    case "generic":
      return { key: "GENERIC", office, state: null, district: null, title: "Generic congressional ballot" };
  }
}

/** Parse a race out of a market/event title. Returns null for non-winner markets (margins, turnout, county...). */
export function parseRaceTitle(title: string): RaceRef | null {
  const t = title.trim().replace(/\s+/g, " ");
  if (/margin|turnout|count(y|ies)|primary|nominee|special election|first round|closer|closest|how many|who will run|drop out|rounds/i.test(t))
    return null;

  let m: RegExpMatchArray | null;
  if (/which party will win the (u\.s\. )?senate\b/i.test(t) || /^senate winner\b/i.test(t))
    return raceRef("control", "SENATE");
  if (/which party will win the (u\.s\. )?house( of representatives)?\??( in 2026)?\??$/i.test(t) || /^house winner\b/i.test(t))
    return raceRef("control", "HOUSE");

  if ((m = t.match(/\b([A-Z]{2})-(\d{1,2}|AL)\b.*\bhouse\b/i)) || (m = t.match(/\bhouse race for (?:the )?([A-Z]{2})-(\d{1,2}|AL)\b/i))) {
    const st = stateCode(m[1].toUpperCase());
    if (st) return raceRef("house", st, m[2].toUpperCase() === "AL" ? 0 : Number(m[2]));
  }
  if ((m = t.match(/^(.+?) house (?:election |race )?winner/i))) {
    // single-district states, e.g. "Alaska House winner?"
    const st = stateCode(m[1]);
    if (st) return raceRef("house", st, 0);
  }
  if ((m = t.match(/^(?:who will win the )?(.+?) senate (?:election |race )?winner/i)) ||
      (m = t.match(/^who will win the senate race in (.+?)\??$/i))) {
    const st = stateCode(m[1].replace(/^special /i, ""));
    if (st) return raceRef("senate", st);
  }
  if ((m = t.match(/^(?:who will win the )?(.+?) governor(?:'s)? (?:election |race )?winner/i))) {
    const st = stateCode(m[1]);
    if (st) return raceRef("governor", st);
  }
  return null;
}

/** Party from strings like "James Talarico (D)", "Democratic Party", "Will the Republicans win…". */
export function parseParty(...texts: (string | undefined | null)[]): Party | null {
  for (const raw of texts) {
    if (!raw) continue;
    const s = raw.trim();
    const paren = s.match(/\((D|R|I|L|G)\)\s*$/);
    if (paren) return paren[1] === "D" ? "D" : paren[1] === "R" ? "R" : paren[1] === "I" ? "I" : "O";
    if (/\bdemocrat(s|ic)?\b/i.test(s)) return "D";
    if (/\brepublican(s)?\b|\bGOP\b/i.test(s)) return "R";
    if (/\bindependent\b/i.test(s)) return "I";
  }
  return null;
}

export const stripParty = (name: string) => name.replace(/\s*\([A-Z]\)\s*$/, "").trim();

/** Loose candidate-name normalisation for matching poll answers to market candidates. */
export function nameKey(name: string): string {
  const cleaned = stripParty(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/i, "")
    .replace(/[^a-zA-Z\s'-]/g, "")
    .trim()
    .toLowerCase();
  const parts = cleaned.split(/\s+/);
  return parts[parts.length - 1] ?? cleaned;
}

/** Levenshtein distance, for tolerating spelling slips in poll answers ("Healy" vs "Healey"). */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
