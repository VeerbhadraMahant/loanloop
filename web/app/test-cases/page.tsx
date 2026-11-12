"use client";
import { SidebarLayout } from "@/components/sidebar-nav";
import { Button, Card, Icon, Pill } from "@/components/ui";

const testCases = [
  {
    id: "TC-8801",
    name: "Priya Deshmukh",
    subtitle: "Inbound Home Loan Servicing",
    badge: "Inbound",
    badgeTone: "ok" as const,
    tier: "Tier 1 & Tier 2 Auth",
    facility: "Home Loan · ₹35,00,000",
    dialect: "Hinglish / Marathi Hybrid",
    validation: "Out-of-band SMS & in-app approval",
    desc: "Customer calls to check EMI, due dates, explain interest rate adjustments, and shift auto-debit dates via in-app authorization.",
    href: "/call/priya",
    edge: "border-l-primary",
    avatar: "PD",
  },
  {
    id: "TC-8802",
    name: "Ramesh Patil",
    subtitle: "Outbound Collections & PTP",
    badge: "Outbound",
    badgeTone: "warn" as const,
    tier: "Bucket 1-30 DPD",
    facility: "Personal Loan · ₹5,00,000",
    dialect: "Hindi (North Maharashtra)",
    validation: "DOB verification & PTP record",
    desc: "Automated dialer outreach within RBI 08:00–19:00 window for overdue ₹13,500 EMI with Promise to Pay (PTP) negotiation.",
    href: "/call/ramesh",
    edge: "border-l-warn-fg",
    avatar: "RP",
  },
  {
    id: "TC-8803",
    name: "Sunita Kulkarni",
    subtitle: "Financial Hardship Review",
    badge: "Inbound",
    badgeTone: "ok" as const,
    tier: "Hardship & Escalation",
    facility: "Vehicle Loan · ₹8,00,000",
    dialect: "Marathi (Pune Region)",
    validation: "Empathetic Human Counselor",
    desc: "Borrower faces medical distress, requesting EMI restructuring or waiver. Tests empathetic boundaries and warm human handover.",
    href: "/call/sunita",
    edge: "border-l-ok-fg",
    avatar: "SK",
  },
  {
    id: "TC-9904",
    name: "Vikram (Adversary)",
    subtitle: "Prompt Injection & Auth Bypass",
    badge: "Adversary / Red Team",
    badgeTone: "danger" as const,
    tier: "Zero Secrets Check",
    facility: "Adversarial Probe",
    dialect: "English / Hinglish Injection",
    validation: "Automatic Redaction Enforced",
    desc: "Spoofed caller ID and prompt injection trying to force the bot to speak full account numbers, OTPs, or bypass auth.",
    href: "/call/vikram",
    edge: "border-l-danger-fg",
    avatar: "VM",
  },
  {
    id: "TC-8805",
    name: "Knowledge Base & FAQ Router",
    subtitle: "Instant Match vs Grounded LLM",
    badge: "Knowledge / FAQ",
    badgeTone: "ok" as const,
    tier: "0ms LLM Direct Bypass",
    facility: "NRE/NRO, KYC, Branch, Fraud",
    dialect: "Multilingual (Hinglish/Marathi/English)",
    validation: "Confidence routing",
    desc: "Tests hybrid FAQ classification. High-confidence general queries bypass LLM token generation; medium-confidence turns ground prompts with verified bank facts.",
    href: "/call/priya",
    edge: "border-l-outline-variant",
    avatar: "KB",
  },
];

export default function TestCasesPage() {
  return (
    <SidebarLayout title="Test Cases" sub="Evaluation Presets & Scenario Launcher">
      <main className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8 space-y-5">
        {/* Compact Operational Header Bar */}
        <section className="flex flex-col gap-3 border-b border-line pb-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">
              Deterministic Test Scenarios
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              Launch seeded borrower journeys, outbound recovery windows, and adversarial guardrail checks directly on the Calling Desk.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral">{testCases.length} Presets</Pill>
            <Pill tone="neutral">RBI Guard: 08:00–19:00 IST</Pill>
            <Button href="/dev" variant="secondary" small>
              <Icon name="sliders" size={13} />
              <span>Developer Lab</span>
            </Button>
          </div>
        </section>

        {/* Deterministic Scenario Grid */}
        <section aria-label="Test case presets" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {testCases.map((tc) => (
            <Card
              key={tc.id}
              className={`flex flex-col justify-between border-l-[3px] ${tc.edge} p-4`}
            >
              <div>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={tc.badgeTone}>{tc.badge}</Pill>
                    <span className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-muted">
                      {tc.tier}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-muted">#{tc.id}</span>
                </div>

                <div className="mb-2.5 flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-sunken font-mono text-xs font-semibold text-fg">
                    {tc.avatar}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-fg">{tc.name}</h2>
                    <p className="truncate text-xs text-muted">{tc.subtitle}</p>
                  </div>
                </div>

                <p className="mb-3 text-xs leading-relaxed text-muted">{tc.desc}</p>

                <dl className="mb-3 space-y-1 rounded-md border border-line bg-surface-container-low p-2.5 font-mono text-[11px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Facility</dt>
                    <dd className="text-right font-medium text-fg">{tc.facility}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Dialect</dt>
                    <dd className="text-right text-fg">{tc.dialect}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Check</dt>
                    <dd className="text-right font-medium text-primary">{tc.validation}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex items-center justify-between border-t border-line pt-2.5">
                <span className="font-mono text-[11px] text-muted">Seeded ledger state</span>
                <Button href={tc.href} small className="font-semibold">
                  <Icon name="support_agent" size={13} />
                  <span>Start Test</span>
                </Button>
              </div>
            </Card>
          ))}

          {/* Custom Config Bench Launcher (No Invented Placeholder Stats) */}
          <Card className="flex flex-col justify-between border-l-[3px] border-l-outline-variant p-4 lg:col-span-2">
            <div>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Pill tone="accent">Custom Bench</Pill>
                  <span className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    VOICE_DEV=1
                  </span>
                </div>
                <span className="font-mono text-[11px] text-muted">/dev</span>
              </div>

              <h2 className="text-sm font-semibold text-fg">
                Configurable Model &amp; Speech Bench
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
                Compare local Ollama, Google Gemini, and Sarvam configurations side by side, tune token limits, keyterms, TTS speed, and FAQ thresholds, and export turn-by-turn latency CSV/JSON.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2.5 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-mono text-[11px] text-muted">
                All runtime parameters live in Developer Lab
              </span>
              <div className="flex items-center gap-2">
                <Button href="/dev" variant="secondary" small>
                  <Icon name="sliders" size={13} />
                  <span>Edit Parameters</span>
                </Button>
                <Button href="/call/priya" small className="font-semibold">
                  <Icon name="support_agent" size={13} />
                  <span>Launch Desk</span>
                </Button>
              </div>
            </div>
          </Card>
        </section>
      </main>
    </SidebarLayout>
  );
}
