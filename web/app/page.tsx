import "@/components/landing/landing.css";
import "@/components/landing/landing-fx.css";
import "@/components/landing/landing-top.css";
import "@/components/landing/landing-lower.css";
import type { Metadata } from "next";
import { Hero } from "@/components/landing/hero";
import { LanguageLoop } from "@/components/landing/loop";
import { About, CtaBand, Footer, Languages, Results, Security, TwoDoors } from "@/components/landing/lower";
import { Announcement, TopNav } from "@/components/landing/nav";
import { Facts, Features, How, Problem, Statement } from "@/components/landing/sections";
import { BackgroundStage } from "@/components/landing/stage";

export const metadata: Metadata = {
  title: "LoanLoop",
  description: "Voice service desk for loan borrowers: 11 Indian languages, tiered security, and requests finished on the same call.",
};

// Public page: static text and plain links only. proxy.ts redirects visitors who already have a session.
// Hero, Security and CtaBand are "windows" onto BackgroundStage; every other section is opaque.
export default function Home() {
  return (
    <div className="ll-root">
      <BackgroundStage />
      <TopNav />
      <main id="main">
        <Announcement />
        <Hero />
        <Facts />
        <Problem />
        <Features />
        <Statement />
        <How />
        <Security />
        <LanguageLoop />
        <Languages />
        <Results />
        <TwoDoors />
        <About />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}
