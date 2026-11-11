"use client";
import Link from "next/link";
import { SidebarLayout } from "@/components/sidebar-nav";
import { Button, Card, Eyebrow, Icon, StatTile, type IconName } from "@/components/ui";

const stats = [
  { value: "~0.5 s", caption: "agent response, Sarvam 105B, typed turn; a full voice turn is 2.9-3.3 s", accent: true },
  { value: "29", caption: "secure banking gateway actions" },
  { value: "4 + 7 beta", caption: "language modes: English, Hindi, Hinglish, Marathi, plus 7 machine-translated beta" },
];

const safety: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "lock",
    title: "Never takes secrets",
    body: "PINs, OTPs and card numbers are refused on the call and never reach the LLM, logs, or audio transcripts.",
  },
  {
    icon: "eye",
    title: "Masked-only output",
    body: "The voice agent only ever speaks masked values. Confidential IFSC and full account numbers are delivered by out-of-band SMS.",
  },
  {
    icon: "phone",
    title: "In-App Approval Sidecar",
    body: "Sensitive Tier 2 actions (such as shifting auto-debit dates) require explicit one-tap approval in the bank app, never a spoken yes.",
  },
];

function Waveform() {
  const bars = Array.from({ length: 64 }, (_, i) => {
    const rawH = 14 + Math.abs(Math.sin(i * 0.37) * 52 + Math.sin(i * 0.11 + 1) * 34);
    const h = Math.round(rawH);
    const y = Math.round((110 - h / 2) * 2) / 2;
    return <rect key={i} x={i * 18 + 4} y={y} width={6} height={h} rx={3} />;
  });
  return (
    <svg aria-hidden viewBox="0 0 1152 220" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <g fill="var(--fg)" opacity={0.12}>
        {bars}
      </g>
      <circle cx="300" cy="110" r="54" fill="var(--primary)" opacity={0.8} />
      <circle cx="690" cy="110" r="32" fill="var(--primary)" opacity={0.5} />
      <circle cx="930" cy="110" r="18" fill="var(--primary)" opacity={0.35} />
    </svg>
  );
}

export default function Home() {
  return (
    <SidebarLayout title="Voice Banking Studio" sub="Sahyadri Finance Bank">
      <main>
        {/* Hero Section */}
        <section
          className="relative overflow-hidden border-b border-line"
          style={{ background: "linear-gradient(180deg, var(--wash-from) 0%, var(--wash-to) 100%)" }}
        >
          <div className="mx-auto max-w-5xl px-4 pb-12 pt-12 text-center sm:px-6 sm:pt-16">
            <Eyebrow>
              <span className="h-2 w-2 rounded-full bg-primary" />
              Sahyadri Finance Bank · Voice Agent Studio
            </Eyebrow>

            <h1 className="serif mx-auto mt-6 max-w-4xl text-5xl leading-[1.05] sm:text-6xl lg:text-[72px] text-fg font-semibold tracking-tight">
              Every call ends with <span className="italic text-primary">the work done.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base text-muted sm:text-lg leading-relaxed">
              LoanLoop answers borrowers in their native language, executes safe transactional workflows with real-time ledger grounding, and pairs with an out-of-band mobile sidecar.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/call/priya" className="font-semibold text-sm px-6 h-12 shadow-sm">
                <Icon name="phone_in_talk" size={16} />
                <span>Launch Calling Desk</span>
              </Button>
              <Button href="/test-cases" variant="secondary" className="font-medium text-sm px-5 h-12">
                <Icon name="tune" size={16} />
                <span>Test Cases &amp; Scenarios</span>
              </Button>
              <Button href="/ops" variant="secondary" className="font-medium text-sm px-5 h-12">
                <Icon name="speed" size={16} />
                <span>Ops Console</span>
              </Button>
            </div>
          </div>
          <div className="mx-auto h-32 max-w-5xl px-4 pb-6 sm:h-40">
            <Waveform />
          </div>
        </section>

        {/* Key Metrics Strip */}
        <section aria-label="Key numbers" className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <StatTile key={s.caption} {...s} />
            ))}
          </div>
        </section>

        {/* Safety & Zero Secrets Policy */}
        <section aria-labelledby="safe" className="mx-auto max-w-5xl px-4 pt-16 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <h2 id="safe" className="serif text-2xl sm:text-3xl text-fg font-semibold">
                How it stays safe
              </h2>
              <p className="text-xs sm:text-sm text-muted mt-1">
                Zero Secrets Protocol with out-of-band bilateral mobile pairing.
              </p>
            </div>
            <span className="font-mono text-xs text-primary font-medium bg-secondary-container px-3 py-1 rounded-full border border-primary/20">
              Demo · synthetic data
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {safety.map((s) => (
              <Card key={s.title} className="p-5">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sunken text-primary">
                  <Icon name={s.icon} size={20} />
                </span>
                <h3 className="font-semibold text-fg text-base">{s.title}</h3>
                <p className="mt-2 text-xs text-muted leading-relaxed">{s.body}</p>
              </Card>
            ))}
          </div>

          {/* Persona phone shortcuts */}
          <div className="mt-6 p-4 rounded-xl bg-card border border-line flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-muted">
              Explore standalone simulated handsets:
            </span>
            <div className="flex items-center gap-2">
              <Link href="/phone/priya" className="px-3 py-1 rounded-lg bg-sunken hover:bg-surface-variant text-fg font-mono transition-colors border border-line">
                Priya&apos;s Phone
              </Link>
              <Link href="/phone/ramesh" className="px-3 py-1 rounded-lg bg-sunken hover:bg-surface-variant text-fg font-mono transition-colors border border-line">
                Ramesh&apos;s Phone
              </Link>
              <Link href="/phone/sunita" className="px-3 py-1 rounded-lg bg-sunken hover:bg-surface-variant text-fg font-mono transition-colors border border-line">
                Sunita&apos;s Phone
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mx-auto mt-16 max-w-5xl border-t border-line px-4 py-6 text-xs text-muted sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p>Sahyadri Finance Bank · LoanLoop Voice Banking Desk</p>
        <p className="font-mono">Demo · Synthetic Data</p>
      </footer>
    </SidebarLayout>
  );
}
