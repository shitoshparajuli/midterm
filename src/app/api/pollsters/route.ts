import { listPollsters } from "@/lib/queries";
import { json } from "@/lib/api";

/** GET /api/pollsters — lean (curated affiliation or computed house effect) per pollster. */
export async function GET() {
  return json(await listPollsters(), { maxAge: 600 });
}
