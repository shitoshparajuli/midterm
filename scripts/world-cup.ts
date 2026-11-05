/**
 * Did hosting the 2026 World Cup move votes? Compares each host county's 2024 → 2026 swing with
 * the rest of its state, with the US finalists FIFA passed over, and with every other big county.
 *   pnpm analysis:world-cup     # → data/analysis/world-cup.json (re-run while states are still counting)
 * Results: AP, as published in The New York Times' results pages. 2020: tonmcg's county dataset.
 */
import fs from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { STATES } from "@/lib/races";
import type { County, HouseResult, Place, WorldCupData } from "@/lib/world-cup";

const OUT = path.join(process.cwd(), "data", "analysis", "world-cup.json");
const NYT = "https://static01.nyt.com/elections-assets/pages/data";
const Y24 = "2024-11-05";
const Y26 = "2026-11-03";
const PRES_2020 = "https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2020_US_County_Level_Presidential_Results.csv";
const MIN_COUNTED = 0.95;
const MIN_VOTES = 250_000;

// The county each stadium is in, and its House district under the 2024 and 2026 lines (Census geocoder).
const HOSTS = [
  { city: "New York/New Jersey", stadium: "MetLife Stadium", site: "East Rutherford", fips: "34003", house: ["NJ-9", "NJ-9"] },
  { city: "Los Angeles", stadium: "SoFi Stadium", site: "Inglewood", fips: "06037", house: ["CA-43", "CA-43"] },
  { city: "Dallas", stadium: "AT&T Stadium", site: "Arlington", fips: "48439", house: ["TX-25", "TX-25"] },
  { city: "Houston", stadium: "NRG Stadium", site: null, fips: "48201", house: ["TX-9", "TX-18"] },
  { city: "Atlanta", stadium: "Mercedes-Benz Stadium", site: null, fips: "13121", house: ["GA-5", "GA-5"] },
  { city: "Miami", stadium: "Hard Rock Stadium", site: "Miami Gardens", fips: "12086", house: ["FL-24", "FL-24"] },
  { city: "Seattle", stadium: "Lumen Field", site: null, fips: "53033", house: ["WA-7", "WA-7"] },
  { city: "San Francisco Bay Area", stadium: "Levi's Stadium", site: "Santa Clara", fips: "06085", house: ["CA-17", "CA-17"] },
  { city: "Boston", stadium: "Gillette Stadium", site: "Foxborough", fips: "25021", house: ["MA-4", "MA-4"] },
  { city: "Philadelphia", stadium: "Lincoln Financial Field", site: null, fips: "42101", house: ["PA-5", "PA-5"] },
  { city: "Kansas City", stadium: "Arrowhead Stadium", site: null, fips: "29095", house: ["MO-5", "MO-5"] },
];
const NOT_PICKED = [
  { city: "Baltimore/Washington", stadium: "M&T Bank Stadium", site: "Baltimore", fips: "24510", house: ["MD-7", "MD-7"] },
  { city: "Cincinnati", stadium: "Paycor Stadium", site: null, fips: "39061", house: ["OH-1", "OH-1"] },
  { city: "Denver", stadium: "Empower Field", site: null, fips: "08031", house: ["CO-1", "CO-1"] },
  { city: "Nashville", stadium: "Nissan Stadium", site: null, fips: "47037", house: ["TN-6", "TN-6"] },
  { city: "Orlando", stadium: "Camping World Stadium", site: null, fips: "12095", house: ["FL-10", "FL-10"] },
];

interface Votes {
  D: number;
  R: number;
  total: number;
  expected: number;
}
interface Race {
  office: string;
  updated: string | null;
  winner: "D" | "R" | null;
  state: Votes;
  counties: Map<string, Votes & { name: string | null }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the NYT payload is untyped */
const partyOf = (c: any): "D" | "R" | null => {
  const p = String((typeof c?.party === "object" ? c.party?.abbreviation : c?.party) ?? "");
  return p.startsWith("Dem") ? "D" : p.startsWith("Rep") ? "R" : null;
};

async function get(url: string, tries = 3): Promise<Response> {
  try {
    return await fetch(url);
  } catch (e) {
    if (tries <= 1) throw e;
    await new Promise((r) => setTimeout(r, 1000));
    return get(url, tries - 1);
  }
}

/** One NYT results page, reduced to D/R votes for the state and each county. Null if there's no such race. */
async function nyt(date: string, slug: string): Promise<Race | null> {
  const res = await get(`${NYT}/${date}/results-${slug}.json`);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const page: any = await res.json();
  const race = page.races[0];
  const party = new Map(Object.entries(race.candidate_metadata ?? {}).map(([id, c]) => [id, partyOf(c)]));
  const votes = (u: any): Votes => {
    const v = { D: 0, R: 0, total: u.total_votes ?? 0, expected: u.total_expected_vote || u.total_votes || 0 };
    for (const c of u.candidates) {
      const p = party.get(c.nyt_id);
      if (p) v[p] += c.votes.total;
    }
    return v;
  };
  // A county's own row where there is one. New England reports towns, which add up to their county;
  // sub-county rows elsewhere (Kansas City inside Jackson County, MO) would double count.
  const units: any[] = race.reporting_units;
  const hasCounty = new Set(units.filter((u) => u.level === "county").map((u) => u.fips_state + u.fips_county));
  const counties = new Map<string, Votes & { name: string | null }>();
  let state: Votes | null = null;
  for (const u of units) {
    if (u.level === "state") state = votes(u);
    if (!u.fips_county) continue;
    const fips = u.fips_state + u.fips_county;
    if (!(u.level === "county" || (u.level === "township" && !hasCounty.has(fips)))) continue;
    const v = votes(u);
    const c = counties.get(fips) ?? { D: 0, R: 0, total: 0, expected: 0, name: u.level === "county" ? u.name : null };
    for (const k of ["D", "R", "total", "expected"] as const) c[k] += v[k];
    counties.set(fips, c);
  }
  if (!state) throw new Error(`${slug}: no statewide row`);
  const won = race.outcome?.won?.[0];
  return {
    office: race.office,
    updated: race.updated_at ?? page.resultsMeta?.resultsUpdatedAt ?? null,
    winner: won ? (party.get(won) ?? null) : null,
    state,
    counties,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const slugOf = (code: string) => STATES[code].toLowerCase().replace(/ /g, "-");
const margin = (v: { D: number; R: number }) => (v.D > 0 && v.R > 0 ? ((v.D - v.R) / (v.D + v.R)) * 100 : null);
const minus = (a: Votes, b: Votes): Votes => ({ D: a.D - b.D, R: a.R - b.R, total: a.total - b.total, expected: a.expected - b.expected });
const round = (v: number | null, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Every House district in a state, summed by county; null unless every district had both a D and an R. */
async function houseTotals(st: string, date: string): Promise<Race | null> {
  const districts: Race[] = [];
  const atLarge = await nyt(date, `${slugOf(st)}-us-house-at-large`);
  if (atLarge) districts.push(atLarge);
  else
    for (let n = 1; ; n++) {
      const d = await nyt(date, `${slugOf(st)}-us-house-${n}`);
      if (!d) break;
      districts.push(d);
    }
  if (!districts.length || districts.some((d) => !d.state.D || !d.state.R)) return null;
  const add = (a: Votes, b: Votes) => ({ D: a.D + b.D, R: a.R + b.R, total: a.total + b.total, expected: a.expected + b.expected });
  const counties = new Map<string, Votes & { name: string | null }>();
  for (const d of districts)
    for (const [fips, v] of d.counties) counties.set(fips, { ...add(counties.get(fips) ?? { D: 0, R: 0, total: 0, expected: 0 }, v), name: v.name });
  return {
    office: "House",
    updated:
      districts
        .map((d) => d.updated ?? "")
        .sort()
        .at(-1) || null,
    winner: null,
    state: districts.map((d) => d.state).reduce(add),
    counties,
  };
}

/** The top 2026 race: Senate where there was one, else governor, else the whole House delegation. */
async function topRace(st: string): Promise<Race | null> {
  for (const r of ["us-senate", "us-senate-special", "governor"]) {
    const race = await nyt(Y26, `${slugOf(st)}-${r}`);
    // Skip races without both parties (Nebraska's independent-vs-Republican Senate race, say).
    if (race && race.state.D && race.state.R && (race.state.D + race.state.R) / race.state.total >= 0.9) return race;
  }
  return houseTotals(st, Y26);
}

async function house(code: string, date: string): Promise<HouseResult> {
  const [st, n] = code.split("-");
  const r = await nyt(date, `${slugOf(st)}-us-house-${n}`);
  if (!r) throw new Error(`no ${code} results for ${date}`);
  return { district: code, margin: round(margin(r.state), 1), winner: r.winner };
}

async function pres2020() {
  const csv = await (await get(PRES_2020)).text();
  const [header, ...lines] = csv.trim().split("\n");
  const cols = header.split(",");
  const out = new Map<string, { m: number; name: string }>();
  for (const line of lines) {
    const v = Object.fromEntries(line.split(",").map((x, i) => [cols[i], x]));
    const D = Number(v.votes_dem);
    const R = Number(v.votes_gop);
    out.set(v.county_fips.padStart(5, "0"), { m: ((D - R) / (D + R)) * 100, name: v.county_name });
  }
  return out;
}

/** Deterministic PRNG so re-runs give the same `chance`. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const quantile = (sorted: number[], q: number) => {
  const i = (sorted.length - 1) * q;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i - Math.floor(i));
};

async function main() {
  const limit = pLimit(4);
  const codes = Object.keys(STATES).filter((c) => c !== "DC");
  const [p20, perState] = await Promise.all([
    pres2020(),
    Promise.all(codes.map((st) => limit(async () => ({ st, p24: await nyt(Y24, `${slugOf(st)}-president`), r26: await topRace(st) })))),
  ]);

  const rows = new Map<string, County & { m26: number; restSwing: number; race: string }>();
  const stateOf = new Map<string, string>();
  for (const { st, p24, r26 } of perState) {
    for (const fips of p24?.counties.keys() ?? []) stateOf.set(fips, st);
    if (!p24 || !r26) {
      console.log(`world-cup: ${st} skipped (${p24 ? "no 2026 race with both parties" : "no 2024 results"})`);
      continue;
    }
    for (const [fips, c26] of r26.counties) {
      const c24 = p24.counties.get(fips);
      const m20 = p20.get(fips)?.m;
      if (!c24 || m20 == null) continue;
      const [m24, m26] = [margin(c24), margin(c26)];
      const [rest24, rest26] = [margin(minus(p24.state, c24)), margin(minus(r26.state, c26))];
      if (m24 == null || m26 == null || rest24 == null || rest26 == null) continue;
      const restTurnout = (r26.state.expected - c26.expected) / (p24.state.total - c24.total);
      rows.set(fips, {
        fips,
        name: p20.get(fips)?.name ?? c26.name ?? fips,
        state: st,
        votes24: c24.total,
        m24,
        m26,
        shift24: m24 - m20,
        swing: m26 - m24,
        restSwing: rest26 - rest24,
        gap: m26 - m24 - (rest26 - rest24),
        counted: c26.expected ? Math.min(1, c26.total / c26.expected) : 0,
        turnoutGap: c26.expected && restTurnout ? c26.expected / c24.total / restTurnout - 1 : null,
        race: r26.office.replace(/^U\.S\. /, ""),
      });
    }
  }

  const senate24 = new Map<string, Race | null>();
  const place = async (p: (typeof HOSTS)[number]): Promise<Place> => {
    const r = rows.get(p.fips);
    const st = stateOf.get(p.fips)!;
    if (!senate24.has(st)) senate24.set(st, await nyt(Y24, `${slugOf(st)}-us-senate`));
    const s24 = senate24.get(st)?.counties.get(p.fips);
    const [house24, house26] = await Promise.all([house(p.house[0], Y24), house(p.house[1], Y26)]);
    const m20 = p20.get(p.fips);
    return {
      city: p.city,
      stadium: p.stadium,
      site: p.site,
      fips: p.fips,
      county: m20?.name ?? r?.name ?? p.fips,
      state: st,
      race: r?.race ?? null,
      m20: round(m20?.m ?? null),
      m24: round(r?.m24 ?? null),
      m26: round(r?.m26 ?? null),
      swing: round(r?.swing ?? null),
      restSwing: round(r?.restSwing ?? null),
      gap: round(r?.gap ?? null),
      counted: round(r?.counted ?? null, 3),
      turnoutGap: round(r?.turnoutGap ?? null, 3),
      senate24: round(s24 ? margin(s24) : null),
      house24,
      house26,
    };
  };
  const hosts = await Promise.all(HOSTS.map((p) => limit(() => place(p))));
  const notPicked = await Promise.all(NOT_PICKED.map((p) => limit(() => place(p))));

  const isHost = new Set(HOSTS.map((h) => h.fips));
  const big = [...rows.values()].filter((r) => r.votes24 >= MIN_VOTES).sort((a, b) => b.votes24 - a.votes24);
  const final = (r: { counted: number | null }) => (r.counted ?? 0) >= MIN_COUNTED;
  const others = big.filter((r) => final(r) && !isHost.has(r.fips));
  const hostDone = hosts.filter((h) => h.gap != null && final(h));
  const notPickedDone = notPicked.filter((h) => h.gap != null && final(h));
  const hostGap = mean(hostDone.map((h) => h.gap!));

  // How often would that many random big counties average a gap this far from zero?
  const rand = mulberry32(2026);
  const draws = 20_000;
  let asFar = 0;
  for (let i = 0; i < draws; i++) {
    const pool = [...others];
    let sum = 0;
    for (let k = 0; k < hostDone.length; k++) sum += pool.splice(Math.floor(rand() * pool.length), 1)[0].gap;
    if (Math.abs(sum / hostDone.length) >= Math.abs(hostGap)) asFar++;
  }

  // Least squares: gap on the 2020 → 2024 shift.
  const mx = mean(others.map((r) => r.shift24));
  const my = mean(others.map((r) => r.gap));
  const b = others.reduce((s, r) => s + (r.shift24 - mx) * (r.gap - my), 0) / others.reduce((s, r) => s + (r.shift24 - mx) ** 2, 0);
  const a = my - b * mx;
  const sd = Math.sqrt(mean(others.map((r) => (r.gap - a - b * r.shift24) ** 2)));
  const shift = (h: Place) => h.m24! - h.m20!;

  const gaps = others.map((r) => r.gap).sort((x, y) => x - y);
  const data: WorldCupData = {
    asOf:
      perState
        .flatMap(({ r26 }) => (r26?.updated ? [r26.updated] : []))
        .sort()
        .at(-1) ?? new Date().toISOString(),
    minCounted: MIN_COUNTED,
    minVotes: MIN_VOTES,
    hosts,
    notPicked,
    big: big.map(({ fips, name, state, votes24, m24, shift24, swing, gap, counted, turnoutGap }) => ({
      fips,
      name,
      state,
      votes24,
      m24: round(m24)!,
      shift24: round(shift24)!,
      swing: round(swing)!,
      gap: round(gap)!,
      counted: round(counted, 3)!,
      turnoutGap: round(turnoutGap, 3),
    })),
    stats: {
      host: {
        n: hostDone.length,
        swing: round(mean(hostDone.map((h) => h.swing!)))!,
        restSwing: round(mean(hostDone.map((h) => h.restSwing!)))!,
        gap: round(hostGap)!,
        turnoutGap: round(mean(hostDone.map((h) => h.turnoutGap ?? 0)), 3)!,
      },
      notPicked: { n: notPickedDone.length, gap: round(mean(notPickedDone.map((h) => h.gap!)))! },
      others: {
        n: others.length,
        p10: round(quantile(gaps, 0.1))!,
        p25: round(quantile(gaps, 0.25))!,
        p50: round(quantile(gaps, 0.5))!,
        p75: round(quantile(gaps, 0.75))!,
        p90: round(quantile(gaps, 0.9))!,
      },
      chance: round(asFar / draws, 3)!,
      trend: { a: round(a, 3)!, b: round(b, 3)!, sd: round(sd)! },
      hostVsTrend: round(mean(hostDone.map((h) => h.gap! - (a + b * shift(h)))))!,
    },
  };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(data, null, 1) + "\n");
  console.log(
    `world-cup: ${rows.size} counties, ${big.length} big (${others.length} non-host counted ≥${MIN_COUNTED * 100}%) → ${path.relative(process.cwd(), OUT)}`,
  );
  console.log(JSON.stringify(data.stats));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
