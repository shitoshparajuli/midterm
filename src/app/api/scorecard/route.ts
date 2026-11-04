import type { NextRequest } from "next/server";
import { lockCsv, scorecard } from "@/lib/forecasts";
import { archivedCsv, archivedScorecard } from "@/lib/archive";
import { ARCHIVED, FINAL_LOCK_ID } from "@/lib/election";
import { json } from "@/lib/api";

/**
 * GET /api/scorecard[?lock=2026-final]   scores, calibration, pollster leaderboard, race-by-race
 * GET /api/scorecard?format=csv          the locked projections + results, one row per race × source
 */
export async function GET(req: NextRequest) {
  const lock = req.nextUrl.searchParams.get("lock") ?? FINAL_LOCK_ID;
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const csv = (await archivedCsv(lock)) ?? (ARCHIVED ? null : await lockCsv(lock));
    if (csv == null) return json({ error: `no archived lock "${lock}"` }, { status: 404 });
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${lock}.csv"`,
        "cache-control": "public, s-maxage=300, stale-while-revalidate=1500",
      },
    });
  }
  const data = (await archivedScorecard(lock)) ?? (ARCHIVED ? null : await scorecard(lock));
  return data ? json(data, { maxAge: 300 }) : json({ error: `no archived lock "${lock}"` }, { status: 404 });
}
