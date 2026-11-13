import type { Metadata } from "next";
import { Hero, TopNav } from "@/components/landing/hero";
import { About, Features, Footer, How, Languages, Problem, Results, Security, TwoDoors } from "@/components/landing/sections";

export const metadata: Metadata = {
  title: "LoanLoop",
  description: "Voice service desk for loan borrowers: 11 Indian languages, tiered security, and requests finished on the same call. Demo with synthetic data.",
};

// Public page: static text and plain links only. proxy.ts redirects visitors who already have a session.
export default function Home() {
  return (
    <div className="text-base">
      <TopNav />
      <main id="main">
        <Hero />
        <Problem />
        <Features />
        <How />
        <Security />
        <Languages />
        <Results />
        <TwoDoors />
        <About />
      </main>
      <Footer />
    </div>
  );
}
