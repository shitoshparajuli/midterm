"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chips, SearchBox } from "./search";
import { Odds } from "./odds";
import { fmtMargin, officeLabel, raceName } from "@/lib/format";
import { STATES } from "@/lib/races";
import { callCredit, sourceLabel, type Score } from "@/lib/scoring";
import type { Scorecard } from "@/lib/forecasts";

export type View = "all" | "watch";
type Office = "all" | "senate" | "governor" | "house" | "control";
const OFFICES: { id: Office; label: string }[] = [
  { id: "all", label: "All races" },
  { id: "senate", label: "Senate" },
  { id: "governor", label: "Governor" },
  { id: "house", label: "House" },
  { id: "control", label: "Chamber control" },
];

const SOURCES = [
  { id: "polymarket", color: "var(--color-accent)" },
  { id: "kalshi", color: "var(--color-kalshi)" },
  { id: "polls:all", color: "var(--color-neutral-200)" },
  { id: "polls:nonpartisan", color: "var(--color-neutral-500)" },
  { id: "polls:D", color: "var(--color-dem)" },
  { id: "polls:R", color: "var(--color-rep)" },
] as const;
const ROW_SOURCES = ["polymarket", "kalshi", "polls:all"] as const;

const pct = (v: number | null | undefined, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));
const signed = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`);
const LOCK_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const fmtLock = (iso: string) => LOCK_FMT.format(new Date(iso)).replace(":00", "").replace(" PM", " pm").replace(" AM", " am") + " ET";

type Race = Scorecard["races"][number];
const decided = (r: Race) => r.winner === "D" || r.winner === "R";
/** ✓ / ✗ / null (no projection or no result yet). */
const verdict = (r: Race, source: string): number | null => {
  const p = r.f[source]?.p;
  if (p == null || !decided(r)) return null;
  return callCredit(p, r.winner === "D");
};
const Mark = ({ v }: { v: number | null }) =>
  v == null ? null : (
    <span style={{ color: v === 1 ? "var(--color-neutral-100)" : "var(--color-neutral-500)" }}>{v === 1 ? "✓" : v === 0 ? "✗" : "½"}</span>
  );

export function ScorecardView({ data, view: initialView }: { data: Scorecard; view: View }) {
  const [view, setViewState] = useState<View>(initialView);
  const setView = (v: View) => {
    setViewState(v);
    const url = new URL(window.location.href);
    if (v === "watch") url.searchParams.set("view", "watch");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  };
  const [office, setOffice] = useState<Office>("all");
  const scope = office === "all" ? "all" : `office:${office}`;
  const { lock, counts } = data;

  const inOffice = (r: Race) => (office === "all" ? r.office !== "control" : r.office === office);
  const projected = (source: string) => data.races.filter((r) => inOffice(r) && r.f[source]?.p != null).length;

  return (
    <div style={{ padding: "18px 16px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.1 }}>Scorecard</h1>
          {lock.preview ? <span className="tag tag-pending">Preview</span> : <span className="tag">Locked {fmtLock(lock.asOf)}</span>}
        </div>
        <div style={{ fontSize: 14, color: "var(--color-neutral-300)", maxWidth: 720, lineHeight: 1.5 }}>
          {lock.preview ? (
            <>
              Final projections from Polymarket, Kalshi and the polls lock on <b style={{ fontWeight: 500 }}>{fmtLock(data.lockAt)}</b> and are
              scored against the results as races are called. Until then, this previews today&apos;s numbers.
            </>
          ) : (
            <>
              Projections frozen {fmtLock(lock.asOf)}. {counts.resolved} of {counts.races} races decided
              {counts.withVotes ? `, ${counts.withVotes} with vote shares` : ""}.{" "}
              <a href={`/api/scorecard?lock=${lock.id}&format=csv`} style={{ color: "var(--color-accent-300)" }}>
                Download CSV
              </a>
            </>
          )}
        </div>
      </div>

      <div className="seg seg-tabs" role="group" aria-label="Which races" style={{ maxWidth: 420, flex: "none" }}>
        {(
          [
            ["all", "Every race"],
            ["watch", "Races to watch"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className="seg-item" aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === "watch" ? (
        <Watch data={data} />
      ) : (
        <>
          <Chips options={OFFICES.map((o) => ({ ...o, count: data.races.filter((r) => (o.id === "all" ? r.office !== "control" : r.office === o.id)).length }))} value={office} onChange={setOffice} />

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="kicker">Who called it best</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {SOURCES.map((s) => (
                <SourceCard key={s.id} label={sourceLabel(s.id)} color={s.color} score={data.summary[s.id]?.[scope] ?? null} projected={projected(s.id)} poll={s.id.startsWith("polls:")} />
              ))}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-neutral-500)", maxWidth: 760 }}>
              <b style={{ fontWeight: 500 }}>Called right</b>: the winner was above 50%. <b style={{ fontWeight: 500 }}>Avg on winner</b>: the chance it gave the
              eventual winner, on average (higher is better). <b style={{ fontWeight: 500 }}>Brier</b>: squared error of the probabilities, 0 is perfect and a
              coin flip scores 0.25. <b style={{ fontWeight: 500 }}>Poll error</b>: projected minus actual D−R margin; positive means the polls overstated
              Democrats. Polls turn margins into win chances using typical polling error (±6.5 pts statewide, ±7.5 House).
            </div>
          </section>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <Calibration data={data} />
            <Pollsters data={data} />
          </div>

          <States data={data} office={office} />
        </>
      )}
    </div>
  );
}

/** The scorecard restricted to the lock's "Races to watch", plus each of those races. */
function Watch({ data }: { data: Scorecard }) {
  const byKey = new Map(data.races.map((r) => [r.key, r]));
  const races = data.watch.flatMap((w) => {
    const r = byKey.get(w.key);
    return r ? [{ r, w }] : [];
  });
  const done = races.filter(({ r }) => decided(r)).length;
  return (
    <>
      <div style={{ fontSize: 14, color: "var(--color-neutral-300)", maxWidth: 720, lineHeight: 1.5 }}>
        The {races.length} races the Overview featured {data.lock.preview ? "right now" : "when projections locked"}: the most traded on Polymarket and
        Kalshi and the most read about on Wikipedia, with a small nudge toward close races.{" "}
        {data.lock.preview ? "The list freezes along with the projections." : `${done} of ${races.length} decided.`}
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="kicker">Who called the big races best</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
          {SOURCES.map((s) => (
            <SourceCard
              key={s.id}
              label={sourceLabel(s.id)}
              color={s.color}
              score={data.summary[s.id]?.watch ?? null}
              projected={races.filter(({ r }) => r.f[s.id]?.p != null).length}
              poll={s.id.startsWith("polls:")}
            />
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="kicker">The races</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {races.map(({ r, w }) => (
            <RaceLine key={r.key} r={r} rank={w.rank} />
          ))}
          {!races.length && <div className="empty">No races to watch yet.</div>}
        </div>
      </section>
    </>
  );
}

function SourceCard({ label, color, score, projected, poll }: { label: string; color: string; score: Score | null; projected: number; poll: boolean }) {
  const n = score?.n ?? 0;
  return (
    <div className="panel" style={{ gap: 6, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-300)" }}>
        <span style={{ width: 12, borderTop: `2px solid ${color}` }} />
        {label}
      </div>
      {n ? (
        <>
          <div style={{ fontSize: 22, fontWeight: 500 }}>
            {Number.isInteger(score!.correct) ? score!.correct : score!.correct.toFixed(1)}/{n}
            <span style={{ fontSize: 13, color: "var(--color-neutral-500)" }}> right · {pct(score!.correct / n)}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-neutral-400)", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>Avg on winner {pct(score!.avgWinnerProb)}</span>
            <span>Brier {num(score!.brier)}</span>
          </div>
          {poll && (
            <div style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>
              {score!.marginN ? `Poll error ${signed(score!.marginBias)} bias · ${num(score!.marginMae, 1)} avg miss` : "Poll error: needs vote shares"}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-neutral-500)" }}>—</div>
          <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>
            {projected ? `${projected} race${projected === 1 ? "" : "s"} projected · no results yet` : "No projections"}
          </div>
        </>
      )}
    </div>
  );
}

function Calibration({ data }: { data: Scorecard }) {
  const rows = [
    { id: "polymarket", color: "var(--color-accent)" },
    { id: "kalshi", color: "var(--color-kalshi)" },
    { id: "polls:all", color: "var(--color-neutral-200)" },
  ] as const;
  const any = rows.some((s) => data.calibration[s.id].some((b) => b.n));
  return (
    <section className="panel" style={{ flex: "1 1 380px" }}>
      <div className="kicker">Calibration</div>
      <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginTop: -4, lineHeight: 1.45 }}>
        When a source gave the favorite 70–80%, did they win about 75% of the time? Bars show how often favorites actually won; the tick marks the
        range they were given.
      </div>
      {!any ? (
        <div className="empty">Fills in as races are called.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.calibration.polymarket.map((bin, i) => (
            <div key={bin.lo} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>
                {Math.round(bin.lo * 100)}–{Math.round(bin.hi * 100)}%
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {rows.map((s) => {
                  const b = data.calibration[s.id][i];
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ position: "relative", flex: 1, height: 8, borderRadius: 4, background: "var(--color-neutral-900)" }}>
                        {b.winRate != null && <div style={{ width: `${b.winRate * 100}%`, height: "100%", borderRadius: 4, background: s.color, opacity: 0.85 }} />}
                        <div style={{ position: "absolute", top: -2, bottom: -2, left: `${bin.lo * 100}%`, width: `${(bin.hi - bin.lo) * 100}%`, borderLeft: "1px solid var(--color-neutral-600)", borderRight: "1px solid var(--color-neutral-600)" }} />
                      </div>
                      <div style={{ width: 70, fontSize: 11, color: "var(--color-neutral-500)", textAlign: "right" }}>
                        {b.n ? `${pct(b.winRate)} of ${b.n}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="legend">
            {rows.map((s) => (
              <span key={s.id}>
                <i style={{ background: s.color }} />
                {sourceLabel(s.id)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const LEAN_TEXT: Record<string, string> = { D: "Left-leaning", R: "Right-leaning", N: "Nonpartisan" };
const MIN_RANKED = 3;

function Pollsters({ data }: { data: Scorecard }) {
  const [all, setAll] = useState(false);
  const scored = data.pollsters.some((p) => p.score?.marginN);
  // One lucky poll shouldn't top the table: rank pollsters with enough scored races first.
  const ranked = (p: (typeof data.pollsters)[number]) => (p.score?.marginN ?? 0) >= MIN_RANKED;
  const list = [...data.pollsters].sort((a, b) =>
    scored
      ? Number(ranked(b)) - Number(ranked(a)) ||
        Number(!!b.score?.marginN) - Number(!!a.score?.marginN) ||
        (a.score?.marginMae ?? 99) - (b.score?.marginMae ?? 99)
      : b.races - a.races,
  );
  const shown = all ? list : list.slice(0, 12);
  const cols = "minmax(0,1fr) 44px 64px 64px";
  return (
    <section className="panel" style={{ flex: "1 1 440px" }}>
      <div className="kicker">Pollster leaderboard</div>
      <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginTop: -4, lineHeight: 1.45 }}>
        Each pollster&apos;s latest poll in each race (within 60 days of the lock), scored on the winner and the margin.
        {scored
          ? ` Ranked by average miss (pollsters with ${MIN_RANKED}+ scored races first).`
          : " Sorted by races polled until results come in."}
      </div>
      <div>
        <div className="ptable-row" style={{ gridTemplateColumns: cols, padding: "6px 0", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-500)", background: "var(--rule)" }}>
          <div>Pollster</div>
          <div style={{ textAlign: "right" }}>Races</div>
          <div style={{ textAlign: "right" }}>Right</div>
          <div style={{ textAlign: "right" }}>Avg miss</div>
        </div>
        {shown.map((p) => {
          const s = p.score;
          return (
            <div key={p.name} className="ptable-row" style={{ gridTemplateColumns: cols, minHeight: 44, fontSize: 14, background: "var(--rule-soft)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: p.lean === "D" ? "var(--color-dem)" : p.lean === "R" ? "var(--color-rep)" : "var(--color-neutral-500)" }}>
                  {LEAN_TEXT[p.lean ?? "N"] ?? "Nonpartisan"}
                  {s?.marginN ? <span className="muted"> · bias {signed(s.marginBias)}</span> : null}
                </div>
              </div>
              <div style={{ textAlign: "right", color: "var(--color-neutral-400)", fontSize: 13 }}>{p.races}</div>
              <div style={{ textAlign: "right", fontSize: 13 }}>{s?.n ? `${s.correct}/${s.n}` : "—"}</div>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 500 }}>{s?.marginN ? `${s.marginMae!.toFixed(1)} pts` : "—"}</div>
            </div>
          );
        })}
      </div>
      {list.length > shown.length && (
        <button type="button" className="more" onClick={() => setAll(true)}>
          Show all {list.length} pollsters
        </button>
      )}
    </section>
  );
}

function States({ data, office }: { data: Scorecard; office: Office }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const m = new Map<string, Race[]>();
    for (const r of data.races) {
      if (office === "all" ? r.office === "control" : r.office !== office) continue;
      const k = r.state ?? "US";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    const rank: Record<string, number> = { control: 0, senate: 1, governor: 2, house: 3 };
    return [...m]
      .map(([state, races]) => ({ state, name: state === "US" ? "National" : (STATES[state] ?? state), races: races.sort((a, b) => rank[a.office] - rank[b.office] || a.key.localeCompare(b.key)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.races, office]);
  const ql = q.trim().toLowerCase();
  const shown = groups.filter((g) => !ql || g.name.toLowerCase().startsWith(ql) || g.state.toLowerCase() === ql);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="kicker">State by state</div>
      <div style={{ maxWidth: 420 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Filter states" />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {shown.map((g) => {
          const tally = (s: string) => {
            const v = g.races.map((r) => verdict(r, s)).filter((x): x is number => x != null);
            return v.length ? `${v.reduce((a, b) => a + b, 0)}/${v.length}` : null;
          };
          const done = g.races.filter(decided).length;
          return (
            <details key={g.state} className="state-group">
              <summary>
                <span style={{ fontSize: 15, flex: 1, minWidth: 0 }}>{g.name}</span>
                <span style={{ fontSize: 12, color: "var(--color-neutral-500)", whiteSpace: "nowrap" }}>
                  {done ? (
                    <>
                      <span className="c-pm">P {tally("polymarket") ?? "—"}</span> · <span className="c-k">K {tally("kalshi") ?? "—"}</span> · Polls {tally("polls:all") ?? "—"}
                    </>
                  ) : (
                    `${g.races.length} race${g.races.length === 1 ? "" : "s"} · pending`
                  )}
                </span>
              </summary>
              {g.races.map((r) => (
                <RaceLine key={r.key} r={r} />
              ))}
            </details>
          );
        })}
        {!shown.length && <div className="empty">No states match &quot;{q}&quot;.</div>}
      </div>
    </section>
  );
}

function RaceLine({ r, rank }: { r: Race; rank?: number }) {
  const actual = r.demPct != null && r.repPct != null ? r.demPct - r.repPct : null;
  return (
    <Link href={`/races/${r.key}`} className="row" style={{ padding: rank ? "10px 0" : "10px 0 10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flex: 1, minWidth: 0 }}>
          {rank != null && (
            <span className="muted" style={{ fontSize: 12, width: 18, flex: "none" }}>
              {rank}
            </span>
          )}
          <span className="row-name" style={{ fontSize: 14 }}>
            {raceName(r)}
          </span>
          <span className="muted" style={{ fontSize: 11 }}>
            {officeLabel(r.office)}
          </span>
        </div>
        {decided(r) ? (
          <span className="tag">{actual != null ? `Won · ${fmtMargin(actual)}` : `Won · ${r.winner}`}</span>
        ) : r.winner ? (
          <span className="tag">Won · {r.winner}</span>
        ) : (
          <span className="tag tag-pending">Pending</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, fontSize: 13, flexWrap: "wrap" }}>
        {ROW_SOURCES.map((s) => {
          const f = r.f[s];
          return (
            <span key={s} style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span className="muted" style={{ fontSize: 11 }}>
                {s === "polymarket" ? "P" : s === "kalshi" ? "K" : "Polls"}
              </span>
              {s === "polls:all" ? (
                <span style={{ fontWeight: 500 }}>{f ? fmtMargin(f.margin) : "—"}</span>
              ) : (
                <Odds p={f?.p} platform={s} />
              )}
              <Mark v={verdict(r, s)} />
            </span>
          );
        })}
      </div>
    </Link>
  );
}
