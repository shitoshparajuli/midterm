"use client";

import { useEffect, useRef, useState } from "react";
import { fmtMargin } from "@/lib/format";
import { STATES } from "@/lib/races";
import { signed, type County, type HouseResult, type Place, type WorldCupData } from "@/lib/world-cup";

const AS_OF = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const fmtAsOf = (iso: string) => AS_OF.format(new Date(iso)).replace(" PM", " pm").replace(" AM", " am") + " ET";
const pctCounted = (c: number | null) => `${Math.floor((c ?? 0) * 100)}% counted`;
const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const shortCounty = (name: string) => name.replace(/ County$/, "");

/** "D+25" with the party letter in its color, as in the rest of the app. */
function Margin({ m }: { m: number | null }) {
  if (m == null) return <span className="muted">—</span>;
  const s = fmtMargin(m);
  if (s === "Even") return <span style={{ fontWeight: 500 }}>Even</span>;
  return (
    <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
      <span className={s[0] === "D" ? "c-dem" : "c-rep"}>{s[0]}</span>
      {s.slice(1)}
    </span>
  );
}

const Para = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: 14, color: "var(--color-neutral-300)", maxWidth: 720, lineHeight: 1.55 }}>{children}</p>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12, color: "var(--color-neutral-500)", maxWidth: 720, lineHeight: 1.5 }}>{children}</div>
);
const Heading = ({ kicker, children }: { kicker: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div className="kicker">{kicker}</div>
    <h2 style={{ fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.25, maxWidth: 720 }}>{children}</h2>
  </div>
);

export function WorldCupView({ data }: { data: WorldCupData }) {
  const { stats } = data;
  const done = (p: { counted: number | null }) => (p.counted ?? 0) >= data.minCounted;
  const counting = data.hosts.filter((h) => h.gap != null && !done(h));
  const byFips = new Map<string, { gap: number | null; shift: number | null; name: string }>([
    ...data.big.map((c) => [c.fips, { gap: c.gap, shift: c.shift24, name: c.name }] as const),
    ...data.hosts.map((h) => [h.fips, { gap: h.gap, shift: h.m24 != null && h.m20 != null ? h.m24 - h.m20 : null, name: h.county }] as const),
  ]);
  const gapOf = (fips: string) => signed(byFips.get(fips)?.gap ?? 0);
  const abs = (v: number | null | undefined) => Math.abs(v ?? 0).toFixed(1);
  const turnout = (v: number) => `${abs(v * 100)}% ${v >= 0 ? "better" : "worse"}`;
  const typicalTurnout = median(data.big.filter((c) => done(c) && c.turnoutGap != null).map((c) => c.turnoutGap!));
  // The prose below is written for the hosts looking like any other big counties; say so if a re-run changes that.
  const typical = stats.chance >= 0.1;
  const sameParty = data.hosts.every((h) => h.house24.winner === h.house26.winner);

  return (
    <div style={{ padding: "18px 16px 28px", display: "flex", flexDirection: "column", gap: 28 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="kicker">2026 midterms · Analysis</div>
        <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.1 }}>Did the World Cup move any votes?</h1>
        <Para>
          Eleven US metro areas hosted World Cup matches between June 11 and July 19, 2026. In November, the counties with the stadiums swung toward Democrats
          by about as much as the rest of their states did.{" "}
          {typical
            ? "We found no sign that the tournament moved votes."
            : "They stand out more than most groups of big counties do, though that alone doesn't make the World Cup the cause."}
        </Para>
        <Note>Results as of {fmtAsOf(data.asOf)}.</Note>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, maxWidth: 720 }}>
          <Stat label="Host counties" value={signed(stats.host.swing)} sub="swing toward Democrats" />
          <Stat label="Rest of their states" value={signed(stats.host.restSwing)} sub="swing toward Democrats" />
          <Stat label="Difference" value={signed(stats.host.gap)} sub="points" />
        </div>
        <Note>
          Swing is the change in the Democratic margin from the 2024 presidential race to the top race on the 2026 ballot. Averages cover the {stats.host.n}{" "}
          host counties that have finished counting
          {counting.length
            ? `; ${list(counting.map((h) => (shortCounty(h.county) === h.city ? h.county : `${shortCounty(h.county)} (${h.city})`)))} ${counting.length === 1 ? "is" : "are"} still counting`
            : ""}
          .
        </Note>
        <Para>
          Is {signed(stats.host.gap)} unusual? {typical ? "No." : "Somewhat."} Half of the country&apos;s big counties landed between {signed(stats.others.p25)}{" "}
          and {signed(stats.others.p75)} relative to their states. Pick {stats.host.n} big counties at random and {Math.round(stats.chance * 100)}% of the time
          they stray further from their states, on average, than the hosts did. The finalists FIFA passed over in 2022 averaged {signed(stats.notPicked.gap)}{" "}
          (the {stats.notPicked.n} that have finished counting).
        </Para>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Heading kicker="County by county">Each host county next to the rest of its state</Heading>
        <SwingChart data={data} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Heading kicker="The outliers">Miami-Dade&apos;s jump was a bounce-back from 2024</Heading>
        <Para>
          The counties that swung hardest to Trump in 2024 swung back hardest in 2026. Miami-Dade moved {abs(byFips.get("12086")?.shift)} points toward Trump in
          2024, one of the biggest shifts in the country, and its {gapOf("12086")} sits on the same line as the Bronx ({gapOf("36005")}) and Queens (
          {gapOf("36081")}), which hosted nothing. At the other end, Fulton County (Atlanta) trailed Georgia by {abs(byFips.get("13121")?.gap)} points, but
          neighboring DeKalb, with no matches at all, trailed by {abs(byFips.get("13089")?.gap)}.
        </Para>
        <Scatter data={data} />
        <Note>
          Each dot is a county that cast at least {data.minVotes.toLocaleString("en-US")} votes in 2024 and has counted {data.minCounted * 100}% of its 2026
          vote. The shaded band is where 8 in 10 of the non-host counties landed; the line is their trend. Measured against that line instead of zero, host
          counties average {signed(stats.hostVsTrend)}; a typical big county sits {stats.trend.sd.toFixed(1)} points from it.
        </Note>
        <CountyTable big={data.big} hosts={data.hosts} minCounted={data.minCounted} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Heading kicker="How they voted">The host counties in 2024 and 2026, and the House seat around each stadium</Heading>
        <Para>
          {sameParty ? "Every stadium's House seat stayed with the same party. " : ""}Texas and California were among the states that drew new House maps for
          2026, so a district can cover different ground in each year: NRG Stadium in Houston moved from TX-9 to TX-18.
        </Para>
        <VoteTable places={data.hosts} minCounted={data.minCounted} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Heading kicker="Turnout">Turnout didn&apos;t jump either</Heading>
        <Para>
          From 2024 to 2026, turnout in the host counties held up {turnout(stats.host.turnoutGap)} than in the rest of their states. That&apos;s ordinary: the
          typical big county did {turnout(typicalTurnout)} than its state.
        </Para>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="kicker">How this was measured</div>
        <ul style={{ fontSize: 13, color: "var(--color-neutral-400)", lineHeight: 1.55, maxWidth: 720, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>
            <b style={{ fontWeight: 500 }}>Swing</b>: the change in the Democratic margin (Democratic minus Republican votes, as a share of the two) from the
            2024 presidential race to the top race of 2026: Senate where there was one, otherwise governor. Washington and Missouri had neither, so there it is
            every House race added up.
          </li>
          <li>
            <b style={{ fontWeight: 500 }}>Against the rest of the state</b>: each county is compared with the rest of its own state, which voted in the same
            race, so the candidates and statewide trends cancel out.
          </li>
          <li>
            <b style={{ fontWeight: 500 }}>Host county</b>: the county with the stadium. New York/New Jersey is Bergen County (MetLife Stadium), Dallas is
            Tarrant (Arlington), Boston is Norfolk (Foxborough) and the San Francisco Bay Area is Santa Clara.
          </li>
          <li>
            <b style={{ fontWeight: 500 }}>Passed over</b>: the five US finalists FIFA didn&apos;t pick in June 2022:{" "}
            {list(data.notPicked.map((p) => `${p.city} (${p.stadium})`))}.
          </li>
          <li>
            <b style={{ fontWeight: 500 }}>Big county</b>: at least {data.minVotes.toLocaleString("en-US")} votes in 2024 ({data.big.length} counties). Counties
            with less than {data.minCounted * 100}% of their expected vote counted are shown faded and left out of the averages; their numbers will move as
            states like California and Washington finish counting.
          </li>
        </ul>
      </section>
    </div>
  );
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="panel" style={{ gap: 6 }}>
      <div className="big-label">{label}</div>
      <div className="big-value" style={{ fontVariantNumeric: "proportional-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>{sub}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- swing dumbbells */

const tick = (v: number) => (v === 0 ? "0" : signed(v, 0));

interface Axis {
  ticks: number[];
  x: (v: number) => string;
}

/** One row per place: rest-of-state swing (ring) joined to the county's swing (dot), on one shared axis. */
function SwingChart({ data }: { data: WorldCupData }) {
  const all = [...data.hosts, ...data.notPicked];
  const vals = all.flatMap((p) => [p.swing, p.restSwing]).filter((v): v is number => v != null);
  const lo = Math.min(0, Math.floor(Math.min(...vals) / 10) * 10);
  const hi = Math.ceil(Math.max(...vals) / 10) * 10;
  const axis: Axis = {
    ticks: Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10),
    x: (v: number) => `${((v - lo) / (hi - lo)) * 100}%`,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 880 }}>
      <div className="legend" style={{ flexWrap: "wrap" }}>
        <span>
          <i style={{ background: "var(--color-neutral-100)" }} />
          County
        </span>
        <span>
          <i style={{ border: "2px solid var(--color-neutral-400)", width: 10, height: 10 }} />
          Rest of its state
        </span>
        <span>Swing toward Democrats, 2024 → 2026, in points</span>
      </div>
      <SwingGroup title="Hosts" places={data.hosts} axis={axis} minCounted={data.minCounted} />
      <SwingGroup title="Passed over by FIFA in 2022" places={data.notPicked} axis={axis} minCounted={data.minCounted} />
      <div className="wc-row" style={{ background: "none", padding: 0 }}>
        <div style={{ gridArea: "track", position: "relative", height: 14, fontSize: 11, color: "var(--color-neutral-500)" }}>
          {axis.ticks.map((t) => (
            <span key={t} style={{ position: "absolute", left: axis.x(t), transform: t === lo ? "none" : t === hi ? "translateX(-100%)" : "translateX(-50%)" }}>
              {tick(t)}
            </span>
          ))}
        </div>
      </div>
      <Note>
        Faded rows are still counting. Seattle&apos;s and Kansas City&apos;s states had no Senate or governor race, so those use the total House vote.
      </Note>
    </div>
  );
}

function SwingGroup({ title, places, axis: { ticks, x }, minCounted }: { title: string; places: Place[]; axis: Axis; minCounted: number }) {
  const done = (p: Place) => (p.counted ?? 0) >= minCounted;
  const order = [...places].sort((a, b) => Number(done(b)) - Number(done(a)) || (b.gap ?? -99) - (a.gap ?? -99));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div className="wc-row wc-head">
        <div style={{ gridArea: "name", fontSize: 12, color: "var(--color-neutral-400)" }}>{title}</div>
        <div style={{ gridArea: "gap", fontSize: 11, color: "var(--color-neutral-500)", textAlign: "right" }}>vs. state</div>
      </div>
      {order.map((p) => (
        <div key={p.fips} className="wc-row" style={{ opacity: done(p) || p.gap == null ? 1 : 0.55 }}>
          <div style={{ gridArea: "name", minWidth: 0 }}>
            <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.city}</div>
            <div style={{ fontSize: 11, color: "var(--color-neutral-500)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {shortCounty(p.county)}, {p.state}
              {p.gap == null ? "" : ` · ${signed(p.swing!)} vs. ${signed(p.restSwing!)}`}
              {p.gap != null && !done(p) ? ` · ${pctCounted(p.counted)}` : ""}
            </div>
          </div>
          <div style={{ gridArea: "track", position: "relative", height: 22 }} aria-hidden>
            {ticks.map((t) => (
              <div
                key={t}
                style={{
                  position: "absolute",
                  left: x(t),
                  top: 2,
                  bottom: 2,
                  width: 1,
                  background: t === 0 ? "var(--color-neutral-600)" : "var(--color-neutral-800)",
                }}
              />
            ))}
            {p.swing != null && p.restSwing != null && (
              <>
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    height: 2,
                    left: x(Math.min(p.swing, p.restSwing)),
                    width: `calc(${x(Math.max(p.swing, p.restSwing))} - ${x(Math.min(p.swing, p.restSwing))})`,
                    background: "var(--color-neutral-500)",
                  }}
                />
                <div className="wc-ring" style={{ left: x(p.restSwing) }} />
                <div className="wc-dot" style={{ left: x(p.swing) }} />
              </>
            )}
          </div>
          <div style={{ gridArea: "gap", textAlign: "right", fontSize: 14, fontWeight: 500 }}>
            {p.gap == null ? <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-neutral-500)" }}>no race</span> : signed(p.gap)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- scatter */

type Point = County & { host: string | null };
const LABELS: Record<string, { text: string; side: "left" | "right" | "above" }> = {
  "12086": { text: "Miami-Dade", side: "right" },
  "13121": { text: "Fulton", side: "right" },
  "13089": { text: "DeKalb", side: "left" },
  "36005": { text: "Bronx, Queens", side: "above" },
};

/** 2026 gap vs. the 2020 → 2024 shift for every big county that has finished counting; hosts highlighted. */
function Scatter({ data }: { data: WorldCupData }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<Point | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hostCity = new Map(data.hosts.map((h) => [h.fips, h.city]));
  const pts: Point[] = data.big
    .filter((c) => c.counted >= data.minCounted)
    .map((c) => ({ ...c, host: hostCity.get(c.fips) ?? null }))
    .sort((a, b) => Number(!!a.host) - Number(!!b.host));
  const h = w < 520 ? 300 : 360;
  const pad = { l: 34, r: 10, t: 20, b: 34 };
  const xs = pts.map((p) => p.shift24);
  const ys = pts.map((p) => p.gap);
  const [x0, x1] = [Math.floor(Math.min(...xs) / 5) * 5, Math.ceil(Math.max(...xs, 0) / 5) * 5];
  // Headroom above the top dot for its label.
  const [y0, y1] = [Math.floor(Math.min(...ys) / 5) * 5, Math.ceil((Math.max(...ys) + 2) / 5) * 5];
  const X = (v: number) => pad.l + ((v - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + ((y1 - v) / (y1 - y0)) * (h - pad.t - pad.b);
  const { a, b } = data.stats.trend;
  const { p10, p90 } = data.stats.others;
  const xticks = Array.from({ length: (x1 - x0) / 5 + 1 }, (_, i) => x0 + i * 5).filter((v) => w >= 520 || v % 10 === 0);
  const yticks = Array.from({ length: (y1 - y0) / 5 + 1 }, (_, i) => y0 + i * 5);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const [mx, my] = [e.clientX - r.left, e.clientY - r.top];
    let best: Point | null = null;
    let bestD = 24 * 24;
    for (const p of pts) {
      const d = (X(p.shift24) - mx) ** 2 + (Y(p.gap) - my) ** 2;
      if (d < bestD) [best, bestD] = [p, d];
    }
    setHover(best);
  };

  return (
    <div style={{ maxWidth: 880 }}>
      <div className="legend" style={{ marginBottom: 8, flexWrap: "wrap" }}>
        <span>
          <i style={{ background: "var(--color-neutral-100)" }} />
          Host county
        </span>
        <span>
          <i style={{ background: "var(--color-neutral-600)" }} />
          Other big county
        </span>
        <span>Shaded: 8 in 10 counties</span>
      </div>
      <div ref={box} style={{ position: "relative", height: h }}>
        {w > 0 && (
          <svg
            width={w}
            height={h}
            style={{ display: "block", touchAction: "pan-y" }}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label="Scatter plot: each big county's 2026 swing against its state, by how far it swung to Trump in 2024. Host counties sit among the others."
          >
            <rect x={pad.l} y={Y(p90)} width={w - pad.l - pad.r} height={Y(p10) - Y(p90)} fill="color-mix(in srgb, var(--color-text) 5%, transparent)" />
            {yticks.map((v) => (
              <g key={v}>
                <line
                  x1={pad.l}
                  x2={w - pad.r}
                  y1={Y(v)}
                  y2={Y(v)}
                  stroke={v === 0 ? "var(--color-neutral-600)" : "var(--color-neutral-800)"}
                  strokeWidth={1}
                />
                <text x={pad.l - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-neutral-500)">
                  {tick(v)}
                </text>
              </g>
            ))}
            {xticks.map((v) => (
              <text key={v} x={X(v)} y={h - pad.b + 16} textAnchor="middle" fontSize={11} fill="var(--color-neutral-500)">
                {tick(v)}
              </text>
            ))}
            <text x={pad.l} y={12} fontSize={11} fill="var(--color-neutral-400)">
              ↑ Moved more toward Democrats than its state in 2026
            </text>
            <text x={w - pad.r} y={h - 2} textAnchor="end" fontSize={11} fill="var(--color-neutral-400)">
              ← Swung toward Trump in 2024 (2020 → 2024, points)
            </text>
            <line x1={X(x0)} x2={X(x1)} y1={Y(a + b * x0)} y2={Y(a + b * x1)} stroke="var(--color-neutral-500)" strokeWidth={1.5} strokeLinecap="round" />
            {pts.map((p) => (
              <circle
                key={p.fips}
                cx={X(p.shift24)}
                cy={Y(p.gap)}
                r={p.host ? 5 : 3.5}
                fill={p.host ? "var(--color-neutral-100)" : "var(--color-neutral-600)"}
                stroke="var(--color-bg)"
                strokeWidth={2}
              />
            ))}
            {pts.flatMap((p) => {
              const l = LABELS[p.fips];
              if (!l) return [];
              const [dx, dy] = l.side === "left" ? [-9, 4] : l.side === "right" ? [9, 4] : [-4, -9];
              return [
                <text
                  key={p.fips}
                  x={X(p.shift24) + dx}
                  y={Y(p.gap) + dy}
                  textAnchor={l.side === "left" ? "end" : "start"}
                  fontSize={11}
                  fill={p.host ? "var(--color-neutral-100)" : "var(--color-neutral-400)"}
                >
                  {l.text}
                </text>,
              ];
            })}
            {hover && (
              <circle cx={X(hover.shift24)} cy={Y(hover.gap)} r={hover.host ? 8 : 6.5} fill="none" stroke="var(--color-accent-300)" strokeWidth={1.5} />
            )}
          </svg>
        )}
        {hover && (
          <div
            className="wc-tip"
            style={{
              left: Math.min(Math.max(X(hover.shift24) - 100, 0), Math.max(0, w - 200)),
              top: Y(hover.gap) + (Y(hover.gap) > h / 2 ? -14 : 14),
              transform: Y(hover.gap) > h / 2 ? "translateY(-100%)" : undefined,
            }}
          >
            <div style={{ fontWeight: 500 }}>{signed(hover.gap)} vs. state</div>
            <div style={{ color: "var(--color-neutral-300)" }}>
              {hover.name}, {STATES[hover.state] ?? hover.state}
              {hover.host ? ` · ${hover.host} host` : ""}
            </div>
            <div style={{ color: "var(--color-neutral-500)" }}>
              Swing 2024: {signed(hover.shift24)} · 2026: {signed(hover.swing)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The scatter as a table. */
function CountyTable({ big, hosts, minCounted }: { big: County[]; hosts: Place[]; minCounted: number }) {
  const host = new Map(hosts.map((h) => [h.fips, h.city]));
  const rows = big.filter((c) => c.counted >= minCounted).sort((a, b) => b.gap - a.gap);
  return (
    <details className="wc-details">
      <summary>All {rows.length} counties as a table</summary>
      <div className="wc-ctable">
        <div className="wc-ctable-row wc-ctable-head">
          <span>County</span>
          <span>2024 swing</span>
          <span>2026 swing</span>
          <span>vs. state</span>
        </div>
        {rows.map((c) => (
          <div key={c.fips} className="wc-ctable-row">
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shortCounty(c.name)}, {c.state}
              {host.has(c.fips) && <span style={{ color: "var(--color-accent-300)" }}> · {host.get(c.fips)}</span>}
            </span>
            <span>{signed(c.shift24)}</span>
            <span>{signed(c.swing)}</span>
            <span style={{ fontWeight: 500 }}>{signed(c.gap)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

/* ---------------------------------------------------------------- vote table */

function House({ before, after }: { before: HouseResult; after: HouseResult }) {
  const one = (r: HouseResult) =>
    r.margin == null ? (
      <span style={{ whiteSpace: "nowrap" }}>
        <span className={r.winner === "D" ? "c-dem" : "c-rep"} style={{ fontWeight: 500 }}>
          {r.winner}
        </span>{" "}
        <span className="muted">unopposed</span>
      </span>
    ) : (
      <Margin m={r.margin} />
    );
  const moved = before.district !== after.district;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "2px 6px", alignItems: "baseline" }}>
      <span className="muted">{before.district}</span>
      {one(before)}
      <span className="muted">→</span>
      {moved && <span className="muted">{after.district}</span>}
      {one(after)}
    </span>
  );
}

function VoteTable({ places, minCounted }: { places: Place[]; minCounted: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", maxWidth: 960 }}>
      <div className="wc-vrow wc-vhead">
        <span>Host</span>
        <span>2024 president</span>
        <span>2024 Senate</span>
        <span>2026 top race</span>
        <span>Stadium&apos;s House seat, 2024 → 2026</span>
      </div>
      {places.map((p) => (
        <div key={p.fips} className="wc-vrow">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14 }}>{p.city}</div>
            <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>
              {p.stadium}
              {p.site ? `, ${p.site}` : ""} · {p.county}, {p.state}
            </div>
          </div>
          <div>
            <span className="wc-vlabel">2024 president</span>
            <Margin m={p.m24} />
          </div>
          <div>
            <span className="wc-vlabel">2024 Senate</span>
            {p.senate24 == null ? <span className="muted">No race</span> : <Margin m={p.senate24} />}
          </div>
          <div>
            <span className="wc-vlabel">2026 top race</span>
            {p.m26 == null ? (
              <span className="muted">—</span>
            ) : (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                <Margin m={p.m26} />
                <span className="muted" style={{ fontSize: 12 }}>
                  {p.race}
                  {(p.counted ?? 0) < minCounted ? ` · ${pctCounted(p.counted)}` : ""}
                </span>
              </span>
            )}
          </div>
          <div>
            <span className="wc-vlabel">Stadium&apos;s House seat</span>
            <House before={p.house24} after={p.house26} />
          </div>
        </div>
      ))}
    </div>
  );
}
