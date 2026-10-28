import pLimit from "p-limit";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { articleFor, dailyViews, resolveArticle } from "@/lib/sources/wikipedia";

/** First run fills this many days; later runs add the days published since. */
const BACKFILL_DAYS = 60;
/** Wikimedia publishes pageviews once a day, so there's no point asking every 15 minutes. */
const EVERY_HOURS = 6;
/** Wikimedia rate-limits bursts from one IP; 2 at a time stays under it. */
const CONCURRENCY = 2;

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Daily Wikipedia pageviews for every Senate, Governor and House race. */
export async function ingestAttention({ log = console.log } = {}) {
  const [recent] = await db
    .select({ at: schema.pipelineRuns.startedAt })
    .from(schema.pipelineRuns)
    .where(
      and(
        eq(schema.pipelineRuns.step, "attention"),
        eq(schema.pipelineRuns.ok, true),
        isNotNull(sql`${schema.pipelineRuns.detail}->'articles'`),
        gte(schema.pipelineRuns.startedAt, new Date(Date.now() - EVERY_HOURS * 3600_000)),
      ),
    )
    .limit(1);
  if (recent && !process.env.ATTENTION_FORCE) {
    log(`attention: fetched within ${EVERY_HOURS}h, skipping`);
    return { skipped: true };
  }

  const races = await db.select().from(schema.races).where(inArray(schema.races.office, ["senate", "governor", "house"]));
  const latest = new Map(
    (
      await db
        .selectDistinctOn([schema.pageviews.raceKey], { raceKey: schema.pageviews.raceKey, article: schema.pageviews.article, day: schema.pageviews.day })
        .from(schema.pageviews)
        .orderBy(schema.pageviews.raceKey, desc(schema.pageviews.day))
    ).map((r) => [r.raceKey, r]),
  );

  const yesterday = day(Date.now() - 86400_000);
  const limit = pLimit(CONCURRENCY);
  const missing: string[] = [];
  const failed: string[] = [];
  let rows = 0;
  let articles = 0;
  await Promise.all(
    races.map((r) =>
      limit(async () => {
        const known = latest.get(r.key);
        const guess = articleFor(r.office, r.state, r.district);
        const article = known?.article ?? (guess && (await resolveArticle(guess)));
        if (!article) {
          missing.push(r.key);
          return;
        }
        const from = known ? day(Date.parse(known.day) + 86400_000) : day(Date.now() - BACKFILL_DAYS * 86400_000);
        if (from > yesterday) return;
        // One article failing shouldn't sink the rest; the next run picks up from its last stored day.
        const views = await dailyViews(article, from, yesterday).catch(() => null);
        if (!views) {
          failed.push(r.key);
          return;
        }
        articles++;
        if (!views.length) return;
        await db
          .insert(schema.pageviews)
          .values(views.map((v) => ({ raceKey: r.key, article, ...v })))
          .onConflictDoUpdate({ target: [schema.pageviews.raceKey, schema.pageviews.day], set: { views: sql`excluded.views` } });
        rows += views.length;
      }),
    ),
  );
  log(`attention: ${rows} daily rows from ${articles} articles; no article for ${missing.length} races; ${failed.length} failed`);
  if (failed.length > races.length / 2) throw new Error(`attention: ${failed.length} of ${races.length} articles failed`);
  return { articles, rows, missing: missing.sort(), failed: failed.sort() };
}
