import { getJson, toNum } from "./http";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

export interface PmMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  groupItemTitle?: string;
  outcomes?: string; // JSON string: ["Yes","No"]
  outcomePrices?: string | null; // JSON string: ["0.65","0.35"]
  clobTokenIds?: string; // JSON string: [yesToken, noToken]
  active: boolean;
  closed: boolean;
  volumeNum?: number;
  volume?: string;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  umaResolutionStatus?: string;
  closedTime?: string;
  endDate?: string;
}

export interface PmEvent {
  id: string;
  slug: string;
  title: string;
  endDate?: string;
  closed: boolean;
  volume?: number;
  tags?: { slug: string; label: string }[];
  markets: PmMarket[];
}

/** Tags that, between them, cover every 2026 midterm event on Polymarket. */
export const PM_TAGS = ["midterms", "senate-midterms", "governor-midterms", "house-elections"];

export async function fetchPmEvents(tagSlug: string): Promise<PmEvent[]> {
  const out: PmEvent[] = [];
  for (const closed of [false, true]) {
    for (let offset = 0; ; offset += 100) {
      const page = await getJson<PmEvent[]>(
        `${GAMMA}/events?tag_slug=${tagSlug}&closed=${closed}&limit=100&offset=${offset}`,
      );
      out.push(...page);
      if (page.length < 100) break;
    }
  }
  return out;
}

export const parseJsonArray = (s?: string | null): string[] => {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/** Current "Yes" probability: midpoint if the book is tight, else last trade / listed price. */
export function pmYesPrice(m: PmMarket): number | null {
  const bid = toNum(m.bestBid);
  const ask = toNum(m.bestAsk);
  if (bid !== null && ask !== null && ask > 0 && ask - bid <= 0.1) return (bid + ask) / 2;
  const listed = toNum(parseJsonArray(m.outcomePrices)[0]);
  return listed ?? toNum(m.lastTradePrice);
}

/** 1 / 0 once resolved, else null. Polymarket sets outcomePrices to ["1","0"] on resolution. */
export function pmOutcome(m: PmMarket): number | null {
  if (!m.closed || m.umaResolutionStatus !== "resolved") return null;
  const yes = toNum(parseJsonArray(m.outcomePrices)[0]);
  if (yes === 1) return 1;
  if (yes === 0) return 0;
  return null;
}

export interface PricePoint {
  t: number; // unix seconds
  p: number; // 0..1
}

/**
 * Price history for a CLOB token. `fidelity` = bucket size in minutes.
 * Upstream caps the span per request, so long ranges are chunked.
 */
export async function fetchPmHistory(
  tokenId: string,
  startTs: number,
  endTs: number,
  fidelity: number,
): Promise<PricePoint[]> {
  const chunk = fidelity >= 60 ? 14 * 86400 : 86400;
  const out: PricePoint[] = [];
  for (let s = startTs; s < endTs; s += chunk) {
    const e = Math.min(s + chunk, endTs);
    const { history } = await getJson<{ history: PricePoint[] }>(
      `${CLOB}/prices-history?market=${tokenId}&startTs=${s}&endTs=${e}&fidelity=${fidelity}`,
    );
    out.push(...history);
  }
  return out;
}
