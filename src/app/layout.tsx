import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "The Spread",
  description: "2026 US midterms: Polymarket vs. Kalshi vs. the polls, and how right they were.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
