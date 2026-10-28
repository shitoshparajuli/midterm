import { getJson } from "./http";
import { STATES } from "@/lib/races";

/**
 * Wikipedia pageviews (Wikimedia REST API, free, no key): daily readers of each race's article,
 * our measure of how much a race is being followed online.
 */
const REST = "https://en.wikipedia.org/api/rest_v1";
const PAGEVIEWS = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/**
 * The article we count for a race: the 2026 election article for Senate and Governor, and the
 * district's article for House (individual 2026 House races rarely get their own).
 */
export function articleFor(office: string, state: string | null, district: number | null): string | null {
  const name = state && STATES[state];
  if (!name) return null;
  if (office === "senate") return `2026 United States Senate election in ${name}`;
  if (office === "governor") return `2026 ${name} gubernatorial election`;
  if (office === "house" && district != null) return `${name}'s ${district === 0 ? "at-large" : ordinal(district)} congressional district`;
  return null;
}

const enc = (title: string) => encodeURIComponent(title.replace(/ /g, "_"));

/** Canonical title after redirects (Ohio's 2026 race is a special election, say), or null if there's no article. */
export async function resolveArticle(title: string): Promise<string | null> {
  try {
    const j = await getJson<{ titles?: { canonical?: string } }>(`${REST}/page/summary/${enc(title)}`, { retries: 2 });
    return j.titles?.canonical ?? null;
  } catch {
    return null;
  }
}

/** Daily views for `article` between two YYYY-MM-DD days (inclusive). Days not published yet are simply missing. */
export async function dailyViews(article: string, from: string, to: string): Promise<{ day: string; views: number }[]> {
  const d = (s: string) => s.replace(/-/g, "");
  try {
    const j = await getJson<{ items: { timestamp: string; views: number }[] }>(`${PAGEVIEWS}/${enc(article)}/daily/${d(from)}/${d(to)}`, { retries: 3 });
    return j.items.map((i) => ({ day: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, views: i.views }));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("HTTP 404")) return []; // no data in range
    throw e;
  }
}
