"use client";

export function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  return (
    <div className="search">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search state, race or candidate"
        aria-label="Search races"
      />
      {/* Phosphor MagnifyingGlass */}
      <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden>
        <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
      </svg>
    </div>
  );
}


export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; count: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips" role="group" aria-label="Filter">
      {options.map((o) => (
        <button key={o.id} type="button" className="chip" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
          <span>{o.count}</span>
        </button>
      ))}
    </div>
  );
}
