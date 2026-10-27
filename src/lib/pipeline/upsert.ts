import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { RaceRef } from "@/lib/races";

/** Insert races if missing (titles/office never change for a key). */
export async function ensureRaces(refs: RaceRef[]) {
  const uniq = [...new Map(refs.map((r) => [r.key, r])).values()];
  for (let i = 0; i < uniq.length; i += 500) {
    await db
      .insert(schema.races)
      .values(
        uniq.slice(i, i + 500).map((r) => ({
          key: r.key,
          office: r.office,
          state: r.state,
          district: r.district,
          title: r.title,
        })),
      )
      .onConflictDoNothing();
  }
}

export async function upsertCandidates(rows: { raceKey: string; name: string; party: string }[]) {
  const uniq = [...new Map(rows.map((r) => [`${r.raceKey}|${r.name}`, r])).values()];
  for (let i = 0; i < uniq.length; i += 500) {
    await db
      .insert(schema.candidates)
      .values(uniq.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [schema.candidates.raceKey, schema.candidates.name],
        set: { party: sql`excluded.party` },
      });
  }
}

/** Wraps a pipeline step so every run is recorded in pipeline_runs. */
export async function recordRun<T extends object>(step: string, fn: () => Promise<T>): Promise<T> {
  const [run] = await db.insert(schema.pipelineRuns).values({ step }).returning({ id: schema.pipelineRuns.id });
  try {
    const detail = await fn();
    await db
      .update(schema.pipelineRuns)
      .set({ finishedAt: new Date(), ok: true, detail })
      .where(sql`id = ${run.id}`);
    return detail;
  } catch (e) {
    await db
      .update(schema.pipelineRuns)
      .set({ finishedAt: new Date(), ok: false, detail: { error: String(e) } })
      .where(sql`id = ${run.id}`);
    throw e;
  }
}
