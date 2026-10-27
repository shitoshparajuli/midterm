import { raceDetail } from "@/lib/queries";
import { json } from "@/lib/api";

/** GET /api/races/SEN-TX — candidates, markets, current probabilities, poll averages by lean, polls. */
export async function GET(_req: Request, ctx: RouteContext<"/api/races/[key]">) {
  const { key } = await ctx.params;
  const detail = await raceDetail(key.toUpperCase());
  if (!detail) return json({ error: "not found" }, { status: 404, maxAge: 60 });
  return json(detail, { maxAge: 60 });
}
