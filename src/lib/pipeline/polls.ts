import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { AT_LARGE, editDistance, nameKey, parseParty, raceRef, stateCode, type RaceRef } from "@/lib/races";
import { fetchVoteHubPolls, type VhPoll } from "@/lib/sources/votehub";
import { ensureRaces } from "./upsert";

export function pollRace(p: VhPoll): RaceRef | null {
  const rest = p.subject.replace(/^2026\s*/, "").trim();
  switch (p.poll_type) {
    case "generic-ballot":
      return raceRef("generic");
    case "us-senator":
    case "governor": {
      const st = stateCode(rest.replace(/\s*\(special\)$/i, ""));
      return st ? raceRef(p.poll_type === "governor" ? "governor" : "senate", st) : null;
    }
    case "us-representative": {
      const m = (p.seat_name ?? rest).match(/([A-Z]{2})-(\d{1,2}|AL)/);
      if (!m || !stateCode(m[1])) return null;
      return raceRef("house", m[1], m[2] === "AL" || AT_LARGE.has(m[1]) ? 0 : Number(m[2]));
    }
  }
  return null;
}

function lookupParty(choice: string, partyByName: Map<string, string>): string | null {
  const k = nameKey(choice);
  const exact = partyByName.get(k);
  if (exact) return exact;
  if (k.length < 5) return null;
  // one-letter slip, only if unambiguous
  const near = [...partyByName].filter(([n]) => Math.abs(n.length - k.length) <= 1 && editDistance(n, k) <= 1);
  return near.length === 1 ? near[0][1] : null;
}

/** Top Democrat and top Republican share in a poll, using candidate parties learned from markets. */
export function partyShares(p: VhPoll, partyByName: Map<string, string>) {
  let dem: number | null = null;
  let rep: number | null = null;
  for (const a of p.answers) {
    const party =
      p.poll_type === "generic-ballot"
        ? a.choice === "Dem" ? "D" : a.choice === "Rep" ? "R" : null
        : parseParty(a.choice) ?? lookupParty(a.choice, partyByName);
    if (party === "D") dem = Math.max(dem ?? 0, a.pct);
    if (party === "R") rep = Math.max(rep ?? 0, a.pct);
  }
  return { dem, rep };
}

export async function ingestPolls({ log = console.log } = {}) {
  const raw = await fetchVoteHubPolls();
  const withRace = raw.map((p) => ({ p, race: pollRace(p) }));
  await ensureRaces(withRace.flatMap((x) => (x.race ? [x.race] : [])));

  const cands = await db.select().from(schema.candidates);
  const byRace = new Map<string, Map<string, string>>();
  for (const c of cands) {
    if (!byRace.has(c.raceKey)) byRace.set(c.raceKey, new Map());
    byRace.get(c.raceKey)!.set(nameKey(c.name), c.party);
  }

  let resolved = 0;
  const unresolvedRaces = new Set<string>();
  const rows = withRace.map(({ p, race }) => {
    const { dem, rep } = partyShares(p, byRace.get(race?.key ?? "") ?? new Map());
    const margin = dem !== null && rep !== null ? Math.round((dem - rep) * 100) / 100 : null;
    if (margin !== null) resolved++;
    else if (race) unresolvedRaces.add(race.key);
    return {
      id: p.id,
      source: "votehub",
      raceKey: race?.key ?? null,
      pollType: p.poll_type,
      subject: p.subject,
      seatName: p.seat_name,
      pollster: p.pollster.trim(),
      sponsors: p.sponsors ?? [],
      partisan: p.partisan === "DEM" ? "D" : p.partisan === "REP" ? "R" : null,
      internal: !!p.internal,
      population: p.population,
      sampleSize: p.sample_size,
      startDate: p.start_date,
      endDate: p.end_date,
      url: p.url,
      demPct: dem,
      repPct: rep,
      margin,
      answers: p.answers,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(schema.polls)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: schema.polls.id,
        set: {
          raceKey: sql`excluded.race_key`,
          pollster: sql`excluded.pollster`,
          sponsors: sql`excluded.sponsors`,
          partisan: sql`excluded.partisan`,
          internal: sql`excluded.internal`,
          demPct: sql`excluded.dem_pct`,
          repPct: sql`excluded.rep_pct`,
          margin: sql`excluded.margin`,
          answers: sql`excluded.answers`,
        },
      });
  }
  log(`polls: ${rows.length} polls, ${resolved} with D/R margin; unresolved races: ${[...unresolvedRaces].slice(0, 8).join(", ")}`);
  return { polls: rows.length, withMargin: resolved, unresolvedRaces: [...unresolvedRaces] };
}
