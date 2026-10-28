"use client";

import Link from "next/link";
import { useState } from "react";
import { Legend, MarketLines, RangePicker, useHistory, type History, type Range } from "./market-chart";
import { Sparkline } from "./line-chart";
import { compare, officeLabel, raceName } from "@/lib/format";
import { BigOdds, Odds } from "./odds";
import { VsPollsRow } from "./vs-polls-row";
import type { Compared } from "@/lib/vs-polls";

type Odds = { p: number | null; k: number | null };
export interface Tile {
  key: string;
  office: string;
  state: string | null;
  title: string;
  p: number | null;
  k: number | null;
  spark: { polymarket: number[]; kalshi: number[] };
}

const CHAMBERS = [
  { id: "senate", label: "Senate", key: "CONTROL-SENATE" },
  { id: "house", label: "House", key: "CONTROL-HOUSE" },
] as const;

export function Overview({
  control,
  watch,
  locked,
  disagree,
  initial,
}: {
  control: Record<"senate" | "house", Odds>;
  watch: Tile[];
  /** The list is the one frozen with the final projections. */
  locked: boolean;
  /** Biggest markets-vs-polls disagreements (nonpartisan polls). */
  disagree: Compared[];
  initial: Record<"senate" | "house", History>;
}) {
  const [chamber, setChamber] = useState<"senate" | "house">("senate");
  const [range, setRange] = useState<Range>("30d");
  const c = CHAMBERS.find((x) => x.id === chamber)!;
  const history = useHistory(c.key, range, { range: "30d", data: initial[chamber] });
  const odds = control[chamber];
  const cmp = compare(odds.p, odds.k);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 28, padding: "20px 16px 28px", alignItems: "flex-start" }}>
      <section style={{ flex: "3 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 18 }} role="group" aria-label="Chamber">
          {CHAMBERS.map((x) => (
            <button key={x.id} type="button" className="chamber-pick" aria-pressed={x.id === chamber} onClick={() => setChamber(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <BigOdds p={odds.p} platform="polymarket" />
          <BigOdds p={odds.k} platform="kalshi" />
          {cmp && (
            <div className={`tag${cmp.split ? " tag-split" : ""}`} style={{ marginBottom: 4 }}>
              {cmp.label}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--color-neutral-400)" }}>Chance each party wins control of the {c.label}</div>
        <div style={{ marginTop: 4 }}>
          <MarketLines history={history} range={range} height={170} endLabels label={`${c.label} control odds over time`} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <RangePicker value={range} onChange={setRange} />
          <Legend />
        </div>
      </section>

      <section style={{ flex: "2 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500 }}>Races to watch</h2>
            <Link href="/scorecard?view=watch" style={{ fontSize: 13, color: "var(--color-accent-300)", whiteSpace: "nowrap" }}>
              Scorecard ›
            </Link>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-neutral-400)", lineHeight: 1.45 }}>
            {locked
              ? "Picked when projections locked on Nov 2; odds are live. "
              : "Most traded and most read about online, with a nudge toward close races. "}
            Odds show the favorite&apos;s chance.
          </div>
        </div>
        <div className="tiles">
          {watch.map((r) => {
            const t = compare(r.p, r.k);
            return (
              <Link key={r.key} href={`/races/${r.key}`} className={`tile${t?.split ? " split" : ""}`}>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{raceName(r)}</div>
                  <div style={{ fontSize: 11 }} className="muted">
                    {officeLabel(r.office)}
                  </div>
                </div>
                <Sparkline p={r.spark.polymarket} k={r.spark.kalshi} width={150} height={34} stretch />
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 17 }}>
                    <Odds p={r.p} platform="polymarket" />
                  </div>
                  <div style={{ fontSize: 17 }}>
                    <Odds p={r.k} platform="kalshi" />
                  </div>
                  <div style={{ marginLeft: "auto", fontSize: 11, color: t?.split ? "var(--color-accent-300)" : "var(--color-neutral-500)" }}>
                    {t?.short}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {disagree.length > 0 && (
        <section style={{ flex: "1 1 100%", minWidth: 0, display: "flex", flexDirection: "column", gap: 6, maxWidth: 820 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500 }}>Markets vs polls</h2>
            <Link href="/vs-polls" style={{ fontSize: 13, color: "var(--color-accent-300)", whiteSpace: "nowrap" }}>
              See all ›
            </Link>
          </div>
          <div style={{ fontSize: 13, color: "var(--color-neutral-400)" }}>
            Races where the markets and nonpartisan polls favor different candidates, strongest first (gaps backed by more polls rank higher).
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {disagree.map((r) => (
              <VsPollsRow key={r.key} r={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
