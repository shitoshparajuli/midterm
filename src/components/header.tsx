"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ARCHIVED, isNight, NIGHT_START, nightStarted } from "@/lib/election";
import { fmtTime } from "@/lib/format";
import { GlobalSearch } from "./global-search";

/** `archived`: still served between cycles, without the database. */
const TABS = [
  { id: "overview", label: "Overview", href: "/", archived: false },
  { id: "races", label: "Races", href: "/races", archived: false },
  { id: "live", label: "Live", href: "/live", archived: false },
  { id: "scorecard", label: "Scorecard", href: "/scorecard", archived: true },
  { id: "world-cup", label: "World Cup", href: "/world-cup", archived: true },
] as const;

function meta(now: number | null) {
  if (ARCHIVED) return "2026 midterms · final";
  if (now == null) return "Nov 3";
  if (isNight(now)) return `Nov 3 · ${fmtTime(now / 1000)} ET`;
  if (nightStarted(now)) return "Nov 3 · results";
  const days = Math.ceil((NIGHT_START - now) / 86400_000);
  return `Nov 3 · ${days} day${days === 1 ? "" : "s"}`;
}

export function Header({
  active,
  search = true,
}: {
  active: (typeof TABS)[number]["id"];
  /** Off on pages that have their own race search. */
  search?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  const live = now != null && isNight(now);

  return (
    <header className="header">
      <div className="brand">
        <Link href="/" className="brand-name">
          The Spread
        </Link>
        <div className="brand-meta">{meta(now)}</div>
      </div>
      {search && !ARCHIVED && <GlobalSearch />}
      <nav className="seg seg-tabs" aria-label="Sections" style={ARCHIVED ? { maxWidth: 320 } : undefined}>
        {TABS.filter((t) => t.archived || !ARCHIVED).map((t) => (
          <Link key={t.id} href={t.href} className="seg-item" aria-current={t.id === active ? "page" : undefined}>
            {t.id === "live" && <span className={`live-dot${live ? " pulse" : ""}`} />}
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
