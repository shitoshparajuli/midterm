import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { RaceDetail } from "@/components/race-detail";
import { raceDetail, raceHistory } from "@/lib/queries";

export default function RacePage({ params }: PageProps<"/races/[key]">) {
  return (
    <>
      <Header active="races" />
      <Suspense fallback={<div className="empty" style={{ padding: "20px 16px" }}>Loading…</div>}>
        <RaceData params={params} />
      </Suspense>
      <Footer />
    </>
  );
}

async function RaceData({ params }: { params: Promise<{ key: string }> }) {
  await connection();
  const key = (await params).key.toUpperCase();
  const [data, history] = await Promise.all([raceDetail(key), raceHistory(key, "30d")]);
  if (!data) notFound();
  return <RaceDetail data={data} initial={history} />;
}
