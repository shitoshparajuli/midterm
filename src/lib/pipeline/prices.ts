import pLimit from "p-limit";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fetchPmHistory } from "@/lib/sources/polymarket";
import { fetchKalshiHistory } from "@/lib/sources/kalshi";

const HOUR = 3600;
/** Force a stored point at least this often even if the price hasn't moved (keeps charts honest). */
const HEARTBEAT = 6 * HOUR;
/** Treat moves smaller than this as "unchanged" when compressing. */
const EPS = 0.0005;

export async function fetchHourly(
  m: Pick<typeof schema.markets.$inferSelect, "platform" | "tokenId" | "seriesTicker" | "externalId">,
  startTs: number,
  endTs: number,
) {
  if (m.platform === "polymarket") return fetchPmHistory(m.tokenId!, startTs, endTs, 60);
  return fetchKalshiHistory(m.seriesTicker!, m.externalId, startTs, endTs, 60);
}

/** Drop points that repeat the previous price, except for periodic heartbeats. */
export function compress(points: { t: number; p: number }[], prev?: { t: number; p: number }) {
  const out: { t: number; p: number }[] = [];
  let last = prev;
  for (const pt of points.sort((a, b) => a.t - b.t)) {
    if (last && pt.t <= last.t) continue;
    if (!last || Math.abs(pt.p - last.p) > EPS || pt.t - last.t >= HEARTBEAT) {
      out.push(pt);
      last = pt;
    }
  }
  return out;
}

/**
 * Incrementally pull hourly history for every live market (and markets resolved in the last
 * few days, so we capture the full election-night move). First run backfills `backfillDays`.
 */
export async function ingestPrices({
  backfillDays = Number(process.env.BACKFILL_DAYS ?? 45),
  minVolume = Number(process.env.MIN_MARKET_VOLUME ?? 10_000),
  log = console.log,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const recent = new Date((now - 3 * 86400) * 1000);

  const rows = await db
    .select({
      id: schema.markets.id,
      platform: schema.markets.platform,
      tokenId: schema.markets.tokenId,
      seriesTicker: schema.markets.seriesTicker,
      externalId: schema.markets.externalId,
      lastTs: sql<string | null>`(select max(ts) from price_points pp where pp.market_id = ${schema.markets.id})`,
    })
    .from(schema.markets)
    .where(
      and(
        gt(schema.markets.volume, minVolume - 1e-9),
        or(eq(schema.markets.status, "open"), gt(schema.markets.resolvedAt, recent), isNull(schema.markets.resolvedAt)),
      ),
    );

  // Last stored point per market, so compression continues across runs.
  const lastPts = new Map<string, { t: number; p: number }>();
  const lp = await db.execute<{ market_id: string; ts: string; price: number }>(sql`
    select distinct on (market_id) market_id, ts, price from price_points order by market_id, ts desc`);
  for (const r of lp) lastPts.set(r.market_id, { t: Math.floor(new Date(r.ts).getTime() / 1000), p: r.price });

  const limits = { polymarket: pLimit(6), kalshi: pLimit(4) } as const;
  let inserted = 0;
  let failed = 0;
  await Promise.all(
    rows.map((m) =>
      limits[m.platform as keyof typeof limits](async () => {
        const last = m.lastTs ? Math.floor(new Date(m.lastTs).getTime() / 1000) : null;
        // Re-fetch the last 2h each run: upstream revises the most recent bucket.
        const start = last ? Math.min(last, now - 2 * HOUR) : now - backfillDays * 86400;
        try {
          const pts = compress(await fetchHourly(m, start, now), lastPts.get(m.id));
          if (!pts.length) return;
          for (let i = 0; i < pts.length; i += 1000) {
            await db
              .insert(schema.pricePoints)
              .values(pts.slice(i, i + 1000).map((p) => ({ marketId: m.id, ts: new Date(p.t * 1000), price: p.p })))
              .onConflictDoNothing();
          }
          inserted += pts.length;
        } catch (e) {
          failed++;
          if (failed <= 3) log(`prices: ${m.id} failed: ${e}`);
        }
      }),
    ),
  );
  log(`prices: ${rows.length} markets, +${inserted} points, ${failed} failures`);
  return { markets: rows.length, inserted, failed };
}
