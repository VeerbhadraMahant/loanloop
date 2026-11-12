"use client";
import Link from "next/link";
import { SidebarLayout } from "@/components/sidebar-nav";
import { Button, Icon, type IconName } from "@/components/ui";

const capabilities = [
  { value: "~0.5 s", label: "Typed response (Sarvam 105B); full voice turn 2.9–3.3 s" },
  { value: "29", label: "Authenticated gateway actions" },
  { value: "4 + 7 beta", label: "Languages: English, Hindi, Hinglish, Marathi + 7 MT beta" },
];

const workspaces: {
  href: string;
  title: string;
  role: string;
  icon: IconName;
  primary?: boolean;
}[] = [
  {
    href: "/call/priya",
    title: "Calling Desk",
    role: "Live voice & typed agent session with ledger grounding and phone sidecar",
    icon: "support_agent",
    primary: true,
  },
  {
    href: "/user/home",
    title: "User Console",
    role: "Customer-facing smartphone view with call audio, SMS inbox, and Tier-2 approvals",
    icon: "phone",
  },
  {
    href: "/ops",
    title: "Ops Console",
    role: "Live SSE call stream, session timeline, handover queue, and blocked threats",
    icon: "activity",
  },
  {
    href: "/collections",
    title: "Collections",
    role: "Overdue loan buckets, dialer priority queue, promises to pay, and refusals",
    icon: "wallet",
  },
  {
    href: "/bank",
    title: "Bank app",
    role: "Sahyadri Bank servicing & compliance console across calls, handovers, and requests",
    icon: "landmark",
  },
  {
    href: "/metrics",
    title: "Metrics & SLA",
    role: "Gateway p50/p95/p99 latency targets (< 50 ms), load test telemetry, and STT accuracy",
    icon: "gauge",
  },
  {
    href: "/test-cases",
    title: "Test Cases",
    role: "Scenario presets for servicing, recovery, hardship escalation, and red-team probes",
    icon: "list_checks",
  },
  {
    href: "/dev",
    title: "Developer Lab",
    role: "Model/provider parameters, live call bench, and typed latency comparison",
    icon: "sliders",
  },
];

const safety: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "lock",
    title: "Never takes secrets",
    body: "PINs, OTPs, and card numbers are refused on call and excluded from LLM prompts, logs, and transcripts.",
  },
  {
    icon: "eye",
    title: "Masked-only output",
    body: "Voice replies speak masked identifiers only. Full IFSC and account numbers are sent out-of-band via SMS.",
  },
  {
    icon: "phone",
    title: "In-App Approval Sidecar",
    body: "Tier-2 actions such as shifting auto-debit dates require explicit tap confirmation in the mobile app.",
  },
];

export default function StaffOverview() {
  return (
    <SidebarLayout title="Sahyadri Operations Desk" sub="Sahyadri Finance Bank">
      <main className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 lg:px-8 space-y-6">
        {/* Compact Operational Header & Launch Bar */}
        <section className="rounded-lg border border-line bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">
                Voice Servicing &amp; Collections Operations
              </h1>
              <p className="mt-1 text-xs leading-relaxed text-muted sm:text-[13px]">
                Multilingual voice banking console for borrower servicing, RBI-window recoveries, out-of-band mobile verification, and deterministic gateway telemetry.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button href="/call/priya" className="font-semibold">
                <Icon name="support_agent" size={15} />
                <span>Launch Calling Desk</span>
              </Button>
              <Button href="/test-cases" variant="secondary">
                <Icon name="list_checks" size={15} />
                <span>Test Cases</span>
              </Button>
              <Button href="/ops" variant="secondary">
                <Icon name="activity" size={15} />
                <span>Ops Console</span>
              </Button>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-3">
            {capabilities.map((c) => (
              <div key={c.label} className="flex items-baseline gap-2.5 min-w-0">
                <dt className="num text-base font-semibold text-fg shrink-0">{c.value}</dt>
                <dd className="text-xs text-muted leading-snug">{c.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Dense Workspace Directory */}
        <section aria-labelledby="workspaces-heading">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 id="workspaces-heading" className="text-xs font-semibold uppercase tracking-wider text-muted">
              Consoles &amp; Tools
            </h2>
          </div>
          <div className="grid grid-cols-1 divide-y divide-line overflow-hidden rounded-lg border border-line bg-card md:grid-cols-2 md:divide-y-0">
            {workspaces.map((w, idx) => (
              <Link
                key={w.href}
                href={w.href}
                className={`group flex items-start justify-between gap-3 p-3.5 transition-colors hover:bg-sunken ${
                  idx % 2 === 1 ? "md:border-l md:border-line" : ""
                } ${idx >= 2 ? "md:border-t md:border-line" : ""}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                      w.primary
                        ? "border-primary/25 bg-secondary-container text-primary"
                        : "border-line bg-sunken text-muted group-hover:text-fg"
                    }`}
                  >
                    <Icon name={w.icon} size={14} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-fg group-hover:text-primary transition-colors">
                      {w.title}
                    </div>
                    <p className="mt-0.5 text-xs text-muted leading-snug">{w.role}</p>
                  </div>
                </div>
                <Icon
                  name="chevron_right"
                  size={14}
                  className="mt-1 shrink-0 text-muted group-hover:text-fg transition-colors"
                />
              </Link>
            ))}
          </div>
        </section>

        {/* Slim Guardrails Strip */}
        <section aria-labelledby="safe">
          <h2 id="safe" className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            Zero Secrets &amp; Authorization Guardrails
          </h2>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
            {safety.map((s) => (
              <div key={s.title} className="bg-card p-3.5">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <Icon name={s.icon} size={14} className="text-primary" />
                  <h3>{s.title}</h3>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Handset Shortcuts & Footer */}
        <footer className="flex flex-col gap-3 border-t border-line pt-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span>Standalone simulated handsets:</span>
            <Link
              href="/phone/priya"
              className="rounded-md border border-line bg-card px-2.5 py-1 font-mono text-[11px] text-fg hover:bg-sunken transition-colors"
            >
              Priya&apos;s Phone
            </Link>
            <Link
              href="/phone/ramesh"
              className="rounded-md border border-line bg-card px-2.5 py-1 font-mono text-[11px] text-fg hover:bg-sunken transition-colors"
            >
              Ramesh&apos;s Phone
            </Link>
            <Link
              href="/phone/sunita"
              className="rounded-md border border-line bg-card px-2.5 py-1 font-mono text-[11px] text-fg hover:bg-sunken transition-colors"
            >
              Sunita&apos;s Phone
            </Link>
          </div>
          <p className="font-mono text-[11px]">
            Sahyadri Finance Bank ·{" "}
            <Link href="/bank" className="underline underline-offset-2 hover:text-fg">
              Bank app →
            </Link>
          </p>
        </footer>
      </main>
    </SidebarLayout>
  );
}
