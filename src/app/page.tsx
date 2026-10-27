import { Suspense } from "react";
import { connection } from "next/server";
import { listRaces } from "@/lib/queries";

const pct = (p: number | null | undefined) =>
  p == null ? "—" : `${Math.round(p * 100)}%`;

/** Placeholder data view until the real UI lands. */
export default function Home() {
  return (
    <main className="mx-auto max-w-5xl p-6 font-mono text-sm">
      <h1 className="mb-1 text-xl font-bold">Midterm tracker — raw data</h1>
      <p className="mb-4 text-neutral-500">
        P(Democrat wins). Polls: recency-weighted D−R margin → probability. API:
        /api/races, /api/races/SEN-TX,
        /api/races/SEN-TX/history?range=1h|1d|1w|30d|all, /api/polls,
        /api/pollsters, /api/accuracy
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <RaceTable />
      </Suspense>
      <p className="mt-6 text-neutral-500">
        Polling data: VoteHub. Market data: Polymarket, Kalshi.
      </p>
    </main>
  );
}

async function RaceTable() {
  await connection();
  const races = (await listRaces()).filter(
    (r) =>
      r.office !== "house" ||
      (r.markets.polymarket?.volume ?? 0) + (r.markets.kalshi?.volume ?? 0) >
        50_000,
  );
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b text-left">
          <th>Race</th>
          <th>Polymarket</th>
          <th>Kalshi</th>
          <th>Poll margin</th>
          <th>Polls → P</th>
          <th>Winner</th>
        </tr>
      </thead>
      <tbody>
        {races.map((r) => (
          <tr
            key={r.key}
            className="border-b border-neutral-200 dark:border-neutral-800"
          >
            <td>
              <a className="underline" href={`/api/races/${r.key}`}>
                {r.title}
              </a>
            </td>
            <td>{pct(r.markets.polymarket?.demWinProb)}</td>
            <td>{pct(r.markets.kalshi?.demWinProb)}</td>
            <td>
              {r.polls
                ? `${r.polls.margin > 0 ? "D" : "R"}+${Math.abs(r.polls.margin)} (${r.polls.polls})`
                : "—"}
            </td>
            <td>{pct(r.polls?.demWinProb)}</td>
            <td>{r.winnerParty ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
