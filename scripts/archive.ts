/**
 * Archive a lock so the Scorecard can be served without the database (see src/lib/archive.ts).
 *   pnpm archive [lockId]                  # projections + results → data/archive/
 *   pnpm archive [lockId] --results-only   # refresh results, e.g. after `pnpm pipeline discover results`
 * Result rows edited by hand (source not starting with "market:") are kept.
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { closeDb, db, schema } from "@/lib/db";
import { loadForecasts } from "@/lib/forecasts";
import { leanMap } from "@/lib/queries";
import { FINAL_LOCK_ID } from "@/lib/election";
import { ARCHIVE_DIR, archiveJson, parseResults, resultsCsv, type ArchivedLock } from "@/lib/archive";

async function main() {
  const args = process.argv.slice(2);
  const lockId = args.find((a) => !a.startsWith("--")) ?? FINAL_LOCK_ID;
  const jsonFile = path.join(ARCHIVE_DIR, `${lockId}.json`);
  const csvFile = path.join(ARCHIVE_DIR, `${lockId}-results.csv`);
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });

  let archive: ArchivedLock;
  if (args.includes("--results-only")) {
    archive = JSON.parse(await fs.readFile(jsonFile, "utf8"));
  } else {
    const [lock] = await db.select().from(schema.forecastLocks).where(eq(schema.forecastLocks.id, lockId));
    if (!lock) throw new Error(`no lock "${lockId}" in this database`);
    const [forecasts, races, leanOf] = await Promise.all([
      loadForecasts(lockId),
      db.select().from(schema.races).where(sql`${schema.races.office} <> 'generic'`),
      leanMap(),
    ]);
    const keys = new Set(forecasts.map((f) => f.raceKey));
    const pollsters = new Set(forecasts.filter((f) => f.source.startsWith("pollster:")).map((f) => f.source.slice("pollster:".length)));
    archive = {
      lock: { id: lock.id, asOf: lock.asOf.toISOString() },
      watch: lock.watch ?? [],
      races: races.filter((r) => keys.has(r.key)).map(({ key, office, state, title }) => ({ key, office, state, title })),
      leans: Object.fromEntries([...pollsters].sort().map((n) => [n, leanOf(n)])),
      forecasts,
    };
    await fs.writeFile(jsonFile, archiveJson(archive));
    console.log(`archive: ${archive.forecasts.length} projections, ${archive.races.length} races → ${path.relative(process.cwd(), jsonFile)}`);
  }

  const keys = new Set(archive.races.map((r) => r.key));
  const results = parseResults(await fs.readFile(csvFile, "utf8").catch(() => ""));
  const decided = await db.select().from(schema.races).where(sql`${schema.races.winnerParty} is not null`);
  let updated = 0;
  for (const r of decided) {
    const cur = results.get(r.key);
    if (!keys.has(r.key) || (cur?.source && !cur.source.startsWith("market:"))) continue;
    results.set(r.key, {
      winnerParty: r.winnerParty,
      demPct: r.demPct,
      repPct: r.repPct,
      calledAt: r.calledAt?.toISOString() ?? null,
      source: r.resultSource,
    });
    updated++;
  }
  await fs.writeFile(csvFile, resultsCsv(results));
  console.log(`archive: ${results.size} results (${updated} from the database) → ${path.relative(process.cwd(), csvFile)}`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
