import { lead, toPct } from "@/lib/format";

export type Platform = "polymarket" | "kalshi";
const PLATFORM_CLASS: Record<Platform, string> = { polymarket: "c-pm", kalshi: "c-k" };
export const PLATFORM_NAME: Record<Platform, string> = { polymarket: "Polymarket", kalshi: "Kalshi" };

/** Compact favourite odds: party letter in party colour, number in the market's colour ("D66"). */
export function Odds({ p, platform, muted }: { p: number | null | undefined; platform?: Platform; muted?: boolean }) {
  const l = lead(p);
  if (!l) return <span className="muted">—</span>;
  return (
    <span className="odds">
      {l.party && <span className={l.party === "D" ? "c-dem" : "c-rep"}>{l.party}</span>}
      <span className={muted ? "muted" : platform ? PLATFORM_CLASS[platform] : undefined}>{l.pct}</span>
    </span>
  );
}

/** Headline block for one market: "● Polymarket" then "D 66%  R 34%", favourite larger. */
export function BigOdds({ p, platform, size = 30, suffix }: { p: number | null | undefined; platform: Platform; size?: number; suffix?: string }) {
  const d = toPct(p);
  const parts = d == null ? null : ([["D", d], ["R", 100 - d]] as const);
  return (
    <div className="big">
      <div className="big-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <i className={`dot dot-${platform}`} />
        {PLATFORM_NAME[platform]}
      </div>
      {parts ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          {parts.map(([party, v]) => {
            const fav = v >= 50;
            return (
              <div key={party} className={`big-value ${party === "D" ? "c-dem" : "c-rep"}`} style={{ fontSize: fav ? size : Math.round(size * 0.6) }}>
                <span style={{ fontSize: "0.5em", marginRight: 2 }}>{party}</span>
                {v}
                <small style={{ fontSize: "0.5em" }}>%</small>
              </div>
            );
          })}
          {suffix && <span style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>{suffix}</span>}
        </div>
      ) : (
        <div className="big-value muted" style={{ fontSize: size }}>
          —
        </div>
      )}
    </div>
  );
}
