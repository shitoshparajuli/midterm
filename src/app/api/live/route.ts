import { liveBoard } from "@/lib/queries";
import { json } from "@/lib/api";

/** GET /api/live: chambers, every race with poll-close vs. current odds, and the scorecard. */
export async function GET() {
  return json(await liveBoard(), { maxAge: 30 });
}
