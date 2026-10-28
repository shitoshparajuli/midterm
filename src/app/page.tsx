import { Suspense } from "react";
import { connection } from "next/server";
import { Header } from "@/components/header";
import { Overview } from "@/components/overview";
import { Footer } from "@/components/footer";
import { marketsVsPolls, overview, raceHistory } from "@/lib/queries";
import { byDisagreement, compareRace } from "@/lib/vs-polls";

export default function Home() {
  return (
    <>
      <Header active="overview" />
      <Suspense fallback={<div className="empty" style={{ padding: "20px 16px" }}>Loading…</div>}>
        <OverviewData />
      </Suspense>
      <Footer />
    </>
  );
}

async function OverviewData() {
  await connection();
  const [data, senate, house, vs] = await Promise.all([
    overview(),
    raceHistory("CONTROL-SENATE", "30d"),
    raceHistory("CONTROL-HOUSE", "30d"),
    marketsVsPolls(),
  ]);
  const splits = vs.map((r) => compareRace(r, "nonpartisan")).filter((r) => r.split && !r.fallback).sort(byDisagreement);
  return (
    <Overview
      control={data.control}
      watch={data.watch}
      locked={data.locked}
      disagree={splits.slice(0, 5)}
      initial={{ senate, house }}
    />
  );
}
