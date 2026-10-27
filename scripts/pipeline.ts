/**
 * Data pipeline CLI.
 *   pnpm pipeline all          # discover → prices → polls → pollsters → results
 *   pnpm pipeline <step> ...   # any subset, in the order given
 */
import "dotenv/config";
import { closeDb } from "@/lib/db";
import { recordRun } from "@/lib/pipeline/upsert";
import { discover } from "@/lib/pipeline/discover";
import { ingestPrices } from "@/lib/pipeline/prices";
import { ingestPolls } from "@/lib/pipeline/polls";
import { computePollsters } from "@/lib/pipeline/pollsters";
import { ingestResults } from "@/lib/pipeline/results";

const STEPS: Record<string, () => Promise<object>> = {
  discover: () => discover(),
  prices: () => ingestPrices(),
  polls: () => ingestPolls(),
  pollsters: () => computePollsters(),
  results: () => ingestResults(),
};
type Step = string;

async function main() {
  const args = process.argv.slice(2);
  const steps = (args.length === 0 || args.includes("all") ? Object.keys(STEPS) : args) as Step[];
  for (const s of steps) if (!(s in STEPS)) throw new Error(`unknown step "${s}". steps: ${Object.keys(STEPS).join(", ")}`);
  let failed = false;
  for (const s of steps) {
    const t0 = Date.now();
    try {
      await recordRun(s, STEPS[s]);
      console.log(`✓ ${s} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      failed = true;
      console.error(`✗ ${s}:`, e);
    }
  }
  await closeDb();
  process.exit(failed ? 1 : 0);
}
main();
