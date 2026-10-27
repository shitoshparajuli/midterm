"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chips, SearchBox } from "./search";
import { raceMatches, tokenize } from "@/lib/search";
import { compare, fmtMargin, fmtPct, officeLabel, raceName } from "@/lib/format";

export interface ListRace {
  key: string;
  office: string;
  state: string | null;
  title: string;
  names: string[];
  p: number | null;
  k: number | null;
  pollMargin: number | null;
  winner: string | null;
}

type Filter = "all" | "senate" | "governor" | "house" | "split";
const PAGE = 50;

export function RaceList({ races, initialQuery = "" }: { races: ListRace[]; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);

  const indexed = useMemo(() => races.map((r) => ({ r, cmp: compare(r.p, r.k) })), [races]);
  const tokens = tokenize(q);
  const matched = indexed.filter((x) => raceMatches(x.r, tokens));
  const tests: Record<Filter, (x: (typeof matched)[number]) => boolean> = {
    all: () => true,
    senate: (x) => x.r.office === "senate" || x.r.key === "CONTROL-SENATE",
    governor: (x) => x.r.office === "governor",
    house: (x) => x.r.office === "house" || x.r.key === "CONTROL-HOUSE",
    split: (x) => !!x.cmp?.split,
  };
  const rows = matched.filter(tests[filter]);
  const labels: Record<Filter, string> = { all: "All", senate: "Senate", governor: "Governor", house: "House", split: "Split calls" };

  return (
    <div style={{ padding: "18px 16px 28px", display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
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
        {rows.slice(0, limit).map(({ r, cmp }) => (
          <Link key={r.key} href={`/races/${r.key}`} className="row">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, flex: 1 }}>
                <div className="row-name">{raceName(r)}</div>
                <div style={{ fontSize: 11, whiteSpace: "nowrap" }} className="muted">
                  {officeLabel(r.office)}
                </div>
              </div>
              {r.winner ? (
                <div className="tag">Called · {r.winner}</div>
              ) : cmp?.split ? (
                <div className="tag tag-split">Split call</div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, fontSize: 13 }}>
              <span>
                <span className="muted" style={{ fontSize: 11 }}>
                  P{" "}
                </span>
                <span className="c-pm" style={{ fontWeight: 500 }}>
                  {fmtPct(r.p)}
                </span>
              </span>
              <span>
                <span className="muted" style={{ fontSize: 11 }}>
                  K{" "}
                </span>
                <span className="c-k" style={{ fontWeight: 500 }}>
                  {fmtPct(r.k)}
                </span>
              </span>
              {cmp && (
                <span style={{ fontSize: 11, color: cmp.split ? "var(--color-accent-300)" : "var(--color-neutral-500)" }}>{cmp.gap} pt gap</span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-neutral-400)" }}>
                {r.pollMargin != null ? `Polls ${fmtMargin(r.pollMargin)}` : r.office === "control" ? "" : "No polls"}
              </span>
            </div>
          </Link>
        ))}
        {!rows.length && <div className="empty">No races match &quot;{q}&quot;.</div>}
        {rows.length > limit && (
          <button type="button" className="more" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({rows.length - limit} left)
          </button>
        )}
      </div>
    </div>
  );
}
