"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isNight, NIGHT_START, nightStarted } from "@/lib/election";
import { fmtTime } from "@/lib/format";
import { GlobalSearch } from "./global-search";

const TABS = [
  { id: "overview", label: "Overview", href: "/" },
  { id: "races", label: "Races", href: "/races" },
  { id: "live", label: "Live", href: "/live" },
  { id: "scorecard", label: "Scorecard", href: "/scorecard" },
] as const;

function meta(now: number | null) {
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
      {search && <GlobalSearch />}
      <nav className="seg seg-tabs" aria-label="Sections">
        {TABS.map((t) => (
          <Link key={t.id} href={t.href} className="seg-item" aria-current={t.id === active ? "page" : undefined}>
            {t.id === "live" && <span className={`live-dot${live ? " pulse" : ""}`} />}
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
