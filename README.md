# Midterm Tracker

Tracks the 2026 US midterms (Senate, House, Governor and chamber control) and measures how
well **Polymarket** and **Kalshi** predicted them, compared with polls from **left-** and
**right-leaning pollsters**.

Next.js on Vercel · Postgres (Neon) · data pipeline on GitHub Actions.

## Architecture

```
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │  Polymarket  │  │    Kalshi    │  │   VoteHub    │
            │ gamma + CLOB │  │  trade-api   │  │  polls API   │
            └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                   │  public, no API keys needed       │
   GitHub Actions  ▼  every 15 min  (scripts/pipeline.ts)
   ┌────────────────────────────────────────────────────────────┐
   │ discover → prices → polls → pollsters → results            │
   └───────────────────────────┬────────────────────────────────┘
                               ▼
                       Postgres (Neon)
                               │
   Vercel (Next.js)            ▼
   ┌────────────────────────────────────────────────────────────┐
   │ /api/races  /api/races/:key  /api/races/:key/history       │
   │ /api/polls  /api/pollsters   /api/accuracy  /api/status    │
   │ 1h / 1d charts read upstream live (1–5 min resolution)     │
   │ 1w / 30d / all charts read stored hourly history           │
   └────────────────────────────────────────────────────────────┘
```

### Pipeline steps (`src/lib/pipeline/`)

| step | what it does |
|---|---|
| `discover` | Pulls every 2026 Senate/House/Governor/control market from both platforms, parses titles into a common race key (`SEN-TX`, `GOV-FL`, `HOUSE-VA02`, `HOUSE-WYAL`, `CONTROL-SENATE`, ...), and records party, candidate, volume, latest price and settlement. Margin, turnout, county, primary and combo markets are skipped. |
| `prices` | Incremental **hourly** price history for each market (the first run backfills `BACKFILL_DAYS`). It stores a point only when the price moves, plus a 6-hour heartbeat. Markets under `MIN_MARKET_VOLUME` (default $10k) are skipped; their charts load live from upstream instead. |
| `polls` | Pulls VoteHub polls (`us-senator`, `governor`, `us-representative`, `generic-ballot`), maps each one to a race, and works out the D−R margin by matching poll answers to candidate parties learned from the markets. |
| `pollsters` | Classifies each pollster's lean (see below). |
| `results` | Marks a race's winner when a "party X wins" contract settles YES. An optional `data/results.csv` overrides this and adds vote shares (needed to score poll *margins*). |

### Race-level probability

Both platforms list separate D and R contracts. A platform's number is the
**de-vigged** `P(D) = D / (D + R)`, using the highest-volume D and R contracts in that race.
Prices are the mid of the bid and ask when the spread is ≤ 10¢, otherwise the last trade.

### Left- vs right-leaning pollsters

Two signals, stored per pollster in `pollsters`:

1. **Affiliation** (curated, `data/pollster-affiliations.json`): firms that mostly work for
   one party. `N` marks bipartisan teams. Edit this freely.
2. **House effect** (computed): the average amount a pollster's D−R margin differs from other
   pollsters' polls of the *same race* within ±30 days, shrunk toward 0 for small samples.
   Positive means more Democratic.

`lean` = affiliation if listed, else the house effect if it's at least 2 pts over 3 or more
matched polls, else neutral. A poll counts for the D or R group if its pollster leans that way
**or** a party/campaign sponsored it (VoteHub's `partisan` flag).

Poll averages (`src/lib/poll-average.ts`) weight polls by recency (14-day half-life) and
√sample size, and split each pollster's weight across its polls. They're computed separately for `all`,
`nonpartisan`, `D` and `R`. A margin is turned into a win probability with
`Φ(margin / σ)`, where σ = 6.5 pts (Senate/Gov) or 7.5 (House), roughly the historical polling
error.

### Accuracy (`/api/accuracy?checkpoint=30d|7d|1d|0d`)

For every race with a winner, each source's P(D) is taken at the checkpoint (days before
election morning, 6am ET on Nov 3). The response reports the following for Polymarket, Kalshi,
and polls (all / nonpartisan / D-leaning / R-leaning):

- **Brier score** and **log loss** (lower is better), and the share of races called correctly
- **margin bias / MAE** for polls (needs vote shares in `results.csv`). A positive bias means
  the polls overstated Democrats.
- **calibration** bins for the markets (how often 60–70% favourites actually won, and so on)

## API

| endpoint | notes |
|---|---|
| `GET /api/races?office=senate` | every race with current P(D) per platform and the poll average |
| `GET /api/races/SEN-TX` | candidates, all markets, poll averages by lean group, poll list |
| `GET /api/races/SEN-TX/history?range=1h\|1d\|1w\|30d\|all` | `series.polymarket`/`series.kalshi` as `[{t, p}]`; `polls.<group>` daily averages for 1w+ |
| `GET /api/polls?race=SEN-TX&lean=R` | raw polls with `pollsterLean` |
| `GET /api/pollsters` | lean, affiliation and house effect |
| `GET /api/accuracy?checkpoint=1d&office=senate` | scoring (see above) |
| `GET /api/status` | recent pipeline runs, for a "last updated" badge |

Responses send `s-maxage` headers, so the Vercel CDN absorbs traffic (30s for the 1h chart,
up to 15 min for the long ranges).

## Local development

```bash
pnpm install
cp .env.example .env
pnpm db:local          # embedded Postgres (PGlite) on :5432, data in .data/; keep it running
pnpm db:migrate
pnpm pipeline all      # first run takes a few minutes (backfill)
pnpm dev               # http://localhost:3000
```

Run individual steps with `pnpm pipeline prices polls`. After changing
`src/lib/db/schema.ts`, run `pnpm db:generate` and commit the new file in `drizzle/`.

## Deploy

1. **Database**: in Vercel, open Storage → Marketplace → **Neon** and connect it to the project. This
   sets `DATABASE_URL`. Use the *pooled* connection string.
2. **Vercel**: import this repo. No other env vars are needed.
3. **Pipeline**: add the same `DATABASE_URL` as a GitHub repo secret (Settings → Secrets → Actions).
   `.github/workflows/pipeline.yml` runs migrations plus the full pipeline every 15 min. Trigger it
   manually once from the Actions tab to backfill.

Vercel Cron isn't used because Hobby plans only allow daily jobs. GitHub Actions is free for public
repos and has no function timeout.

## Data sources & caveats

- **Polymarket**: `gamma-api.polymarket.com` (events/markets), `clob.polymarket.com/prices-history`.
- **Kalshi**: `api.elections.kalshi.com/trade-api/v2` (series/events/markets/candlesticks). Public
  reads are rate-limited, so discovery runs at a concurrency of 3.
- **Polls**: [VoteHub](https://votehub.com/polls/) public API. Credit VoteHub wherever polls are shown.
- **Results**: market settlement gives the winner automatically. Vote shares (for poll-margin error)
  come from `data/results.csv`; fill it from AP/state results, or wire up a paid feed
  (AP Elections API, Decision Desk HQ) behind the same `results` step.
- Races whose main challenger is an independent (e.g. NE Senate) or that are same-party top-two
  races (some CA/WA seats) have no D−R poll margin.
- Candidates whose party the market labels don't give (e.g. Alaska) go in `data/candidate-parties.json`.
