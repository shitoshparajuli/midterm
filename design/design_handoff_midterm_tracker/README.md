# Handoff: "The Spread" — US Midterms 2026 market tracker

## Overview
A public web app that tracks the 2026 US midterm elections and compares two prediction markets, **Polymarket (P)** and **Kalshi (K)**, against each other, against polls, and finally against real results. Three screens: **Overview**, **Race detail**, **Live** (election night, with search and an accuracy scorecard). Target stack: **Next.js (App Router) on Vercel**. Mobile-first, fully responsive to desktop.

## About the design files
The `.dc.html` files are **design references built in HTML**, not production code. Recreate them in Next.js/React using your own component patterns (e.g. Tailwind or CSS modules + a chart lib such as visx/Recharts, or hand-rolled SVG as the prototypes do). To view them, serve this folder locally (`npx serve .`) and open `Midterm Tracker.dc.html` (the canvas showing all screens at 390px and 1280px). Each screen file also opens on its own.

All data in the prototypes is **fake placeholder data** (fake state names like "Lakeshore", "Pine Hollow 03", generic pollsters). Logic/data shape lives in the `<script data-dc-script>` class at the bottom of each file — useful as a reference for derived fields.

## Fidelity
**High-fidelity.** Colors, type, spacing and interactions are final unless noted. Exact token values are below.

## Global conventions (apply everywhere)
- **Probability** = chance the first-named side wins (Dem, or "Yes" for ballot measures), 0–100.
- **Color code is fixed across the whole app:** Polymarket = accent `#9184d9` (text on dark: `#b5abfc`), Kalshi = amber `oklch(0.8 0.12 78)`. Never swap.
- **Gap** = `|P − K|` in points. **Split call** = P and K favor different winners (`(P>50) !== (K>50)`). Split calls are highlighted (accent-tinted tag `bg #423a6a / text #f5f4ff`, tile ring `0 0 0 1px #5d5294`).
- **Polls are NOT plotted on the same axis as markets.** Polls are a vote-share margin (D+2 = Dem ahead by 2 pts); markets are win probability. Polls get their own chart.
- Pollster lean colors: left-leaning `oklch(0.72 0.1 245)`, right-leaning `oklch(0.72 0.11 25)`. Same colors are used for Dem/Rep seat bars on Live.
- Numbers use `font-variant-numeric: tabular-nums`.

## Shared header (all screens)
- Container: `max-width: 1240px; margin: 0 auto`. Padding `18px 16px 0`.
- Row: `flex-wrap: wrap; gap: 12px 24px; align-items:center`.
  - Brand block `flex: 1 1 200px`: "The Spread" (19px / 500 / -0.015em) left, meta right (12px, `#9397ab`): "Nov 3 · 8 days" pre-election, "Nov 3 · 11:40 pm ET" on Live (should be live clock).
  - Tabs `flex: 1 1 340px; max-width: 520px`: segmented control, 1px `--color-divider` border, radius 8px, 3 equal tabs **Overview · Races · Live**, height 40px, 13px. Active: text `#9184d9` + `inset 0 0 0 1px #9184d9`. Inactive `#b2b6ca`. Hover: `color-mix(in srgb, #e9e9ed 7%, transparent)` bg. Live tab has a 6px accent dot with a 3px `#423a6a` halo (should pulse when results are live).
- On mobile the tabs wrap below the brand row; on desktop they sit right of it.

## Screen 1 — Overview (`Overview.dc.html`)
Purpose: at a glance, who controls each chamber per market, and which races to watch.

Layout: body `flex-wrap: wrap; gap: 28px; padding: 20px 16px 28px`.
- **Chart column** `flex: 3 1 520px`:
  - Chamber switch: "Senate" / "House" text tabs, 20px/500, active text `#e9e9ed` with 2px accent underline, inactive `#75798c`.
  - Big numbers: label 11px `#9397ab` ("Polymarket" / "Kalshi"), value 30px/500 (P `#b5abfc`, K amber), "%" at 15px. Gap tag next to them (11px, bg `#3f424d`, text `#f3f5fe`, radius 6px, padding 3px 8px): "5 pt gap" or "12 pt gap · split call".
  - Caption 13px `#b2b6ca`: "Chance Democrats win control".
  - Line chart, height 170 + 10px top/bottom padding, y-axis fixed 20–80% with gridlines at 70/50/30 (50% line `#595d6c`, others `#292b31`), labels 10px `#75798c` in a 30px left gutter. Two lines, stroke 2px: Kalshi drawn first, Polymarket on top. End-value labels in a 48px right gutter, 13px/500 in each market's color; nudge apart if within 16px vertically.
  - X labels 11px `#75798c`: start date … "Now".
  - Range segmented control (34px tall, 12px): **30D · All · Nov 3**. "Nov 3" is disabled (opacity .45) until election night, then becomes the minute-by-minute range. Legend right: dot + "Polymarket", dot + "Kalshi".
- **Races column** `flex: 2 1 320px`: heading "Races to watch" (16px/500) + "Dem / Yes chance" (12px muted). Grid `repeat(auto-fill, minmax(150px, 1fr)); gap: 8px`.
  - Tile: bg `#232532`, radius 8, padding 11px. Name 13px (ellipsis), type 11px muted, sparkline 34px tall (both markets, auto-scaled to their min/max ±3), then P value and K value (17px/500 in their colors) and gap label right (11px; accent-300 `#d2cefd` if split, else `#9397ab`). Hover bg `#292b31`. Split-call tiles get the accent ring. Tile click → Race detail.

## Screen 2 — Race detail (`Race Detail.dc.html`)
Purpose: deep-dive into one race: market history vs polls, polls split by pollster lean.

- Title block (padding `18px 16px 0`): "‹ All races" (13px, `#d2cefd`); race name 28px/500; "Senate · open seat" 13px; candidates line 14px `#cfd3e5`; split/gap tag.
- Body `flex-wrap: wrap; gap: 16px`. Two panels, each `flex: 1 1 440px`, bg `#232532`, radius 8, padding 14px. Side by side on desktop, stacked on mobile.
- **Markets panel:** kicker "PREDICTION MARKETS" (10px, 0.1em, uppercase, `#d2cefd`), subtitle "Chance Candidate A (D) wins", big P/K numbers, chart (150px, 20–80%), range control **30D · All · Nov 3**, legend.
- **Polls panel:** kicker "POLLS · DEM MARGIN"; explainer (13px `#b2b6ca`): "Vote-share lead in recent public polls. Markets show chance of winning, so the two use different scales."
  - 3 summary toggles (grid of 3): **All-poll avg** (dotted neutral `#e4e7f5`), **Left-leaning** avg, **Right-leaning** avg. Each shows a line-style swatch, label 11px, value 20px/500 (e.g. "D+2.1", "D+4.5", "R+1"). Click toggles visibility of that group's lines (hidden lines drop to opacity 0.08; the toggle drops to 0.45 and loses its `0 0 0 1px #595d6c` ring).
  - Chart 150px, y-axis −10…+10 margin, gridlines D+5 / Even / R+5. Lines: all-poll avg (dotted `2 3`, 2px, `#cfd3e5`), 2 left-leaning pollsters (blue, one solid one dashed `5 3`), 2 right-leaning (red, solid + dashed).
  - Pollster table: columns `20px swatch | name+lean | latest date | margin` (`20px 1fr 62px 52px`), header 10px uppercase muted, rows min-height 44px, row rules fade at both ends (see tokens).
- Margin format: `0 → "Even"`, positive `D+n`, negative `R+n`.

## Screen 3 — Live / election night (`Election Night.dc.html`)
Purpose: follow results as they come in, see how each market reacted, and score market accuracy.

Layout: `flex-wrap: wrap; gap: 20px 28px`. Left column `flex: 1 1 480px`, right column `flex: 1 1 400px`.
- **Chamber cards** (grid `auto-fit, minmax(220px,1fr)`): kicker "SENATE"/"HOUSE", "51 to win" / "218 to win"; Dem seats (22px/500 blue) · "4 uncalled" · Rep seats (red). Seat bar 8px tall, radius 4: Dem fill from left, Rep fill from right, `#3f424d` middle = uncalled, 2px `#e9e9ed` tick at the majority line. Clicking a card selects it (accent ring) and switches the chart.
- **Live chart:** title "Senate control", "Chance Dems win · since 7 pm"; big P/K values with change since poll close (e.g. "31% −13"); chart 0–100% with gridlines 75/50/25; **numbered event markers** (vertical 1px `#595d6c` line + 18px circle badge) at moments like a race call; x labels 7 pm / 9 pm / 11 pm / Now; event list below (number · time · label).
- **Scorecard** card (`box-shadow: 0 0 0 1px #3f424d`): "SCORECARD · 6 RACES CALLED", "Odds at poll close". For each market: "5/6 right" (22px/500) and "Brier 0.12". Footnote explaining "right" (winner > 50% at poll close) and Brier (0 perfect, lower better).
  - Brier = mean over called races of `(p/100 − outcome)²`, outcome 1 if side A won.
- **Search** (right column top): input 44px tall, bg `#232532`, 1px divider border, radius 8, 36px left padding for a search icon (use Phosphor `MagnifyingGlass`, the prototype draws a stand-in), placeholder "Search state, race or candidate". Focus border = accent. Filters live as you type (race name, type, state, candidate).
- **Filter chips** (32px tall, radius 16): All · Counting · Called · Split calls, each with a count (counts reflect the current search). Active chip = accent border + text.
- **Race rows** (sorted: uncalled first), row rule fades at ends, padding 12px 0:
  1. Name (15px) + type (11px muted) + status tag right: "Counting" / "Too early" (bg `#2b2741`, text `#d2cefd`) or "Called · D" (bg `#3f424d`).
  2. Vote bar (6px, side A from left, side B from right, party colors; for ballot measures Yes `#cfd3e5`, No `#75798c`) + text "D 51.2 · R 47.9 · 91%" (12px, `flex:none`).
  3. "P 61 → **99** ✓" and "K 49 → **98** ✗" (poll-close odds → now, ✓/✗ only after the call; ✓ `#f3f5fe`, ✗ `#9397ab`) + 72×22 sparkline of both markets tonight.
  - Empty state: 'No races match "{query}".'
- Row click → Race detail (with "Nov 3" range auto-selected).

## Interactions & behavior
- All toggles are instant (no animation in the prototype). Suggested: 150ms ease color/background transitions on tabs/chips; pulse the Live dot (opacity 1→.4, 1.6s loop).
- Hover: tabs/chips/tiles get a 5–7% text-color tint. Focus-visible: `outline: 2px solid #9184d9; outline-offset: 2px` on every interactive element.
- Hit targets ≥ 44px on mobile (tabs are 40px tall, so make the tap area at least 44px).
- Responsive comes from flex-wrap and auto-fill grids, with no breakpoint-specific markup. The layout is verified at 390px and 1280px.
- Post-election: Overview's range control unlocks "Nov 3"; consider Overview showing final results + final scorecard after all calls.

## State / data
Per race: `{ id, name, state, type: 'Senate'|'House'|'Governor'|'Ballot'|'Chamber', sideA, sideB, candidates, polymarket: {now, history[]}, kalshi: {now, history[]}, pollCloseOdds: {p, k}, polls: [{pollster, lean:'left'|'right'|'neutral', date, margin}], results: {aPct, bPct, reportingPct, called: 'a'|'b'|null, calledAt} }`.
Derived: gap, split, favorites, correctness ✓/✗, Brier, lean averages.
UI state: active tab, chamber (`sen|house`), range (`30d|all|night`), poll-group visibility `{avg,left,right}`, search query, filter (`all|counting|called|split`).

Implementation notes (suggested):
- Pull market prices server-side on a schedule (Vercel Cron) from the Polymarket and Kalshi public APIs, and store time series (e.g. Postgres/Neon or Vercel KV) so history and "odds at poll close" are preserved. Snapshot both markets at each state's poll-closing time.
- Map each race to the matching market on both platforms manually (a mapping table). Market titles differ.
- Election night: poll every 30–60s; use ISR/revalidate or client polling (SWR) for the Live tab.
- Results source: an official/AP-style feed of your choice. Not specified in the design.

## Design tokens (Nocturne design system — `_ds/.../styles.css`)
- Ground `#161826`, surface `#232532`, text `#e9e9ed`, divider `color-mix(in srgb, #e9e9ed 16%, transparent)`.
- Accent `#9184d9`; ramp 100 `#f5f4ff` · 200 `#e7e5fe` · 300 `#d2cefd` · 400 `#b5abfc` · 500 `#968ae0` · 600 `#796cbf` · 700 `#5d5294` · 800 `#423a6a` · 900 `#2b2741`.
- Neutral ramp 100 `#f3f5fe` · 200 `#e4e7f5` · 300 `#cfd3e5` · 400 `#b2b6ca` · 500 `#9397ab` · 600 `#75798c` · 700 `#595d6c` · 800 `#3f424d` · 900 `#292b31`.
- Additions for this product: Kalshi `oklch(0.8 0.12 78)`, Dem/left `oklch(0.72 0.1 245)`, Rep/right `oklch(0.72 0.11 25)`.
- Type: Inter (Google Fonts), headings weight 500 (never bolder). Sizes used: 10 (kicker, uppercase .1em), 11, 12, 13, 14, 15, 16, 17, 19, 20, 22, 26, 28, 30.
- Spacing: 2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4px (`--space-1…8`). The prototypes also use 6/8/10/12/14/16/18/20/24/28px gaps.
- Radius 4 / 8 / 14px; tags 6px; chips 16px.
- Shadows: sm `0 0 0 1px #3f424d`; md `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)`.
- Freestanding rules fade at both ends: `linear-gradient(to right, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent)` at 1px height.
- Icons: Phosphor.

## Assets
No images. Icons: Phosphor (search icon). No Polymarket/Kalshi logos are used. Names are text only.

## Files
- `Midterm Tracker.dc.html`: canvas showing every round of design exploration (round 1 = early options, round 2–3 = final screens at both widths).
- `Overview.dc.html`, `Race Detail.dc.html`, `Election Night.dc.html`: the three final screens (responsive).
- `_ds/.../styles.css`: Nocturne tokens + component classes. `support.js`: runtime needed only to open the `.dc.html` files.
