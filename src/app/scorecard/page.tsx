import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ScorecardView } from "@/components/scorecard";
import { scorecard } from "@/lib/forecasts";
import { archivedScorecard } from "@/lib/archive";
import { ARCHIVED, FINAL_LOCK_ID } from "@/lib/election";

export default function ScorecardPage({ searchParams }: PageProps<"/scorecard">) {
  return (
    <>
      <Header active="scorecard" />
      <Suspense fallback={<div className="empty" style={{ padding: "20px 16px" }}>Loading…</div>}>
        <ScorecardData searchParams={searchParams} />
      </Suspense>
      <Footer />
    </>
  );
}

async function ScorecardData({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { lock, view } = await searchParams;
  const id = typeof lock === "string" ? lock : FINAL_LOCK_ID;
  const data = (await archivedScorecard(id)) ?? (ARCHIVED ? notFound() : await scorecard(id));
  return <ScorecardView data={data} view={view === "all" ? "all" : "watch"} />;
}
