import { pipelineStatus } from "@/lib/queries";
import { json } from "@/lib/api";

/** GET /api/status — recent pipeline runs (for a freshness indicator in the UI). */
export async function GET() {
  return json(await pipelineStatus(), { maxAge: 30 });
}
