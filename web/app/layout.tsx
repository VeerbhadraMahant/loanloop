import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Substitute for Gnani's Gambarino display serif (Fontshare, not on Google Fonts).
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  title: "LoanLoop",
  description: "Voice service desk for lenders. Demo with synthetic data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrument.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
