import { Suspense } from "react";
import { connection } from "next/server";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LiveBoard } from "@/components/live-board";
import { liveBoard } from "@/lib/queries";

export default function LivePage() {
  return (
    <>
      <Header active="live" search={false} />
      <Suspense fallback={<div className="empty" style={{ padding: "20px 16px" }}>Loading…</div>}>
        <LiveData />
      </Suspense>
      <Footer />
    </>
  );
}

async function LiveData() {
  await connection();
  return <LiveBoard initial={await liveBoard()} />;
}
