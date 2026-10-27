import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Shrink house effects toward 0 for pollsters with few polls (acts like K phantom zero-residual polls). */
const SHRINK_K = 3;
const MIN_POLLS_FOR_LEAN = 3;
const LEAN_THRESHOLD = 2; // points of D−R margin
const MATCH_WINDOW_DAYS = 30;

export async function loadAffiliations(): Promise<Map<string, "D" | "R" | "N">> {
  const file = path.join(process.cwd(), "data", "pollster-affiliations.json");
  const json = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, string[] | string>;
  const out = new Map<string, "D" | "R" | "N">();
  for (const side of ["D", "R", "N"] as const)
    for (const name of (json[side] as string[]) ?? []) out.set(name.toLowerCase(), side);
  return out;
}

/**
 * House effect = how much more Democratic (+) or Republican (−) a pollster's margins are than
 * other pollsters' polls of the same race taken within ±30 days.
 */
export async function computePollsters({ log = console.log } = {}) {
  const affiliations = await loadAffiliations();
  const rows = await db
    .select({
      pollster: schema.polls.pollster,
      raceKey: schema.polls.raceKey,
      endDate: schema.polls.endDate,
      margin: schema.polls.margin,
    })
    .from(schema.polls)
    .where(sql`${schema.polls.margin} is not null and ${schema.polls.raceKey} is not null`);

  const byRace = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byRace.has(r.raceKey!)) byRace.set(r.raceKey!, []);
    byRace.get(r.raceKey!)!.push(r);
  }

  const resid = new Map<string, number[]>();
  for (const polls of byRace.values()) {
    for (const p of polls) {
      const t = Date.parse(p.endDate);
      const others = polls.filter(
        (o) => o.pollster !== p.pollster && Math.abs(Date.parse(o.endDate) - t) <= MATCH_WINDOW_DAYS * 86400_000,
      );
      if (new Set(others.map((o) => o.pollster)).size < 2) continue;
      const avg = others.reduce((s, o) => s + o.margin!, 0) / others.length;
      if (!resid.has(p.pollster)) resid.set(p.pollster, []);
      resid.get(p.pollster)!.push(p.margin! - avg);
    }
  }

  const names = new Set(rows.map((r) => r.pollster));
  const all = await db.selectDistinct({ pollster: schema.polls.pollster }).from(schema.polls);
  for (const r of all) names.add(r.pollster);

  const out = [...names].map((name) => {
    const res = resid.get(name) ?? [];
    const he = res.length ? res.reduce((a, b) => a + b, 0) / (res.length + SHRINK_K) : null;
    const aff = affiliations.get(name.toLowerCase()) ?? null;
    let lean: string = "N";
    let leanSource = "default";
    if (aff) {
      lean = aff;
      leanSource = "affiliation";
    } else if (he !== null && res.length >= MIN_POLLS_FOR_LEAN && Math.abs(he) >= LEAN_THRESHOLD) {
      lean = he > 0 ? "D" : "R";
      leanSource = "house_effect";
    }
    return {
      name,
      affiliation: aff === "N" ? null : aff,
      houseEffect: he === null ? null : Math.round(he * 100) / 100,
      houseEffectN: res.length,
      lean,
      leanSource,
      updatedAt: new Date(),
    };
  });

  for (let i = 0; i < out.length; i += 500) {
    await db
      .insert(schema.pollsters)
      .values(out.slice(i, i + 500))
      .onConflictDoUpdate({
        target: schema.pollsters.name,
        set: {
          affiliation: sql`excluded.affiliation`,
          houseEffect: sql`excluded.house_effect`,
          houseEffectN: sql`excluded.house_effect_n`,
          lean: sql`excluded.lean`,
          leanSource: sql`excluded.lean_source`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  const counts = { D: 0, R: 0, N: 0 } as Record<string, number>;
  for (const p of out) counts[p.lean]++;
  log(`pollsters: ${out.length} (lean D ${counts.D}, R ${counts.R}, neutral ${counts.N})`);
  return { pollsters: out.length, ...counts };
}
