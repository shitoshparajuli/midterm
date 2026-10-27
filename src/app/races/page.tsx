import { Suspense } from "react";
import { connection } from "next/server";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { RaceList, type ListRace } from "@/components/race-list";
import { listRaces } from "@/lib/queries";

const ORDER: Record<string, number> = { control: 0, senate: 1, governor: 2, house: 3 };

export default function RacesPage({ searchParams }: PageProps<"/races">) {
  return (
    <>
      <Header active="races" search={false} />
      <Suspense fallback={<div className="empty" style={{ padding: "20px 16px" }}>Loading…</div>}>
        <RacesData searchParams={searchParams} />
      </Suspense>
      <Footer />
    </>
  );
}

async function RacesData({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const q = (await searchParams).q;
  const vol = (r: Awaited<ReturnType<typeof listRaces>>[number]) =>
    (r.markets.polymarket?.volume ?? 0) + (r.markets.kalshi?.volume ?? 0);
  const races: ListRace[] = (await listRaces())
    .filter((r) => r.office in ORDER)
    .sort((a, b) => ORDER[a.office] - ORDER[b.office] || vol(b) - vol(a))
    .map((r) => ({
      key: r.key,
      office: r.office,
      state: r.state,
      title: r.title,
      names: r.names,
      p: r.markets.polymarket?.demWinProb ?? null,
      k: r.markets.kalshi?.demWinProb ?? null,
      pollMargin: r.polls?.margin ?? null,
      winner: r.winnerParty,
    }));
  return <RaceList races={races} initialQuery={typeof q === "string" ? q : ""} />;
}
