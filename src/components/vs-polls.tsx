"use client";

import { useMemo, useState } from "react";
import { Chips } from "./search";
import { VsPollsRow } from "./vs-polls-row";
import { BIG_GAP, byDisagreement, compareRace, type Basis } from "@/lib/vs-polls";
import type { MarketsVsPolls } from "@/lib/queries";

type Filter = "split" | "big" | "all";
type Office = "any" | "senate" | "governor" | "house";
const PAGE = 40;

export function VsPolls({ races }: { races: MarketsVsPolls }) {
  const [basis, setBasis] = useState<Basis>("nonpartisan");
  const [filter, setFilter] = useState<Filter>("split");
  const [office, setOffice] = useState<Office>("any");
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => races.map((r) => compareRace(r, basis)).sort(byDisagreement), [races, basis]);
  const inOffice = rows.filter((r) => office === "any" || r.office === office);
  const tests: Record<Filter, (r: (typeof rows)[number]) => boolean> = {
    split: (r) => r.split,
    big: (r) => r.split || r.big,
    all: () => true,
  };
  const shown = inOffice.filter(tests[filter]);
  const reset = () => setLimit(PAGE);

  return (
    <div style={{ padding: "18px 16px 28px", display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.1 }}>Markets vs polls</h1>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--color-neutral-300)" }}>
          Where the betting markets and the polls point different ways. Each poll average is turned into a win chance using typical polling
          error (±6.5 pts statewide, ±7.5 for House), so a 2-point lead is about a 60–62% favorite. Markets also price things polls don&apos;t,
          like incumbency and money, and many House races have just one poll, so gaps backed by more polls are listed first.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="seg seg-range" role="group" aria-label="Which polls">
          {(
            [
              ["nonpartisan", "Nonpartisan polls"],
              ["all", "All polls"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="seg-item"
              aria-pressed={basis === id}
              onClick={() => {
                setBasis(id);
                reset();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="legend">
          <span>
            <i style={{ background: "var(--color-bg)", boxShadow: "inset 0 0 0 2px var(--color-neutral-100)" }} />
            Polls
          </span>
          <span>
            <i style={{ background: "var(--color-accent)" }} />
            Polymarket
          </span>
          <span>
            <i style={{ background: "var(--color-kalshi)" }} />
            Kalshi
          </span>
        </div>
      </div>
      {basis === "nonpartisan" && (
        <div style={{ fontSize: 12, color: "var(--color-neutral-500)", marginTop: -4 }}>
          Leaves out campaign/party-sponsored polls and partisan-leaning pollsters. Races with only those polls fall back to all polls and are marked.
        </div>
      )}

      <Chips
        options={[
          { id: "split" as const, label: "Different favorite", count: inOffice.filter(tests.split).length },
          { id: "big" as const, label: `+ gaps of ${BIG_GAP * 100}+ pts`, count: inOffice.filter(tests.big).length },
          { id: "all" as const, label: "All races with polls", count: inOffice.length },
        ]}
        value={filter}
        onChange={(f) => {
          setFilter(f);
          reset();
        }}
      />
      <Chips
        options={(
          [
            ["any", "All offices"],
            ["senate", "Senate"],
            ["governor", "Governor"],
            ["house", "House"],
          ] as const
        ).map(([id, label]) => ({ id, label, count: rows.filter((r) => id === "any" || r.office === id).filter(tests[filter]).length }))}
        value={office}
        onChange={(o) => {
          setOffice(o);
          reset();
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-neutral-500)", marginTop: 4 }}>
        <span className="c-rep">← Rep favored</span>
        <span className="c-dem">Dem favored →</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: -6 }}>
        {shown.slice(0, limit).map((r) => (
          <VsPollsRow key={r.key} r={r} />
        ))}
        {!shown.length && <div className="empty">Markets and polls agree on every race in this view.</div>}
        {shown.length > limit && (
          <button type="button" className="more" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({shown.length - limit} left)
          </button>
        )}
      </div>
    </div>
  );
}
