import type { NextRequest } from "next/server";
import { lockCsv, scorecard } from "@/lib/forecasts";
import { FINAL_LOCK_ID } from "@/lib/election";
import { json } from "@/lib/api";

/**
 * GET /api/scorecard[?lock=2026-final]   scores, calibration, pollster leaderboard, race-by-race
 * GET /api/scorecard?format=csv          the locked projections + results, one row per race × source
 */
export async function GET(req: NextRequest) {
  const lock = req.nextUrl.searchParams.get("lock") ?? FINAL_LOCK_ID;
  if (req.nextUrl.searchParams.get("format") === "csv") {
    return new Response(await lockCsv(lock), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${lock}.csv"`,
        "cache-control": "public, s-maxage=300, stale-while-revalidate=1500",
      },
    });
  }
  return json(await scorecard(lock), { maxAge: 300 });
}
