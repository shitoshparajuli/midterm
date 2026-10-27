import { getJson, toNum } from "./http";

const API = "https://api.elections.kalshi.com/trade-api/v2";

export interface KSeries {
  ticker: string;
  title: string;
  category: string;
  tags: string[] | null;
}

export interface KMarket {
  ticker: string;
  event_ticker: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status: string; // active | closed | settled | finalized ...
  result?: string; // "yes" | "no" | ""
  last_price_dollars?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  volume_fp?: string;
  close_time?: string;
  settlement_ts?: string;
  rules_primary?: string;
}

export interface KEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  sub_title?: string;
  category?: string;
  markets: KMarket[];
}

export async function fetchKalshiElectionSeries(): Promise<KSeries[]> {
  const { series } = await getJson<{ series: KSeries[] }>(`${API}/series?category=Elections`);
  return series;
}

export async function fetchKalshiEvents(seriesTicker: string): Promise<KEvent[]> {
  const out: KEvent[] = [];
  let cursor = "";
  do {
    const page = await getJson<{ events: KEvent[]; cursor: string }>(
      `${API}/events?series_ticker=${seriesTicker}&with_nested_markets=true&limit=200${cursor ? `&cursor=${cursor}` : ""}`,
    );
    out.push(...page.events);
    cursor = page.cursor;
  } while (cursor);
  return out;
}

export function kalshiYesPrice(m: KMarket): number | null {
  const bid = toNum(m.yes_bid_dollars);
  const ask = toNum(m.yes_ask_dollars);
  if (bid !== null && ask !== null && ask > 0 && ask - bid <= 0.1) return (bid + ask) / 2;
  return toNum(m.last_price_dollars);
}

export function kalshiOutcome(m: KMarket): number | null {
  if (m.result === "yes") return 1;
  if (m.result === "no") return 0;
  return null;
}

interface Candle {
  end_period_ts: number;
  price: { close_dollars?: string; previous_dollars?: string };
  yes_bid: { close_dollars?: string };
  yes_ask: { close_dollars?: string };
}

/** Candlesticks → probability series. periodMinutes must be 1, 60 or 1440. */
export async function fetchKalshiHistory(
  seriesTicker: string,
  marketTicker: string,
  startTs: number,
  endTs: number,
  periodMinutes: 1 | 60 | 1440,
): Promise<{ t: number; p: number }[]> {
  // Upstream rejects requests spanning too many candles; keep each request under ~4000.
  const chunk = periodMinutes * 60 * 4000;
  const out: { t: number; p: number }[] = [];
  for (let s = startTs; s < endTs; s += chunk) {
    const e = Math.min(s + chunk, endTs);
    const { candlesticks } = await getJson<{ candlesticks: Candle[] }>(
      `${API}/series/${seriesTicker}/markets/${marketTicker}/candlesticks?start_ts=${s}&end_ts=${e}&period_interval=${periodMinutes}`,
    );
    for (const c of candlesticks) {
      const bid = toNum(c.yes_bid?.close_dollars);
      const ask = toNum(c.yes_ask?.close_dollars);
      let p: number | null = null;
      if (bid !== null && ask !== null && ask > 0 && ask - bid <= 0.1) p = (bid + ask) / 2;
      p ??= toNum(c.price?.close_dollars) ?? toNum(c.price?.previous_dollars);
      if (p !== null) out.push({ t: c.end_period_ts, p });
    }
  }
  return out;
}
