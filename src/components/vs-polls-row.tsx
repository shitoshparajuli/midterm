import Link from "next/link";
import { Odds } from "./odds";
import { fmtMargin, officeLabel, raceName } from "@/lib/format";
import type { Compared } from "@/lib/vs-polls";

/**
 * One race on a Rep ← 50% → Dem track: polls (white ring) joined to the markets (Polymarket purple,
 * Kalshi amber). The longer the line, the bigger the disagreement.
 */
export function Dumbbell({ r }: { r: Compared }) {
  const x = (p: number) => `${Math.min(99, Math.max(1, p * 100))}%`;
  const lo = Math.min(r.pollP, r.markets.avg);
  const hi = Math.max(r.pollP, r.markets.avg);
  return (
    <div style={{ position: "relative", height: 22 }} aria-hidden>
      <div
        style={{
          position: "absolute",
          inset: "8px 0",
          borderRadius: 3,
          background:
            "linear-gradient(to right, color-mix(in srgb, var(--color-rep) 14%, transparent) 50%, color-mix(in srgb, var(--color-dem) 14%, transparent) 50%)",
        }}
      />
      <div style={{ position: "absolute", left: "50%", top: 4, bottom: 4, width: 1, background: "var(--color-neutral-600)" }} />
      <div
        style={{
          position: "absolute",
          top: 10,
          height: 2,
          left: x(lo),
          width: `calc(${x(hi)} - ${x(lo)})`,
          background: r.split ? "var(--color-accent-300)" : "var(--color-neutral-500)",
        }}
      />
      {(["kalshi", "polymarket"] as const).map((p) =>
        r.markets[p] == null ? null : (
          <div
            key={p}
            title={p}
            style={{
              position: "absolute",
              top: 6,
              left: x(r.markets[p]!),
              width: 10,
              height: 10,
              marginLeft: -5,
              borderRadius: "50%",
              background: p === "polymarket" ? "var(--color-accent)" : "var(--color-kalshi)",
              boxShadow: "0 0 0 1.5px var(--color-bg)",
            }}
          />
        ),
      )}
      <div
        style={{
          position: "absolute",
          top: 5,
          left: x(r.pollP),
          width: 12,
          height: 12,
          marginLeft: -6,
          borderRadius: "50%",
          border: "2px solid var(--color-neutral-100)",
          background: "var(--color-bg)",
        }}
      />
    </div>
  );
}

export function VsPollsRow({ r }: { r: Compared }) {
  const n = r.poll.polls;
  return (
    <Link href={`/races/${r.key}`} className="row">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, flex: 1 }}>
          <div className="row-name">{raceName(r)}</div>
          <div style={{ fontSize: 11, whiteSpace: "nowrap" }} className="muted">
            {officeLabel(r.office)}
          </div>
        </div>
        {r.split ? (
          <div className="tag tag-split">Different favorite</div>
        ) : r.big ? (
          <div className="tag">{Math.round(Math.abs(r.gap) * 100)} pt gap</div>
        ) : null}
      </div>
      <Dumbbell r={r} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, fontSize: 13, flexWrap: "wrap" }}>
        <span>
          <span className="muted" style={{ fontSize: 11 }}>
            Markets{" "}
          </span>
          <Odds p={r.markets.polymarket} platform="polymarket" /> <Odds p={r.markets.kalshi} platform="kalshi" />
        </span>
        <span>
          <span className="muted" style={{ fontSize: 11 }}>
            Polls{" "}
          </span>
          <span style={{ fontWeight: 500 }}>{fmtMargin(r.poll.margin)}</span>
          <span className="muted"> → </span>
          <Odds p={r.pollP} />
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: n <= 1 || r.fallback ? "var(--color-neutral-400)" : "var(--color-neutral-500)" }}>
          {n} poll{n === 1 ? "" : "s"}
          {r.fallback ? " · campaign/partisan only" : ""}
        </span>
      </div>
    </Link>
  );
}
