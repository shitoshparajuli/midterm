"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { searchRaces } from "@/lib/search";
import { officeLabel, raceName } from "@/lib/format";
import { Odds } from "./odds";

interface Entry {
  key: string;
  office: string;
  state: string | null;
  title: string;
  names: string[];
  p: number | null;
  k: number | null;
  volume: number;
}

const MAX = 8;
let indexPromise: Promise<Entry[]> | null = null;
const loadIndex = () =>
  (indexPromise ??= fetch("/api/search")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .catch(() => {
      indexPromise = null;
      return [];
    }));

/** Header search: state, race or candidate → race page. */
export function GlobalSearch() {
  const listId = useId();
  const [index, setIndex] = useState<Entry[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Close on taps/clicks outside. (Not on blur: iOS Safari blurs the input before a tap on a
  // result lands, which would unmount the result and swallow the tap.)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const all = index ? searchRaces(index, q) : [];
  const hits = all.slice(0, MAX);
  const showAll = all.length > MAX;

  // Navigation is left to the <Link>s; this just tidies up when one is followed.
  // Following a result hides the dropdown but keeps it mounted: unmounting the clicked <Link>
  // mid-navigation can cancel the navigation. Each page renders its own header, so the search
  // starts fresh on the next page.
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    input.current?.blur(); // dismiss the mobile keyboard
  };


  return (
    <div
      ref={box}
      className="search global-search"
      // Keyboard users tabbing away (relatedTarget is set); taps are handled above.
      onBlur={(e) => e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
    >
      <input
        ref={input}
        type="search"
        value={q}
        placeholder="Search state or candidate"
        aria-label="Search races by state or candidate"
        role="combobox"
        aria-expanded={open && !!q}
        aria-controls={listId}
        aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
        onFocus={() => {
          setOpen(true);
          setLeaving(false);
          if (!index) loadIndex().then(setIndex);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
          setLeaving(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            document.getElementById(`${listId}-${active}`)?.click();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {/* Phosphor MagnifyingGlass */}
      <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden>
        <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
      </svg>
      {open && q.trim() && (
        <div className="search-pop" id={listId} role="listbox" hidden={leaving}>
          {!index ? (
            <div className="search-note">Loading…</div>
          ) : !hits.length ? (
            <div className="search-note">No races match &quot;{q}&quot;.</div>
          ) : (
            <>
              {hits.map(({ r, name }, i) => (
                <Link
                  key={r.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  href={`/races/${r.key}`}
                  className="search-hit"
                  onMouseEnter={() => setActive(i)}
                  onClick={close}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span className="row-name" style={{ fontSize: 14 }}>
                        {raceName(r)}
                      </span>
                      <span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                        {officeLabel(r.office)}
                      </span>
                    </div>
                    {name && (
                      <div style={{ fontSize: 12, color: "var(--color-neutral-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: 13, flex: "none" }}>
                    <Odds p={r.p} platform="polymarket" />
                    <Odds p={r.k} platform="kalshi" />
                  </div>
                </Link>
              ))}
              {showAll && (
                <Link
                  href={`/races?q=${encodeURIComponent(q.trim())}`}
                  className="search-hit search-all"
                  onClick={close}
                >
                  See all {all.length} results
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
