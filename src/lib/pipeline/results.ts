import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Race outcomes.
 *  1. Market settlement: when a "<party> wins" contract resolves YES on either platform.
 *  2. data/results.csv (optional, overrides 1): race_key,winner_party,dem_pct,rep_pct,called_at,source
 *     Use this for vote shares (needed for poll-margin error) from AP/state SoS/DDHQ etc.
 */
export async function ingestResults({ log = console.log } = {}) {
  const fromMarkets = await db.execute<{ race_key: string; party: string; resolved_at: string | null; platforms: string }>(sql`
    select race_key, party, min(resolved_at) as resolved_at, string_agg(distinct platform, '+') as platforms
    from markets where outcome = 1
    group by race_key, party`);

  const winners = new Map<string, (typeof fromMarkets)[number][]>();
  for (const r of fromMarkets) winners.set(r.race_key, [...(winners.get(r.race_key) ?? []), r]);
  let fromMkt = 0;
  const conflicts: string[] = [];
  for (const [raceKey, rows] of winners) {
    if (rows.length > 1) {
      conflicts.push(raceKey); // platforms disagree — leave for manual review
      continue;
    }
    const w = rows[0];
    await db.execute(sql`
      update races set winner_party = ${w.party}, called_at = ${w.resolved_at},
        result_source = ${"market:" + w.platforms}, updated_at = now()
      where key = ${raceKey} and (result_source is null or result_source like 'market:%')`);
    fromMkt++;
  }

  let fromCsv = 0;
  const file = path.join(process.cwd(), "data", "results.csv");
  const csv = await fs.readFile(file, "utf8").catch(() => null);
  if (csv) {
    const [header, ...lines] = csv.trim().split(/\r?\n/);
    const cols = header.split(",").map((c) => c.trim());
    for (const line of lines) {
      if (!line.trim() || line.startsWith("#")) continue;
      const v = Object.fromEntries(line.split(",").map((x, i) => [cols[i], x.trim() || null]));
      await db.execute(sql`
        update races set
          winner_party = coalesce(${v.winner_party}, winner_party),
          dem_pct = ${v.dem_pct ? Number(v.dem_pct) : null},
          rep_pct = ${v.rep_pct ? Number(v.rep_pct) : null},
          called_at = coalesce(${v.called_at}::timestamptz, called_at),
          result_source = ${"manual:" + (v.source ?? "csv")},
          updated_at = now()
        where key = ${v.race_key}`);
      fromCsv++;
    }
  }
  log(`results: ${fromMkt} from market settlement, ${fromCsv} from results.csv, ${conflicts.length} conflicts`);
  return { fromMarkets: fromMkt, fromCsv, conflicts };
}
