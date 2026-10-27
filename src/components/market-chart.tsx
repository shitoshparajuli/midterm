"use client";

import { useEffect, useRef, useState } from "react";
import { LineChart, type ChartPt } from "./line-chart";
import { fmtDate, fmtTime } from "@/lib/format";
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
  const grid = (narrow ? [70, 50, 30] : [75, 50, 25]).map((v) => ({ v, label: `${v}%` }));

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
      mid={50}
      height={height}
      gutterRight={endLabels ? 48 : 0}
      faintGrid={endLabels ? "var(--color-neutral-900)" : "var(--color-neutral-800)"}
      endLabels={
        endLabels
          ? [
              ...(lastP != null ? [{ v: lastP, text: `${Math.round(lastP)}%`, color: "var(--color-accent-400)" }] : []),
              ...(lastK != null ? [{ v: lastK, text: `${Math.round(lastK)}%`, color: "var(--color-kalshi)" }] : []),
            ]
          : undefined
      }
      events={events}
      xLabels={history ? [fmt(start), "Now"] : ["", ""]}
    />
  );
}
