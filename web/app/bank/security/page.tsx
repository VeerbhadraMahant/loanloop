"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useGet, type GwEvent } from "@/lib/api";
import { PageHeader } from "@/components/bank/page-header";
import { KpiTile } from "@/components/bank/kpi-tile";
import { StatusBadge, type Tone } from "@/components/bank/status-badge";
import { DataTable, type Column } from "@/components/bank/data-table";
import { FilterBar } from "@/components/bank/filter-bar";
import { EmptyState, ErrorState } from "@/components/bank/states";
import { istTime, num, relTime } from "@/components/bank/format";
import { human, what } from "@/components/bank/labels";

type Kind = "secret" | "blocked" | "approval";
const kindOf = (e: GwEvent): Kind =>
  e.type === "approval" ? "approval" : e.error_code === "SECRET_DETECTED" || e.action === "report_secret_spoken" ? "secret" : "blocked";

const KIND: Record<Kind, { label: string; tone: Tone }> = {
  secret: { label: "Secret spoken", tone: "danger" },
  blocked: { label: "Blocked", tone: "warn" },
  approval: { label: "Not approved", tone: "info" },
};
const REFUSALS: [string, string][] = [
  ["Passwords, PINs, OTPs, CVV, full card numbers", "Never asked for, accepted or stored. If a caller says one, the agent interrupts and warns them. The value is discarded; only a \"secret detected\" event with the field name is logged."],
  ["Full account, loan or customer numbers, mobile, email", "Never spoken or returned. The agent gives masked values only, such as \"ending 4417\"."],
  ["Sending details to a number the caller names", "Full details go only by SMS to the mobile registered with the bank. The destination never comes from the caller."],
  ["Data above the caller's verification level", "Enforced by the gateway in code, not by the agent's prompt. Sensitive amounts and changes also need approval tapped in the bank app."],
  ["Unlimited verification attempts", "After 3 failed attempts the call goes to a person."],
  ["Changing data without confirmation", "Every change needs the caller to confirm a read-back first."],
];

export default function SecurityPage() {
  const { data, error, loading, reload } = useGet<GwEvent[]>("/dashboard/security", 15000);
  const [kind, setKind] = useState("all");
  const all = useMemo(() => data ?? [], [data]);
  const n = useMemo(() => {
    const c = { secret: 0, blocked: 0, approval: 0 };
    all.forEach((e) => c[kindOf(e)]++);
    return c;
  }, [all]);
  const rows = useMemo(() => all.filter((e) => kind === "all" || kindOf(e) === kind), [all, kind]);

  const columns: Column<GwEvent>[] = [
    { key: "time", header: "Time", className: "w-36 whitespace-nowrap", cell: (e) => <span title={istTime(e.ts)}>{relTime(e.ts)}</span> },
    { key: "type", header: "Type", className: "w-36", cell: (e) => <StatusBadge tone={KIND[kindOf(e)].tone}>{KIND[kindOf(e)].label}</StatusBadge> },
    { key: "what", header: "What happened", className: "min-w-56", cell: (e) => <><span>{what(e)}</span>{e.action && <span className="block text-xs text-bank-muted">Action: {human(e.action)}</span>}</> },
    { key: "code", header: "Code", className: "hidden xl:table-cell w-36", cell: (e) => <code className="text-xs">{e.error_code ?? "–"}</code> },
    { key: "tier", header: "Tier", num: true, className: "hidden sm:table-cell w-16", cell: (e) => (e.tier == null ? "–" : `T${e.tier}`) },
    { key: "cust", header: "Customer", className: "hidden md:table-cell w-28 whitespace-nowrap", cell: (e) => e.customer_ref ?? "–" },
    { key: "call", header: "Call", className: "w-24", cell: (e) => <Link href={`/bank/conversations?call=${encodeURIComponent(e.call_id)}`} className="text-bank-accent-ink underline underline-offset-2">Open<span className="sr-only"> call {e.call_id}</span></Link> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Security" description="Blocked requests, spoken secrets and approvals that were not completed. Most recent events." />
      {error && <ErrorState message={error} onRetry={reload} />}

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-3">
        <KpiTile label="Blocked requests" value={num(n.blocked)} hint="Above verification level, unverified, or rate limited" tone="warn" loading={loading} />
        <KpiTile label="Secrets detected" value={num(n.secret)} hint="Count only; nothing was stored" tone="danger" loading={loading} />
        <KpiTile label="Unapproved app approvals" value={num(n.approval)} hint="Denied or expired" tone="info" loading={loading} />
      </section>

      <section aria-labelledby="refuse" className="rounded-lg border border-bank-line bg-bank-surface p-4">
        <h2 id="refuse" className="b-title text-lg">What the agent refuses</h2>
        <p className="mt-1 text-sm text-bank-muted">Controls built into the gateway for this system, as designed. Described for review; this page is not a certification or audit opinion.</p>
        <dl className="mt-4 grid gap-x-6 gap-y-4 md:grid-cols-2">
          {REFUSALS.map(([t, d]) => (
            <div key={t}><dt className="font-medium">{t}</dt><dd className="text-sm text-bank-muted">{d}</dd></div>
          ))}
        </dl>
      </section>

      <FilterBar filters={[{ label: "Event type", value: kind, onChange: setKind, options: [
        { value: "all", label: "All", count: all.length },
        { value: "blocked", label: "Blocked", count: n.blocked },
        { value: "secret", label: "Secrets", count: n.secret },
        { value: "approval", label: "Approvals", count: n.approval },
      ] }]} />

      {!error && (
        <DataTable caption="Security events" columns={columns} rows={rows} rowKey={(e) => e.id} loading={loading}
          empty={<EmptyState title="No events" description={all.length ? "Nothing of this type." : "No blocked or unapproved activity recorded."} />} />
      )}
    </div>
  );
}
