import "@/components/landing/landing.css";
import type { Metadata } from "next";
import { Announcement, Facts, Hero, TopNav } from "@/components/landing/hero";
import { About, Footer, Languages, Results, Security, TwoDoors } from "@/components/landing/lower";
import { Features, How, Problem } from "@/components/landing/sections";

export const metadata: Metadata = {
  title: "LoanLoop",
  description: "Voice service desk for loan borrowers: 11 Indian languages, tiered security, and requests finished on the same call. Demo with synthetic data.",
};

// Public page: static text and plain links only. proxy.ts redirects visitors who already have a session.
export default function Home() {
  return (
    <div className={"ll-root"}>
      <Announcement />
      <TopNav />
      <main id="main">
        <Hero />
        <Facts />
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
