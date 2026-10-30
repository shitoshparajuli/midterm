import fs from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { parseParty, parseRaceTitle, stripParty, raceRef, type Party, type RaceRef } from "@/lib/races";
import {
  PM_TAGS,
  fetchPmEvents,
  parseJsonArray,
  pmOutcome,
  pmYesPrice,
  type PmEvent,
} from "@/lib/sources/polymarket";
import {
  fetchKalshiElectionSeries,
  fetchKalshiEvents,
  kalshiOutcome,
  kalshiYesPrice,
  type KEvent,
} from "@/lib/sources/kalshi";
import { ensureRaces, upsertCandidates } from "./upsert";

type MarketRow = typeof schema.markets.$inferInsert;

const CYCLE_START = "2026-10-01";
const CYCLE_END = "2027-03-01";

async function loadCandidateOverrides(): Promise<Map<string, Party>> {
  const file = path.join(process.cwd(), "data", "candidate-parties.json");
  const json = JSON.parse(await fs.readFile(file, "utf8").catch(() => "{}")) as Record<string, Record<string, Party> | string>;
  const out = new Map<string, Party>();
  for (const [race, names] of Object.entries(json)) {
    if (typeof names !== "object") continue;
    for (const [name, party] of Object.entries(names)) out.set(`${race}|${fullNameKey(name)}`, party);
  }
  return out;
}

const fullNameTitle = (s: string) => stripParty(s).replace(/^(sen|gov|rep|dr)\.?\s+/i, "").trim();
const fullNameKey = (s: string) =>
  stripParty(s).replace(/^(sen|gov|rep|dr|mr|mrs|ms)\.?\s+/i, "").toLowerCase().replace(/\s+/g, " ").trim();

function isPartyLabel(s: string) {
  return /^(democratic|republican|independent)( party)?$|^(democrats|republicans)$/i.test(s.trim());
}

// ---------------------------------------------------------------- Polymarket

export function pmMarketsFromEvents(events: PmEvent[], overrides = new Map<string, Party>()) {
  const races: RaceRef[] = [];
  const markets: MarketRow[] = [];
  const unmatched: string[] = [];
  for (const e of events) {
    const end = e.endDate?.slice(0, 10) ?? "";
    if (end < CYCLE_START || end > CYCLE_END) continue;
    const race = parseRaceTitle(e.title);
    if (!race) {
      unmatched.push(e.title);
      continue;
    }
    races.push(race);
    for (const m of e.markets ?? []) {
      const tokenId = parseJsonArray(m.clobTokenIds)[0];
      if (!tokenId) continue;
      if (!m.active && !m.closed) continue; // unlaunched placeholders ("Person A", "Party B", ...)
      const party =
        parseParty(m.groupItemTitle, m.question) ??
        overrides.get(`${race.key}|${fullNameKey(m.groupItemTitle ?? "")}`) ??
        null;
      if (!party) continue;
      const outcome = pmOutcome(m);
      const label = m.groupItemTitle ?? "";
      markets.push({
        id: `polymarket:${m.conditionId}`,
        platform: "polymarket",
        raceKey: race.key,
        party,
        candidateName: label && !isPartyLabel(label) && race.office !== "control" ? fullNameTitle(label) : null,
        externalId: m.conditionId,
        tokenId,
        seriesTicker: null,
        eventId: e.slug,
        question: m.question,
        url: `https://polymarket.com/event/${e.slug}`,
        volume: Number(m.volumeNum ?? m.volume ?? 0) || 0,
        lastPrice: pmYesPrice(m),
        lastPriceAt: new Date(),
        status: outcome !== null ? "resolved" : m.closed ? "closed" : "open",
        outcome,
        resolvedAt: outcome !== null && m.closedTime ? new Date(m.closedTime.replace(" ", "T").replace(/\+00$/, "Z")) : null,
        updatedAt: new Date(),
      });
    }
  }
  return { races, markets, unmatched };
}

// ---------------------------------------------------------------- Kalshi

const RACE_TAGS = new Set(["Senate", "House", "Governor"]);
/** Matched by ticker, not title: Kalshi rewords these titles ("Who will control the Senate?"). */
const CONTROL_SERIES: Record<string, "SENATE" | "HOUSE"> = { CONTROLS: "SENATE", CONTROLH: "HOUSE" };

function kalshiSuffixParty(ticker: string): Party | null {
  const suf = ticker.split("-").pop()!.toUpperCase();
  if (suf === "D" || suf === "DEM") return "D";
  if (suf === "R" || suf === "GOP" || suf === "REP") return "R";
  if (suf === "I" || suf === "IND") return "I";
  return null;
}

export function kalshiMarketsFromEvents(events: KEvent[], overrides = new Map<string, Party>()) {
  const races: RaceRef[] = [];
  const markets: MarketRow[] = [];
  const unmatched: string[] = [];
  // names whose party we only learn from another market in the same race
  const pending: { row: MarketRow; name: string }[] = [];
  const known = new Map<string, Party>(); // `${raceKey}|${fullNameKey}` -> party

  for (const e of events) {
    if (!/-(26|2026)$/.test(e.event_ticker)) continue;
    const chamber = CONTROL_SERIES[e.series_ticker];
    const race = chamber ? raceRef("control", chamber) : parseRaceTitle(e.title);
    if (!race) {
      unmatched.push(`${e.event_ticker}: ${e.title}`);
      continue;
    }
    races.push(race);
    for (const m of e.markets ?? []) {
      const name = m.yes_sub_title?.trim() ?? "";
      const party =
        kalshiSuffixParty(m.ticker) ?? parseParty(name) ?? overrides.get(`${race.key}|${fullNameKey(name)}`) ?? null;
      const outcome = kalshiOutcome(m);
      const row: MarketRow = {
        id: `kalshi:${m.ticker}`,
        platform: "kalshi",
        raceKey: race.key,
        party: party ?? "O",
        candidateName: name && !isPartyLabel(name) && race.office !== "control" ? stripParty(name) : null,
        externalId: m.ticker,
        tokenId: null,
        seriesTicker: e.series_ticker,
        eventId: e.event_ticker,
        question: `${e.title} — ${name}`,
        url: `https://kalshi.com/markets/${e.series_ticker.toLowerCase()}`,
        volume: Number(m.volume_fp ?? 0) || 0,
        lastPrice: kalshiYesPrice(m),
        lastPriceAt: new Date(),
        status: outcome !== null ? "resolved" : m.status === "active" ? "open" : "closed",
        outcome,
        resolvedAt: outcome !== null && m.settlement_ts ? new Date(m.settlement_ts) : null,
        updatedAt: new Date(),
      };
      if (party) {
        markets.push(row);
        if (name) known.set(`${race.key}|${fullNameKey(name)}`, party);
      } else if (name) {
        pending.push({ row, name });
      }
    }
  }
  return { races, markets, unmatched, pending, known };
}

// ---------------------------------------------------------------- run

export async function discover({ log = console.log } = {}) {
  const overrides = await loadCandidateOverrides();

  // Polymarket
  const pmEventMap = new Map<string, PmEvent>();
  for (const tag of PM_TAGS) for (const e of await fetchPmEvents(tag)) pmEventMap.set(e.id, e);
  const pm = pmMarketsFromEvents([...pmEventMap.values()], overrides);
  log(`polymarket: ${pmEventMap.size} events → ${new Set(pm.races.map((r) => r.key)).size} races, ${pm.markets.length} markets`);

  // Kalshi (rate limit is ~20 req/s on the public tier; stay well under it)
  const series = (await fetchKalshiElectionSeries()).filter((s) => {
    const tags = s.tags ?? [];
    return !!CONTROL_SERIES[s.ticker] ||(tags.some((t) => RACE_TAGS.has(t)) && !tags.includes("Primaries"));
  });
  const limit = pLimit(3);
  const errors: string[] = [];
  const kEvents = (
    await Promise.all(
      series.map((s) =>
        limit(() =>
          fetchKalshiEvents(s.ticker).catch((err) => {
            errors.push(`${s.ticker}: ${err}`);
            return [] as KEvent[];
          }),
        ),
      ),
    )
  ).flat();
  if (errors.length) log(`kalshi: ${errors.length} series failed, e.g. ${errors[0]}`);
  const k = kalshiMarketsFromEvents(kEvents, overrides);

  // Resolve Kalshi candidate-only markets (e.g. "Who will win…" person markets) via names seen elsewhere.
  const allKnown = new Map(k.known);
  for (const m of pm.markets)
    if (m.candidateName && m.party !== "O") allKnown.set(`${m.raceKey}|${fullNameKey(m.candidateName)}`, m.party as Party);
  for (const { row, name } of k.pending) {
    const party = allKnown.get(`${row.raceKey}|${fullNameKey(name)}`);
    if (party) k.markets.push({ ...row, party });
  }
  log(`kalshi: ${series.length} series, ${kEvents.length} events → ${new Set(k.races.map((r) => r.key)).size} races, ${k.markets.length} markets`);

  // Persist
  const races = [...pm.races, ...k.races, raceRef("generic")];
  await ensureRaces(races);

  const markets = [...pm.markets, ...k.markets];
  for (let i = 0; i < markets.length; i += 300) {
    await db
      .insert(schema.markets)
      .values(markets.slice(i, i + 300))
      .onConflictDoUpdate({
        target: schema.markets.id,
        set: {
          raceKey: sql`excluded.race_key`,
          party: sql`excluded.party`,
          candidateName: sql`excluded.candidate_name`,
          question: sql`excluded.question`,
          volume: sql`excluded.volume`,
          lastPrice: sql`excluded.last_price`,
          lastPriceAt: sql`excluded.last_price_at`,
          status: sql`excluded.status`,
          outcome: sql`excluded.outcome`,
          resolvedAt: sql`excluded.resolved_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  await upsertCandidates(
    markets
      .filter((m) => m.candidateName && m.party !== "O")
      .map((m) => ({ raceKey: m.raceKey, name: m.candidateName!, party: m.party })),
  );

  return {
    races: new Set(races.map((r) => r.key)).size,
    markets: markets.length,
    polymarketMarkets: pm.markets.length,
    kalshiMarkets: k.markets.length,
    kalshiErrors: errors.length,
    unmatchedSample: [...pm.unmatched.slice(0, 5), ...k.unmatched.slice(0, 5)],
  };
}
