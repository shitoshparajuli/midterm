import { fmtMargin } from "@/lib/format";

const PARTY = { D: ["Democrat", "Democrats"], R: ["Republican", "Republicans"], I: ["Independent", "Independents"] } as Record<string, [string, string]>;
const partyColor = (w: string) => (w === "D" ? "var(--color-dem)" : w === "R" ? "var(--color-rep)" : "var(--color-neutral-200)");
const voteMargin = (demPct?: number | null, repPct?: number | null) => (demPct != null && repPct != null ? demPct - repPct : null);

/** Called-race badge filled in the winner's colour, so results stand out from grey status tags. */
export function WinnerTag({ winner, demPct, repPct }: { winner: string; demPct?: number | null; repPct?: number | null }) {
  const m = voteMargin(demPct, repPct);
  return (
    <span className="tag tag-win" style={{ background: partyColor(winner) }}>
      ✓ {winner} won{m != null ? ` · ${fmtMargin(m)}` : ""}
    </span>
  );
}

/** Race-page result strip: who won, plus vote shares once they're in. */
export function WinnerBanner({
  winner,
  name,
  control,
  demPct,
  repPct,
}: {
  winner: string;
  name: string | null;
  control: boolean;
  demPct: number | null;
  repPct: number | null;
}) {
  const color = partyColor(winner);
  const [one, many] = PARTY[winner] ?? ["Other", "Others"];
  const who = control ? `${many} win control` : name ? `${name} (${winner}) wins` : `${one} wins`;
  const m = voteMargin(demPct, repPct);
  return (
    <div className="winner-banner" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      <span style={{ color, fontWeight: 500 }}>✓ {who}</span>
      {m != null && (
        <span style={{ fontSize: 13, color: "var(--color-neutral-300)" }}>
          <span className="c-dem">D {demPct!.toFixed(1)}%</span> · <span className="c-rep">R {repPct!.toFixed(1)}%</span> · {fmtMargin(m)}
        </span>
      )}
    </div>
  );
}
