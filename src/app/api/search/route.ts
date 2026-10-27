import { searchIndex } from "@/lib/queries";
import { json } from "@/lib/api";

/** GET /api/search: race index (with candidate names) for client-side search. */
export async function GET() {
  return json(await searchIndex(), { maxAge: 300 });
}
