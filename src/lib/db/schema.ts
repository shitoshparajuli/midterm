import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  primaryKey,
  index,
  serial,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A contest we track. Keys look like:
 *   SEN-TX, GOV-FL, HOUSE-VA02, CONTROL-SENATE, CONTROL-HOUSE, GENERIC
 * (all implicitly for the 2026 cycle).
 */
export const races = pgTable("races", {
  key: text("key").primaryKey(),
  office: text("office").notNull(), // senate | house | governor | control | generic
  state: text("state"), // two-letter, null for national
  district: integer("district"),
  title: text("title").notNull(),
  electionDate: date("election_date").notNull().default("2026-11-03"),
  // Outcome. winnerParty is filled from market settlement or a results import.
  winnerParty: text("winner_party"), // D | R | I | O
  demPct: real("dem_pct"),
  repPct: real("rep_pct"),
  calledAt: timestamp("called_at", { withTimezone: true }),
  resultSource: text("result_source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const candidates = pgTable(
  "candidates",
  {
    id: serial("id").primaryKey(),
    raceKey: text("race_key").notNull().references(() => races.key),
    name: text("name").notNull(),
    party: text("party").notNull(), // D | R | I | O
  },
  (t) => [uniqueIndex("candidates_race_name").on(t.raceKey, t.name)],
);

/**
 * One binary prediction-market contract. "Yes" means `party` wins `raceKey`.
 * id = "<platform>:<externalId>"
 */
export const markets = pgTable(
  "markets",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(), // polymarket | kalshi
    raceKey: text("race_key").notNull().references(() => races.key),
    party: text("party").notNull(),
    candidateName: text("candidate_name"),
    externalId: text("external_id").notNull(), // PM conditionId | Kalshi market ticker
    tokenId: text("token_id"), // PM CLOB "Yes" token (needed for price history)
    seriesTicker: text("series_ticker"), // Kalshi (needed for candlesticks)
    eventId: text("event_id").notNull(), // PM event slug | Kalshi event ticker
    question: text("question").notNull(),
    url: text("url").notNull(),
    volume: real("volume").notNull().default(0),
    lastPrice: real("last_price"),
    lastPriceAt: timestamp("last_price_at", { withTimezone: true }),
    status: text("status").notNull(), // open | closed | resolved
    outcome: integer("outcome"), // 1 = yes won, 0 = no won, null = unresolved
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("markets_race").on(t.raceKey)],
);

/** Hourly price history (probability 0..1 of "Yes"). Short ranges are served live from upstream. */
export const pricePoints = pgTable(
  "price_points",
  {
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    price: real("price").notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.ts] })],
);

export const polls = pgTable(
  "polls",
  {
    id: text("id").primaryKey(), // upstream id (VoteHub)
    source: text("source").notNull(),
    raceKey: text("race_key").references(() => races.key), // null = couldn't match a tracked race
    pollType: text("poll_type").notNull(),
    subject: text("subject"),
    seatName: text("seat_name"),
    pollster: text("pollster").notNull(),
    sponsors: text("sponsors").array().notNull().default([]),
    partisan: text("partisan"), // D | R when sponsored by a party/campaign
    internal: boolean("internal").notNull().default(false),
    population: text("population"), // lv | rv | a
    sampleSize: integer("sample_size"),
    startDate: date("start_date"),
    endDate: date("end_date").notNull(),
    url: text("url"),
    demPct: real("dem_pct"),
    repPct: real("rep_pct"),
    margin: real("margin"), // demPct - repPct; null if parties couldn't be resolved
    answers: jsonb("answers").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("polls_race").on(t.raceKey), index("polls_pollster").on(t.pollster)],
);

/**
 * Pollster lean. `affiliation` is curated (who they mostly work for); `houseEffect` is
 * computed from data (avg D-R margin vs. other pollsters in the same race; + = more Democratic).
 */
export const pollsters = pgTable("pollsters", {
  name: text("name").primaryKey(),
  affiliation: text("affiliation"), // D | R | null
  houseEffect: real("house_effect"),
  houseEffectN: integer("house_effect_n").notNull().default(0),
  lean: text("lean"), // D | R | N  (final classification used for grouping)
  leanSource: text("lean_source"), // affiliation | house_effect | default
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineRuns = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  step: text("step").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  detail: jsonb("detail"),
});

/**
 * A frozen set of projections (e.g. "2026-final", taken Nov 2, 9pm ET). Never overwritten:
 * this is what gets scored against results, now and in future cycles.
 */
export const forecastLocks = pgTable("forecast_locks", {
  id: text("id").primaryKey(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(), // the moment the projections represent
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
});

/**
 * One source's projection for one race inside a lock.
 * source: polymarket | kalshi | polls:all | polls:nonpartisan | polls:D | polls:R | pollster:<name>
 */
export const forecasts = pgTable(
  "forecasts",
  {
    lockId: text("lock_id")
      .notNull()
      .references(() => forecastLocks.id),
    raceKey: text("race_key")
      .notNull()
      .references(() => races.key),
    source: text("source").notNull(),
    demWinProb: real("dem_win_prob"), // 0..1
    margin: real("margin"), // projected D−R vote margin in points (polls)
    detail: jsonb("detail").notNull(), // inputs: prices, market ids, volume, poll ids/dates, ...
  },
  (t) => [primaryKey({ columns: [t.lockId, t.raceKey, t.source] }), index("forecasts_source").on(t.lockId, t.source)],
);

/**
 * Scores per lock, source and scope ("all", "office:senate", "state:TX"). Recomputed as results
 * come in; kept so cycles can be compared later.
 */
export const forecastScores = pgTable(
  "forecast_scores",
  {
    lockId: text("lock_id")
      .notNull()
      .references(() => forecastLocks.id),
    source: text("source").notNull(),
    scope: text("scope").notNull(),
    n: integer("n").notNull(), // races scored (winner known, source had a projection)
    correct: real("correct").notNull(), // winner called (> 50%); exact 50% counts as half
    brier: real("brier"),
    logLoss: real("log_loss"),
    avgWinnerProb: real("avg_winner_prob"), // mean chance given to the eventual winner
    marginN: integer("margin_n").notNull().default(0),
    marginBias: real("margin_bias"), // mean (projected − actual) D−R margin; + = overstated Dems
    marginMae: real("margin_mae"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.lockId, t.source, t.scope] })],
);
