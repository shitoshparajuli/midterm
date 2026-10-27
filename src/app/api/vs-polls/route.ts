import { marketsVsPolls } from "@/lib/queries";
import { json } from "@/lib/api";

/** GET /api/vs-polls: market win chance vs poll-implied win chance for every race with both. */
export async function GET() {
  return json(await marketsVsPolls(), { maxAge: 300 });
}
