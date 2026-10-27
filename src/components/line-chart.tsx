/**
 * Time-series line chart drawn the way the design prototypes do it: absolutely positioned
 * gridlines and labels around a stretched SVG (non-scaling strokes), so it fills any width.
 */

export type ChartPt = { t: number; v: number };

export interface ChartSeries {
  pts: ChartPt[];
  color: string;
  width?: number;
  dash?: string;
  opacity?: number;
}

interface Props {
  series: ChartSeries[];
  start: number;
  end: number;
  domain: [number, number];
  grid: { v: number; label: string; color?: string }[];
  /** Tinted value ranges behind the lines (e.g. "Dem favored" above 50%). */
  bands?: { from: number; to: number; color: string; label?: string; labelColor?: string; labelAt?: "top" | "bottom" }[];
  /** Value of the emphasised gridline (50% / Even). */
  mid: number;
  height?: number;
  gutterLeft?: number;
  gutterRight?: number;
  faintGrid?: string;
  endLabels?: { v: number; text: string; color: string }[];
  events?: { t: number; n: number }[];
  dots?: { t: number; v: number; color: string; opacity?: number }[];
  xLabels: string[];
  label: string;
}

const W = 1000;

export const DEM_AXIS = "color-mix(in srgb, var(--color-dem) 75%, var(--color-bg))";
export const REP_AXIS = "color-mix(in srgb, var(--color-rep) 75%, var(--color-bg))";

/** Faint blue above `mid` and red below it, labelled at the outer edges. */
export function partyBands(lo: number, mid: number, hi: number, demLabel: string, repLabel: string) {
  return [
    { from: mid, to: hi, color: "color-mix(in srgb, var(--color-dem) 7%, transparent)", label: demLabel, labelColor: DEM_AXIS, labelAt: "top" as const },
    { from: lo, to: mid, color: "color-mix(in srgb, var(--color-rep) 7%, transparent)", label: repLabel, labelColor: REP_AXIS, labelAt: "bottom" as const },
  ];
}

export function LineChart({
  series,
  start,
  end,
  domain: [lo, hi],
  grid,
  mid,
  height = 150,
  gutterLeft = 30,
  gutterRight = 0,
  faintGrid = "var(--color-neutral-800)",
  endLabels,
  events,
  dots,
  bands,
  xLabels,
  label,
}: Props) {
  const H = height;
  const span = Math.max(1, end - start);
  const x = (t: number) => ((t - start) / span) * W;
  const y = (v: number) => H - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * H;
  const path = (pts: ChartPt[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");

  // End-value labels: nudge apart when closer than 16px.
  const labels = (endLabels ?? []).map((l) => ({ ...l, top: y(l.v) + 2 }));
  if (labels.length === 2 && Math.abs(labels[0].top - labels[1].top) < 16) {
    const m = (labels[0].top + labels[1].top) / 2;
    const firstHigher = labels[0].v >= labels[1].v;
    labels[0].top = firstHigher ? m - 8 : m + 8;
    labels[1].top = firstHigher ? m + 8 : m - 8;
  }

  return (
    <div>
      <div
        role="img"
        aria-label={label}
        style={{ position: "relative", height: H + 20, padding: `10px ${gutterRight}px 10px ${gutterLeft}px` }}
      >
        {bands?.map((b) => (
          <div
            key={`${b.from}-${b.to}`}
            style={{
              position: "absolute",
              left: gutterLeft,
              right: gutterRight,
              top: 10 + y(Math.max(b.from, b.to)),
              height: Math.abs(y(b.from) - y(b.to)),
              background: b.color,
              display: "flex",
              alignItems: b.labelAt === "bottom" ? "flex-end" : "flex-start",
              padding: "3px 6px",
              fontSize: 10,
              letterSpacing: "0.04em",
              color: b.labelColor,
              pointerEvents: "none",
            }}
          >
            {b.label}
          </div>
        ))}
        {grid.map((g) => (
          <div
            key={g.v}
            style={{
              position: "absolute",
              left: 0,
              right: gutterRight,
              top: 10 + y(g.v) - 6,
              height: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 10, color: g.color ?? "var(--color-neutral-600)", width: gutterLeft - 6, whiteSpace: "nowrap" }}>{g.label}</div>
            <div style={{ flex: 1, height: 1, background: g.v === mid ? "var(--color-neutral-700)" : faintGrid }} />
          </div>
        ))}
        {events?.length ? (
          <div style={{ position: "absolute", left: gutterLeft, right: gutterRight, top: 4, bottom: 4 }}>
            {events.map((e) => (
              <div
                key={e.n}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${(x(e.t) / W) * 100}%`,
                  width: 1,
                  background: "var(--color-neutral-700)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: -9,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "var(--color-bg)",
                    boxShadow: "0 0 0 1px var(--color-neutral-600)",
                    fontSize: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-neutral-300)",
                  }}
                >
                  {e.n}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ display: "block", position: "relative", overflow: "visible" }}
        >
          {series.map((s, i) =>
            s.pts.length > 1 ? (
              <path
                key={i}
                d={path(s.pts)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width ?? 2}
                strokeDasharray={s.dash}
                opacity={s.opacity ?? 1}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ) : null,
          )}
        </svg>
        {dots?.length ? (
          <div style={{ position: "absolute", left: gutterLeft, right: gutterRight, top: 10, height: H }}>
            {dots.map((d, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${(x(d.t) / W) * 100}%`,
                  top: y(d.v),
                  width: 5,
                  height: 5,
                  margin: "-2.5px 0 0 -2.5px",
                  borderRadius: "50%",
                  background: d.color,
                  opacity: d.opacity ?? 0.7,
                }}
              />
            ))}
          </div>
        ) : null}
        {labels.map((l) => (
          <div
            key={l.color}
            style={{
              position: "absolute",
              right: 0,
              width: gutterRight - 6,
              top: l.top,
              fontSize: 13,
              fontWeight: 500,
              color: l.color,
            }}
          >
            {l.text}
          </div>
        ))}
      </div>
      <div className="chart-x" style={{ paddingLeft: gutterLeft, paddingRight: gutterRight }}>
        {xLabels.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}

/** Small two-line sparkline (values 0..1), auto-scaled to min/max ± pad. */
export function Sparkline({
  p,
  k,
  width,
  height,
  fixed,
  stretch,
}: {
  p: number[];
  k: number[];
  width: number;
  height: number;
  /** Use a fixed 0..1 domain instead of auto-scaling. */
  fixed?: boolean;
  stretch?: boolean;
}) {
  const all = [...p, ...k];
  if (!all.length) return <svg width={stretch ? "100%" : width} height={height} aria-hidden />;
  const lo = fixed ? 0 : Math.min(...all) - 0.03;
  const hi = fixed ? 1 : Math.max(...all) + 0.03;
  const path = (arr: number[]) =>
    arr
      .map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, arr.length - 1)) * width).toFixed(1)} ${(height - ((v - lo) / (hi - lo || 1)) * height).toFixed(1)}`)
      .join(" ");
  return (
    <svg
      width={stretch ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block", flex: "none" }}
      aria-hidden
    >
      {k.length > 1 && <path d={path(k)} fill="none" stroke="var(--color-kalshi)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      {p.length > 1 && <path d={path(p)} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
