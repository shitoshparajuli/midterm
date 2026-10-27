import type { NextRequest } from "next/server";
import { listRaces } from "@/lib/queries";
import { json } from "@/lib/api";

/** GET /api/races?office=senate|house|governor|control|generic */
export async function GET(req: NextRequest) {
  const office = req.nextUrl.searchParams.get("office") ?? undefined;
  return json(await listRaces(office), { maxAge: 60 });
}
