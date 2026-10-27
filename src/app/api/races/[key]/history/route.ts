import type { NextRequest } from "next/server";
import { raceHistory } from "@/lib/queries";
import { isRange } from "@/lib/series";
import { json } from "@/lib/api";

const CACHE = { "1h": 30, "1d": 60, "1w": 300, "30d": 600, all: 900 } as const;

/**
 * GET /api/races/SEN-TX/history?range=1h|1d|1w|30d|all
 * series.<platform> = [{t, p}] where p = P(Democrat wins), de-vigged across the D and R contracts.
 * 1h/1d come live from upstream at 1–5 min resolution; longer ranges come from our hourly store.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/races/[key]/history">) {
  const { key } = await ctx.params;
  const range = req.nextUrl.searchParams.get("range") ?? "1w";
  if (!isRange(range)) return json({ error: "range must be one of 1h, 1d, 1w, 30d, all" }, { status: 400 });
  return json(await raceHistory(key.toUpperCase(), range), { maxAge: CACHE[range] });
}
