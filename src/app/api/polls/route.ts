import type { NextRequest } from "next/server";
import { listPolls } from "@/lib/queries";
import { json } from "@/lib/api";

/** GET /api/polls?race=SEN-TX&lean=D|R|N&limit=200 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 200) || 200, 1000);
  return json(await listPolls(sp.get("race")?.toUpperCase(), sp.get("lean") ?? undefined, limit), { maxAge: 300 });
}
