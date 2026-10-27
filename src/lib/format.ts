/** Display helpers shared by server and client components. */
import { STATES } from "./races";

/** 0..1 → integer percent, or null. */
export const toPct = (p: number | null | undefined) => (p == null ? null : Math.round(p * 100));

export const fmtPct = (p: number | null | undefined) => {
  const v = toPct(p);
  return v == null ? "—" : String(v);
};

/** D−R margin → "D+2.1" / "R+1" / "Even". */
export function fmtMargin(m: number | null | undefined) {
  if (m == null) return "—";
  const r = Math.round(m * 10) / 10;
  if (r === 0) return "Even";
  const a = Math.abs(r);
  return (r > 0 ? "D+" : "R+") + (a % 1 ? a.toFixed(1) : a.toFixed(0));
}

/** Gap and split call between the two markets (both 0..1). */
export function compare(p: number | null | undefined, k: number | null | undefined) {
  const P = toPct(p);
  const K = toPct(k);
  if (P == null || K == null) return null;
  const gap = Math.abs(P - K);
  const split = P > 50 !== K > 50;
  return { gap, split, label: `${gap} pt gap${split ? " · split call" : ""}`, short: split ? `Split · ${gap}` : `${gap} pt gap` };
}

const OFFICE_LABEL: Record<string, string> = {
  senate: "Senate",
  governor: "Governor",
  house: "House",
  control: "Chamber",
  generic: "National",
};
export const officeLabel = (office: string) => OFFICE_LABEL[office] ?? office;

/** "Texas" for Senate/Governor, "VA-02" for House, the title otherwise. */
export function raceName(r: { office: string; state: string | null; title: string }) {
  if ((r.office === "senate" || r.office === "governor") && r.state) return STATES[r.state] ?? r.title;
  if (r.office === "house") return r.title.replace(/ House$/, "");
  return r.title;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const TIME_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** Unix seconds → "Sep 26". */
export const fmtDate = (t: number) => DATE_FMT.format(new Date(t * 1000));
/** Unix seconds → "9:40 pm". */
export const fmtTime = (t: number) =>
  TIME_FMT.format(new Date(t * 1000)).replace(":00", "").replace(" AM", " am").replace(" PM", " pm");
/** "2026-10-22" → "Oct 22". */
export const fmtDay = (d: string) => DATE_FMT.format(new Date(`${d}T12:00:00-05:00`));
