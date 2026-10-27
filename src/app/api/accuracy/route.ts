import type { NextRequest } from "next/server";
import { accuracy, CHECKPOINTS, type Checkpoint } from "@/lib/queries";
import { json } from "@/lib/api";

/** GET /api/accuracy?checkpoint=30d|7d|1d|0d&office=senate — Brier / log-loss / hit rate per source. */
export async function GET(req: NextRequest) {
  const cp = req.nextUrl.searchParams.get("checkpoint") ?? "1d";
  if (!(cp in CHECKPOINTS)) return json({ error: "checkpoint must be one of 30d, 7d, 1d, 0d" }, { status: 400 });
  const office = req.nextUrl.searchParams.get("office") ?? undefined;
  return json(await accuracy(cp as Checkpoint, office), { maxAge: 300 });
}
