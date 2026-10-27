/** Race search by state, race or candidate. Pure: used by the header search and the race lists. */
import { STATES } from "./races";

export interface Searchable {
  title: string;
  state: string | null;
  office: string;
  names: string[];
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’]/g, "")
    .toLowerCase();

export const tokenize = (q: string) => norm(q).split(/\s+/).filter(Boolean);

const placeWords = (r: Searchable) =>
  norm([r.title, r.state, r.state && STATES[r.state], r.office].filter(Boolean).join(" ")).split(/[\s,()]+/);
const words = (r: Searchable) => [...placeWords(r), ...norm(r.names.join(" ")).split(/\s+/)];
const allPrefix = (tokens: string[], ws: string[]) => tokens.every((t) => ws.some((w) => w.startsWith(t)));

/** Every query token must be the start of some word ("tex", "talar", "tx", "va-02"). */
export function raceMatches(r: Searchable, tokens: string[]) {
  if (!tokens.length) return true;
  return allPrefix(tokens, words(r));
}

/** The candidate a query hit, if any (for showing "Ken Paxton" under "Texas Senate"). */
export function matchedName(r: Searchable, tokens: string[]) {
  return r.names.find((n) => {
    const ws = norm(n).split(/\s+/);
    return tokens.some((t) => ws.some((w) => w.startsWith(t)));
  });
}

const OFFICE_RANK: Record<string, number> = { control: 0, senate: 1, governor: 2, house: 3 };

/** Matching races, best first: exact state, place, candidate hits; then Senate/Gov before House, then volume. */
export function searchRaces<T extends Searchable & { volume?: number }>(rows: T[], q: string, limit = Infinity) {
  const tokens = tokenize(q);
  if (!tokens.length) return [];
  const joined = tokens.join(" ");
  return rows
    .filter((r) => raceMatches(r, tokens))
    .map((r) => {
      const name = matchedName(r, tokens);
      const exactState = !!r.state && (joined === r.state.toLowerCase() || joined === norm(STATES[r.state] ?? ""));
      // Place matches ("mich sen") beat candidate first-name hits ("Michael").
      const rank = exactState ? 0 : allPrefix(tokens, placeWords(r)) ? 1 : name ? 2 : 3;
      return { r, name: rank === 2 ? name : undefined, rank };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (OFFICE_RANK[a.r.office] ?? 9) - (OFFICE_RANK[b.r.office] ?? 9) ||
        (b.r.volume ?? 0) - (a.r.volume ?? 0),
    )
    .slice(0, limit);
}
