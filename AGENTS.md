<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent guide: The Spread (2026 midterm tracker)

Tracks the 2026 US midterms (Senate, House, Governor, chamber control) and compares
**Polymarket**, **Kalshi** and **polls** (split by left/right-leaning pollsters) against results.
Live at https://midterm-three-mu.vercel.app. `README.md` covers architecture, methodology and the API
in depth; this file is the short version plus the rules that are easy to break.

## Stack and where things run

- **Next.js 16** (App Router, `cacheComponents: true`, `partialPrefetching: true`) on **Vercel**. Pushing to `main` deploys.
- **Postgres on Neon** via Drizzle ORM + postgres.js. `DATABASE_URL` is set in Vercel and as a GitHub Actions secret.
- **Data pipeline on GitHub Actions** (`.github/workflows/pipeline.yml`): every 15 min it runs
  `pnpm db:migrate` then `pnpm pipeline all`. Vercel only reads the database.
- Scope is deliberately limited to chamber control, Senate, House and Governor. No county, margin, turnout or primary markets.

## Layout

```
src/lib/sources/      upstream clients: polymarket.ts, kalshi.ts, votehub.ts (polls)
src/lib/pipeline/     steps: discover, prices, polls, pollsters, results, lock (lock + scores)
src/lib/races.ts      race keys and market-title parsing
src/lib/queries.ts    read side used by pages and /api routes
src/lib/forecasts.ts  locked projections: build, lock, score, scorecard data, CSV
src/lib/scoring.ts    pure scoring (Brier, log loss, calls, calibration, poll margin error)
src/lib/election.ts   election-night times, poll-close times, FINAL_LOCK_AT  (pure, client-safe)
src/lib/format.ts, search.ts, series.ts, poll-average.ts, stats.ts   pure helpers
src/app/              pages: / (Overview), /races, /races/[key], /live, /scorecard; /api/*
src/components/       UI (client components)
data/                 curated inputs: pollster-affiliations.json, candidate-parties.json, results.csv
design/               Claude Design handoff (reference only, excluded from lint)
drizzle/              generated SQL migrations (commit them)
```

## Commands

```bash
pnpm install
pnpm db:local        # local Postgres (PGlite) on :5432, data in .data/ (keep it running)
pnpm db:migrate
pnpm pipeline all    # or individual steps: pnpm pipeline prices polls
pnpm dev
pnpm typecheck       # next typegen && tsc --noEmit
pnpm lint
pnpm build
pnpm db:generate     # after editing src/lib/db/schema.ts; commit the new drizzle/ file
```

There is no test suite. Before pushing, run `pnpm typecheck`, `pnpm lint` and `pnpm build`, and check the
affected page in a browser at **390px and 1280px** wide.

## Conventions

- **Cache Components:** don't use `export const dynamic`. Pages render a static shell and put data
  in an async child inside `<Suspense>` that calls `await connection()` first. `params` and
  `searchParams` are Promises; read them inside the Suspense child. Avoid `usePathname()` /
  `useSearchParams()` in components rendered outside Suspense: they break prerendering of `/races/[key]`.
- **Client components must not import `@/lib/db` or `@/lib/queries`.** Keep shared logic in the pure modules listed above.
- **Raw SQL:** pass dates as `.toISOString()`; guard empty arrays before `in ${list}`.
- **Race keys:** `SEN-TX`, `GOV-FL`, `HOUSE-VA02`, `HOUSE-WYAL` (at-large), `CONTROL-SENATE`, `CONTROL-HOUSE`, `GENERIC`.
- **Probabilities** are stored and passed around as P(Democrat wins), 0..1, de-vigged per platform as
  `D / (D + R)` from the highest-volume D and R contracts. The UI shows both parties, either
  `D 66% · R 34%` or the favorite compactly (`D66`, `R58`), via `src/components/odds.tsx`.
- **Colors are fixed app-wide:** Polymarket `--color-accent` (purple), Kalshi `--color-kalshi` (amber),
  Dem `--color-dem` (blue), Rep `--color-rep` (red). Tokens live in `src/app/globals.css` (Nocturne
  design system); headings use weight 500, numbers use tabular figures.
- **Polls are vote-share margins** (`D+2`) and are never drawn on the same axis as market win probability.
- Match the surrounding code: small modules, comments only where the *why* isn't obvious.

## Rules that protect the data

- **Never modify or re-create the `2026-final` lock.** It is the frozen Nov 2, 9pm ET snapshot that
  everything is scored against. `LOCK_FORCE=1` exists only for test locks with another `LOCK_ID`
  (e.g. `LOCK_ID=test LOCK_AT=now LOCK_FORCE=1 pnpm pipeline lock scores`, viewed at `/scorecard?lock=test`).
  Delete test locks afterwards, and never create them in production.
- Never write fake or test results to the production database. Use the local PGlite database.
- Results come from market settlement plus `data/results.csv` (winner and vote shares). Editing
  that CSV and pushing is the supported way to add calls and vote shares; the next run re-scores.
- Never commit secrets. `.env*` is gitignored (except `.env.example`).

## Gotchas

- **Local PGlite is single-connection.** The client uses `max: 1` locally. Don't run `pnpm dev` and
  `pnpm pipeline` at the same time against it; interleaved statements return wrong results.
- **Kalshi rate-limits public reads.** Discovery runs at concurrency 3 with retries; don't raise it.
- If CSS changes don't show up in dev, stop the server and `rm -rf .next` (stale Turbopack cache).
- GitHub Actions turns off schedules after 60 days with no commits.
- Polls data comes from VoteHub; credit "Polls: VoteHub" wherever polls are shown.
