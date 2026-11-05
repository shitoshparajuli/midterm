import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { WorldCupView } from "@/components/world-cup";
import type { WorldCupData } from "@/lib/world-cup";
import raw from "../../../data/analysis/world-cup.json";

export const metadata: Metadata = {
  title: "Did the World Cup move votes? · The Spread",
  description: "How the 2026 World Cup host counties voted in the 2026 midterms, against the rest of their states and every other big county.",
};

export default function WorldCupPage() {
  const data = raw as WorldCupData;
  return (
    <>
      <Header active="world-cup" />
      <WorldCupView data={data} />
      <Footer>
        Results: AP, via The New York Times. 2020 county results:{" "}
        <a href="https://github.com/tonmcg/US_County_Level_Election_Results_08-24" style={{ textDecoration: "underline" }}>
          tonmcg
        </a>
        . Stadium House districts: Census Bureau geocoder.
      </Footer>
    </>
  );
}
