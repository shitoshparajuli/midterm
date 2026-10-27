"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MarketLines, useHistory } from "./market-chart";
import { Sparkline } from "./line-chart";
import { Chips, SearchBox } from "./search";
import { raceMatches, tokenize } from "@/lib/search";
import { fmtTime, officeLabel, raceName, toPct } from "@/lib/format";
import { BigOdds, Odds } from "./odds";
import { isNight, NIGHT_START, pollCloseAt } from "@/lib/election";

type Platform = "polymarket" | "kalshi";
interface Row {
  key: string;
  office: string;
  state: string | null;
  title: string;
  names: string[];
  p: number | null;
  k: number | null;
  p0: number | null;
  k0: number | null;
  winner: string | null;
  demPct: number | null;
  repPct: number | null;
  calledAt: string | null;
  spark: Record<Platform, number[]>;
}
interface Chamber {
  total: number;
  need: number;
  d: number;
  r: number;
  uncalled: number;
}
export interface LiveData {
  now: number;
  chambers: Record<"senate" | "house", Chamber>;
  control: Record<"senate" | "house", Record<Platform, { now: number | null; close: number | null }>>;
  called: number;
  score: Record<Platform, { n: number; right: number; brier: number | null }>;
  rows: Row[];
}

type Filter = "all" | "counting" | "called" | "split";
const PAGE = 40;
const OK = "var(--color-neutral-100)";
const NO = "var(--color-neutral-500)";

function useLive(initial: LiveData) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    const load = () =>
      fetch("/api/live")
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(setData)
        .catch(() => {});
    const id = setInterval(load, isNight() ? 60_000 : 300_000);
    return () => clearInterval(id);
  }, []);
  return data;
}

export function LiveBoard({ initial }: { initial: LiveData }) {
  const data = useLive(initial);
  const [chamber, setChamber] = useState<"senate" | "house">("senate");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);

  const night = data.now >= NIGHT_START;
  const range = night ? "night" : "1d";
  const history = useHistory(chamber === "senate" ? "CONTROL-SENATE" : "CONTROL-HOUSE", range);

  // Numbered markers: race calls in this chamber since the chart starts.
  const chartStart = history?.start ?? 0;
  const events = data.rows
    .filter((r) => r.office === chamber && r.calledAt && Date.parse(r.calledAt) / 1000 >= chartStart)
    .sort((a, b) => Date.parse(a.calledAt!) - Date.parse(b.calledAt!))
    .slice(-6)
    .map((r, i) => ({ n: i + 1, t: Date.parse(r.calledAt!) / 1000, label: `${raceName(r)} called ${r.winner}` }));

  const ctl = data.control[chamber];
  const delta = (o: { now: number | null; close: number | null }) => {
    const a = toPct(o.close);
    const b = toPct(o.now);
    return a == null || b == null ? "" : `${b - a >= 0 ? "+" : "−"}${Math.abs(b - a)}`;
  };

  const indexed = useMemo(
    () =>
      data.rows.map((r) => {
        const p = r.p0 ?? r.p;
        const k = r.k0 ?? r.k;
        return { r, split: p != null && k != null && p > 0.5 !== k > 0.5 };
      }),
    [data.rows],
  );
  const tokens = tokenize(q);
  const matched = indexed.filter((x) => raceMatches(x.r, tokens));
  const tests: Record<Filter, (x: (typeof matched)[number]) => boolean> = {
    all: () => true,
    counting: (x) => !x.r.winner,
    called: (x) => !!x.r.winner,
    split: (x) => x.split,
  };
  const rows = matched.filter(tests[filter]);
  const labels: Record<Filter, string> = { all: "All", counting: "Counting", called: "Called", split: "Split calls" };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 28px", padding: "18px 16px 28px", alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {(["senate", "house"] as const).map((id) => {
            const c = data.chambers[id];
            return (
              <button key={id} type="button" className="chamber-card" aria-pressed={id === chamber} onClick={() => setChamber(id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div className="kicker">{id}</div>
                  <div style={{ fontSize: 11 }} className="muted">
                    {c.need} to win
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-dem)" }}>
                    {c.d} <span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>Dem</span>
                  </div>
                  <div style={{ fontSize: 12 }} className="muted">
                    {c.uncalled} uncalled
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-rep)" }}>
                    <span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>Rep</span> {c.r}
                  </div>
                </div>
                <div style={{ position: "relative", height: 8, borderRadius: 4, overflow: "hidden", display: "flex", background: "var(--color-neutral-800)" }}>
                  <div style={{ width: `${(c.d / c.total) * 100}%`, background: "var(--color-dem)" }} />
                  <div style={{ flex: 1 }} />
                  <div style={{ width: `${(c.r / c.total) * 100}%`, background: "var(--color-rep)" }} />
                  <div style={{ position: "absolute", top: 0, bottom: 0, width: 2, marginLeft: -1, left: `${(c.need / c.total) * 100}%`, background: "var(--color-text)" }} />
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 16, fontWeight: 500 }}>{chamber === "senate" ? "Senate" : "House"} control</h2>
            <div style={{ fontSize: 12 }} className="muted">
              Chance each party wins · {night ? "since 7 pm" : "last 24 hours"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
            {(["polymarket", "kalshi"] as const).map((p) => (
              <div key={p} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <BigOdds p={ctl[p].now} platform={p} size={26} />
                {delta(ctl[p]) && (
                  <div style={{ fontSize: 12 }} className="muted">
                    Dem {delta(ctl[p])} since polls closed
                  </div>
                )}
              </div>
            ))}
          </div>
          <MarketLines history={history} range={range} events={events} label={`${chamber} control odds tonight`} />
          {events.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
              {events.map((e) => (
                <div key={e.n} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--color-neutral-400)" }}>
                  <div style={{ width: 14, color: "var(--color-neutral-300)" }}>{e.n}</div>
                  <div style={{ width: 60 }}>{fmtTime(e.t)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>{e.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="kicker">Scorecard · {data.called} races called</div>
            <div style={{ fontSize: 11 }} className="muted">
              Odds at poll close
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {(["polymarket", "kalshi"] as const).map((p) => {
              const s = data.score[p];
              return (
                <div key={p} className="big">
                  <div className="big-label">{p === "polymarket" ? "Polymarket" : "Kalshi"}</div>
                  <div style={{ fontSize: 22, fontWeight: 500 }} className={p === "polymarket" ? "c-pm" : "c-k"}>
                    {s.n ? (
                      <>
                        {s.right}/{s.n}
                        <span style={{ fontSize: 13, color: "var(--color-neutral-500)" }}> right</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>Brier {s.brier != null ? s.brier.toFixed(2) : "—"}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.45, textWrap: "pretty" }} className="muted">
            &ldquo;Right&rdquo; means the market had the winner above 50% when that state&apos;s polls closed. Brier score measures how confident
            it was: 0 is perfect, lower is better.
          </div>
        </div>
      </div>

      <div style={{ flex: "1 1 400px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setLimit(PAGE);
          }}
        />
        <Chips
          options={(Object.keys(labels) as Filter[]).map((id) => ({ id, label: labels[id], count: matched.filter(tests[id]).length }))}
          value={filter}
          onChange={(f) => {
            setFilter(f);
            setLimit(PAGE);
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.slice(0, limit).map(({ r }) => (
            <LiveRow key={r.key} r={r} now={data.now} />
          ))}
          {!rows.length && <div className="empty">No races match &quot;{q}&quot;.</div>}
          {rows.length > limit && (
            <button type="button" className="more" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({rows.length - limit} left)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveRow({ r, now }: { r: Row; now: number }) {
  const close = pollCloseAt(r.state);
  const status = r.winner
    ? { text: `Called · ${r.winner}`, cls: "tag" }
    : now < close
      ? { text: `Polls close ${fmtTime(close / 1000)}`, cls: "tag tag-pending" }
      : { text: "Counting", cls: "tag tag-pending" };
  const hasVote = r.demPct != null && r.repPct != null;
  const right = (v: number | null) => (v == null || !r.winner ? null : v > 0.5 === (r.winner === "D"));

  const odds = (label: string, v0: number | null, v1: number | null, platform: Platform) => {
    const ok = right(v0);
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, fontSize: 13 }}>
        <span className="muted" style={{ fontSize: 11 }}>
          {label}
        </span>
        {v0 != null && (
          <span className="muted">
            <Odds p={v0} muted /> →
          </span>
        )}
        <Odds p={v1} platform={platform} />
        {ok != null && <span style={{ color: ok ? OK : NO }}>{ok ? "✓" : "✗"}</span>}
      </div>
    );
  };

  return (
    <Link href={`/races/${r.key}`} className="row">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, flex: 1 }}>
          <div className="row-name">{raceName(r)}</div>
          <div style={{ fontSize: 11, whiteSpace: "nowrap" }} className="muted">
            {officeLabel(r.office)}
          </div>
        </div>
        <div className={status.cls}>{status.text}</div>
      </div>
      {(hasVote || now >= close) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--color-neutral-800)" }}>
            {hasVote && (
              <>
                <div style={{ width: `${r.demPct}%`, background: "var(--color-dem)" }} />
                <div style={{ flex: 1 }} />
                <div style={{ width: `${r.repPct}%`, background: "var(--color-rep)" }} />
              </>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-neutral-400)", whiteSpace: "nowrap", flex: "none" }}>
            {hasVote ? `D ${r.demPct!.toFixed(1)} · R ${r.repPct!.toFixed(1)}` : "No returns yet"}
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {odds("P", r.p0, r.p, "polymarket")}
        {odds("K", r.k0, r.k, "kalshi")}
        <div style={{ marginLeft: "auto" }}>
          <Sparkline p={r.spark.polymarket} k={r.spark.kalshi} width={72} height={22} fixed />
        </div>
      </div>
    </Link>
  );
}
