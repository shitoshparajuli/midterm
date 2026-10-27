import { Suspense } from "react";
import { connection } from "next/server";
import { Header } from "@/components/header";
import { Overview } from "@/components/overview";
import { Footer } from "@/components/footer";
import { overview, raceHistory } from "@/lib/queries";

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
  const [data, senate, house] = await Promise.all([
    overview(),
    raceHistory("CONTROL-SENATE", "30d"),
    raceHistory("CONTROL-HOUSE", "30d"),
  ]);
  return <Overview control={data.control} watch={data.watch} initial={{ senate, house }} />;
}
