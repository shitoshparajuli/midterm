"use client";

import Link from "next/link";
import { useState } from "react";
import { Legend, MarketLines, RangePicker, useHistory, type History, type Range } from "./market-chart";
import { LineChart } from "./line-chart";
import { compare, fmtDate, fmtDay, fmtMargin, fmtPct, officeLabel, raceName } from "@/lib/format";
import { STATES } from "@/lib/races";

type Avg = { margin: number; polls: number; pollsters: number } | null;
type PollPt = { t: number; margin: number };
export interface RaceDetailData {
  race: { key: string; office: string; state: string | null; title: string; winnerParty: string | null };
  names: { D: string | null; R: string | null };
  current: { polymarket: number | null; kalshi: number | null };
  pollAverages: { all: Avg; D: Avg; R: Avg };
  pollLines: { start: number; end: number; lines: { all: PollPt[]; D: PollPt[]; R: PollPt[] } };
  polls: { id: string; pollster: string; endDate: string; margin: number | null; partisan: string | null; pollsterLean: string | null }[];
}

type Group = "avg" | "left" | "right";
const COLOR = { avg: "var(--color-neutral-300)", left: "var(--color-dem)", right: "var(--color-rep)", neutral: "var(--color-neutral-500)" };

const sideOf = (p: { pollsterLean: string | null; partisan: string | null }): Group | "neutral" =>
  p.pollsterLean === "D" || p.partisan === "D" ? "left" : p.pollsterLean === "R" || p.partisan === "R" ? "right" : "neutral";

function leanText(p: { pollsterLean: string | null; partisan: string | null }) {
  if (p.partisan === "D" && p.pollsterLean !== "D") return "Dem-sponsored";
  if (p.partisan === "R" && p.pollsterLean !== "R") return "GOP-sponsored";
  return p.pollsterLean === "D" ? "Left-leaning" : p.pollsterLean === "R" ? "Right-leaning" : "Nonpartisan";
}

export function RaceDetail({ data, initial }: { data: RaceDetailData; initial: History }) {
  const { race, names, current } = data;
  const [range, setRange] = useState<Range>("30d");
  const history = useHistory(race.key, range, { range: "30d", data: initial });
  const cmp = compare(current.polymarket, current.kalshi);

  const sub =
    race.office === "house" && race.state ? `House · ${STATES[race.state] ?? race.state}` : officeLabel(race.office);
  const who =
    race.office === "control"
      ? "Chance Democrats win control"
      : names.D
        ? `Chance ${names.D} (D) wins`
        : "Chance the Democrat wins";

  return (
    <>
      <div style={{ padding: "18px 16px 0", display: "flex", flexDirection: "column", gap: 6 }}>
        <Link href="/races" style={{ fontSize: 13, color: "var(--color-accent-300)", alignSelf: "flex-start" }}>
          ‹ All races
        </Link>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.1 }}>{raceName(race)}</h1>
          <div style={{ fontSize: 13, color: "var(--color-neutral-400)" }}>{sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {(names.D || names.R) && (
            <div style={{ fontSize: 14, color: "var(--color-neutral-300)" }}>
              {[names.D && `${names.D} (D)`, names.R && `${names.R} (R)`].filter(Boolean).join(" vs ")}
            </div>
          )}
          {race.winnerParty && <div className="tag">Called · {race.winnerParty}</div>}
          {cmp && <div className={`tag${cmp.split ? " tag-split" : ""}`}>{cmp.split ? `Split call · ${cmp.gap} pt gap` : cmp.label}</div>}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "18px 16px 28px", alignItems: "flex-start" }}>
        <section className="panel" style={{ flex: "1 1 440px" }}>
          <div className="kicker">Prediction markets</div>
          <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginTop: -4 }}>{who}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
            <div className="big">
              <div className="big-label">Polymarket</div>
              <div className="big-value c-pm">
                {fmtPct(current.polymarket)}
                <small>%</small>
              </div>
            </div>
            <div className="big">
              <div className="big-label">Kalshi</div>
              <div className="big-value c-k">
                {fmtPct(current.kalshi)}
                <small>%</small>
              </div>
            </div>
          </div>
          <MarketLines history={history} range={range} label={`${raceName(race)} market odds over time`} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <RangePicker value={range} onChange={setRange} />
            <Legend />
          </div>
        </section>
        {race.office !== "control" && <PollsPanel data={data} />}
      </div>
    </>
  );
}

function PollsPanel({ data }: { data: RaceDetailData }) {
  const [show, setShow] = useState<Record<Group, boolean>>({ avg: true, left: true, right: true });
  const { pollAverages: avg, pollLines } = data;
  const { start, end, lines } = pollLines;

  const inWindow = data.polls.filter((p) => p.margin != null && Date.parse(p.endDate) / 1000 >= start);
  const maxAbs = Math.max(10, ...inWindow.map((p) => Math.abs(p.margin!)), ...lines.all.map((p) => Math.abs(p.margin)));
  const lim = Math.ceil(maxAbs / 5) * 5;
  const half = lim / 2;

  const groups: { key: Group; label: string; value: Avg; dash: string }[] = [
    { key: "avg", label: "All-poll avg", value: avg.all, dash: "dotted" },
    { key: "left", label: "Left-leaning", value: avg.D, dash: "solid" },
    { key: "right", label: "Right-leaning", value: avg.R, dash: "solid" },
  ];
  const op = (g: Group) => (show[g] ? 1 : 0.08);
  const toPts = (pts: PollPt[]) => pts.map((p) => ({ t: p.t, v: p.margin }));

  // Latest poll per pollster.
  const latest = new Map<string, RaceDetailData["polls"][number]>();
  for (const p of data.polls) if (p.margin != null && !latest.has(p.pollster)) latest.set(p.pollster, p);
  const table = [...latest.values()].slice(0, 8);

  return (
    <section className="panel" style={{ flex: "1 1 440px" }}>
      <div className="kicker">Polls · Dem margin</div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-400)", marginTop: -4, textWrap: "pretty" }}>
        Vote-share lead in recent public polls. Markets show chance of winning, so the two use different scales.
      </div>
      {!latest.size ? (
        <div className="empty">No public polls of this race with a Democrat-vs-Republican matchup yet.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                className="group-toggle"
                aria-pressed={show[g.key]}
                onClick={() => setShow((s) => ({ ...s, [g.key]: !s[g.key] }))}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-neutral-400)", whiteSpace: "nowrap" }}>
                  <div style={{ width: 12, borderTop: `2px ${g.dash} ${g.key === "avg" ? "var(--color-neutral-200)" : COLOR[g.key]}` }} />
                  {g.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 500, color: g.key === "avg" ? "var(--color-neutral-200)" : COLOR[g.key] }}>
                  {fmtMargin(g.value?.margin)}
                </div>
              </button>
            ))}
          </div>
          <LineChart
            label="Poll averages over time"
            series={[
              { pts: toPts(lines.D), color: COLOR.left, width: 1.75, opacity: op("left") },
              { pts: toPts(lines.R), color: COLOR.right, width: 1.75, opacity: op("right") },
              { pts: toPts(lines.all), color: COLOR.avg, width: 2, dash: "2 3", opacity: op("avg") },
            ]}
            dots={inWindow.map((p) => {
              const side = sideOf(p);
              return {
                t: Date.parse(`${p.endDate}T12:00:00Z`) / 1000,
                v: p.margin!,
                color: COLOR[side],
                opacity: (side === "neutral" ? show.avg : show[side]) ? 0.75 : 0.08,
              };
            })}
            start={start}
            end={end}
            domain={[-lim, lim]}
            grid={[half, 0, -half].map((v) => ({ v, label: fmtMargin(v) }))}
            mid={0}
            gutterLeft={34}
            xLabels={[fmtDate(start), "Now"]}
          />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
            <div
              className="ptable-row"
              style={{ padding: "6px 0", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-500)", background: "var(--rule)" }}
            >
              <div />
              <div>Pollster</div>
              <div>Latest</div>
              <div style={{ textAlign: "right" }}>Margin</div>
            </div>
            {table.map((p) => {
              const color = COLOR[sideOf(p)];
              return (
                <div key={p.pollster} className="ptable-row" style={{ minHeight: 44, fontSize: 14, background: "var(--rule-soft)" }}>
                  <div style={{ width: 14, borderTop: `2px solid ${color}` }} />
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.pollster}</div>
                    <div style={{ fontSize: 11 }} className="muted">
                      {leanText(p)}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>{fmtDay(p.endDate)}</div>
                  <div style={{ textAlign: "right", fontWeight: 500, color }}>{fmtMargin(p.margin)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
