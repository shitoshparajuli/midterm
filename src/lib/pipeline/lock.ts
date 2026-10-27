import { db, schema } from "@/lib/db";
import { FINAL_LOCK_AT, FINAL_LOCK_ID } from "@/lib/election";
import { lockForecasts, storeScores } from "@/lib/forecasts";

/**
 * Freeze final projections once FINAL_LOCK_AT has passed (first pipeline run after it).
 * Projections are taken *as of* FINAL_LOCK_AT, so a late run still locks the 9pm numbers.
 * Test locks: LOCK_ID=test LOCK_AT=2026-10-27T00:00:00Z LOCK_FORCE=1 pnpm pipeline lock
 */
export async function lockStep({ log = console.log } = {}) {
  const id = process.env.LOCK_ID ?? FINAL_LOCK_ID;
  const asOf = process.env.LOCK_AT ? new Date(process.env.LOCK_AT === "now" ? Date.now() : process.env.LOCK_AT) : new Date(FINAL_LOCK_AT);
  if (Date.now() < asOf.getTime()) {
    log(`lock: ${id} locks at ${asOf.toISOString()}, not yet`);
    return { id, created: false, pending: true };
  }
  const res = await lockForecasts(id, asOf, { force: process.env.LOCK_FORCE === "1" });
  log(res.created ? `lock: froze ${res.forecasts} projections as ${id} (as of ${res.asOf})` : `lock: ${id} already locked`);
  return res;
}

/** Re-score every lock against the latest results. */
export async function scoresStep({ log = console.log } = {}) {
  const locks = await db.select({ id: schema.forecastLocks.id }).from(schema.forecastLocks);
  const out = [];
  for (const l of locks) {
    const r = await storeScores(l.id);
    log(`scores: ${l.id}: ${r.scores} rows, ${r.scored} races with results`);
    out.push(r);
  }
  return { locks: out };
}
