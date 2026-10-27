"use client";

import { useEffect, useRef, useState } from "react";
import { DEM_AXIS, LineChart, partyBands, REP_AXIS, type ChartPt } from "./line-chart";
import { fmtDate, fmtTime, lead } from "@/lib/format";
import { nightStarted } from "@/lib/election";

export type Range = "1h" | "1d" | "1w" | "30d" | "all" | "night";
export interface History {
  start: number;
  end: number;
  series: { polymarket: { t: number; p: number }[]; kalshi: { t: number; p: number }[] };
}

const RANGES: { id: Range; label: string }[] = [
  { id: "1h", label: "1H" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W" },
  { id: "30d", label: "30D" },
  { id: "all", label: "All" },
  { id: "night", label: "Nov 3" },
];

/** Short ranges move fast, so they refresh while open. */
const REFRESH: Partial<Record<Range, number>> = { "1h": 60_000, "1d": 120_000, night: 60_000 };

export function useHistory(raceKey: string, range: Range, initial?: { range: Range; data: History }) {
  const id = `${raceKey}:${range}`;
  const [cache, setCache] = useState<Record<string, History>>(() =>
    initial ? { [`${raceKey}:${initial.range}`]: initial.data } : {},
  );
  const fetched = useRef(new Set<string>(initial ? [`${raceKey}:${initial.range}`] : []));

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/races/${raceKey}/history?range=${range}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((h: History) => {
          fetched.current.add(id);
          if (alive) setCache((c) => ({ ...c, [id]: h }));
        })
        .catch(() => {});
    if (!fetched.current.has(id) || REFRESH[range]) load();
    const timer = REFRESH[range] ? setInterval(load, REFRESH[range]) : undefined;
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [raceKey, range, id]);

  return cache[id] ?? null;
}

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const nightOpen = nightStarted();
  return (
    <div className="seg seg-range" role="group" aria-label="Chart range">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          className="seg-item"
          aria-pressed={r.id === value}
          disabled={r.id === "night" && !nightOpen}
          title={r.id === "night" && !nightOpen ? "Minute-by-minute from 7 pm ET on election night" : undefined}
          onClick={() => onChange(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      <span>
        <i style={{ background: "var(--color-accent)" }} />
        Polymarket
      </span>
      <span>
        <i style={{ background: "var(--color-kalshi)" }} />
        Kalshi
      </span>
    </div>
  );
}

/** End label for a P(D) value: the favourite and their chance ("R 58%"). */
const endText = (v: number) => {
  const l = lead(v / 100)!;
  return l.party ? `${l.party} ${l.pct}%` : "50%";
};

const toPts = (s: { t: number; p: number }[]): ChartPt[] => s.map((x) => ({ t: x.t, v: x.p * 100 }));

/** Market P(D) chart for one race: Kalshi under Polymarket, auto 20–80% or 0–100% axis. */
export function MarketLines({
  history,
  range,
  height = 150,
  endLabels = false,
  events,
  label,
}: {
  history: History | null;
  range: Range;
  height?: number;
  endLabels?: boolean;
  events?: { t: number; n: number }[];
  label: string;
}) {
  const p = toPts(history?.series.polymarket ?? []);
  const k = toPts(history?.series.kalshi ?? []);
  const vals = [...p, ...k].map((x) => x.v);
  const narrow = vals.length > 0 && Math.min(...vals) >= 20 && Math.max(...vals) <= 80;
  const domain: [number, number] = narrow ? [20, 80] : [0, 100];
  // P(D) above 50 reads as "Dem favored", below as "Rep favored": label both sides by party.
  const grid = (narrow ? [70, 50, 30] : [75, 50, 25]).map((v) =>
    v === 50
      ? { v, label: "50%" }
      : v > 50
        ? { v, label: `D ${v}`, color: DEM_AXIS }
        : { v, label: `R ${100 - v}`, color: REP_AXIS },
  );
  const bands = partyBands(domain[0], 50, domain[1], "DEM FAVORED", "REP FAVORED");

  const end = history?.end ?? 1;
  const first = Math.min(...[p[0]?.t, k[0]?.t].filter((t): t is number => t != null), end);
  const start = range === "all" ? first : (history?.start ?? 0);
  const short = range === "1h" || range === "1d" || range === "night";
  const fmt = short ? fmtTime : fmtDate;

  const lastP = p.at(-1)?.v;
  const lastK = k.at(-1)?.v;

  return (
    <LineChart
      label={label}
      series={[
        { pts: k, color: "var(--color-kalshi)" },
        { pts: p, color: "var(--color-accent)" },
      ]}
      start={start}
      end={end}
      domain={domain}
      grid={grid}
      bands={bands}
      gutterLeft={38}
      mid={50}
      height={height}
      gutterRight={endLabels ? 56 : 0}
      faintGrid={endLabels ? "var(--color-neutral-900)" : "var(--color-neutral-800)"}
      endLabels={
        endLabels
          ? [
              ...(lastP != null ? [{ v: lastP, text: endText(lastP), color: "var(--color-accent-400)" }] : []),
              ...(lastK != null ? [{ v: lastK, text: endText(lastK), color: "var(--color-kalshi)" }] : []),
            ]
          : undefined
      }
      events={events}
      xLabels={history ? [fmt(start), "Now"] : ["", ""]}
    />
  );
}
