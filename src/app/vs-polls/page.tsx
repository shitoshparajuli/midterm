import { Suspense } from "react";
import { connection } from "next/server";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { VsPolls } from "@/components/vs-polls";
import { marketsVsPolls } from "@/lib/queries";

export default function VsPollsPage() {
  return (
    <>
      <Header active="races" />
      <Suspense fallback={<div className="empty" style={{ padding: "20px 16px" }}>Loading…</div>}>
        <VsPollsData />
      </Suspense>
      <Footer />
    </>
  );
}

async function VsPollsData() {
  await connection();
  return <VsPolls races={await marketsVsPolls()} />;
}
