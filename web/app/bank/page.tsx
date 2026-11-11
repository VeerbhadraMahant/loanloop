"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEvents, useGet, type CallRow, type Collections, type GwEvent, type Handover } from "@/lib/api";
import { PageHeader } from "@/components/bank/page-header";
import { KpiTile } from "@/components/bank/kpi-tile";
import { DataTable, type Column } from "@/components/bank/data-table";
import { EmptyState, ErrorState } from "@/components/bank/states";
import { StatusBadge } from "@/components/bank/status-badge";
import { inrCompact, istTime, num, relTime } from "@/components/bank/format";
import { OutcomeBadge, customerName, istDay, langLabel, ms } from "./conversations/shared";

const POLL = 15000;
const CAP = 100; // gateway returns at most 100 rows per list
const capped = (n: number) => (n >= CAP ? `${CAP}+` : num(n));

type Item = { key: string; ts: string; href: string; kind: "handover" | "security"; who: string; text: string };

export default function TodayPage() {
  const calls = useGet<CallRow[]>("/dashboard/calls", POLL);
  const handovers = useGet<Handover[]>("/dashboard/handovers", POLL);
  const security = useGet<GwEvent[]>("/dashboard/security", POLL);
  const coll = useGet<Collections>("/dashboard/collections", POLL);

  // Live: any gateway event triggers one coalesced refetch; polling is the fallback.
  const reloads = useRef<(() => void)[]>([]);
  useEffect(() => { reloads.current = [calls.reload, handovers.reload, security.reload, coll.reload]; });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEvents(useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => reloads.current.forEach((r) => r()), 800);
  }, []));

  const rows = calls.data;
  // Set after mount (static prerender can't read the clock) and refreshed each minute so midnight IST rolls over.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setToday(istDay(Date.now()));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 60000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  const todays = today ? rows?.filter((c) => istDay(c.started_at) === today).length : undefined;
  const ended = rows?.filter((c) => c.outcome) ?? [];
  const resolved = ended.filter((c) => c.outcome !== "handover").length;
  const live = rows?.filter((c) => !c.ended_at).length ?? 0;
  const overdue = coll.data?.cases.reduce((s, c) => s + c.overdue_amount, 0) ?? 0;
  const err = calls.error ?? handovers.error ?? security.error ?? coll.error;
  const retry = () => reloads.current.forEach((r) => r());

  const items: Item[] = [
    ...(handovers.data ?? []).map((h): Item => ({ key: `h${h.id}`, ts: h.created_at, href: "/bank/handovers", kind: "handover", who: customerName(h.customer_ref), text: h.reason })),
    ...(security.data ?? []).map((e): Item => ({ key: `s${e.id}`, ts: e.ts, href: "/bank/security", kind: "security", who: customerName(e.customer_ref), text: e.detail ?? e.error_code ?? "Security event" })),
  ].sort((a, b) => ms(b.ts) - ms(a.ts)).slice(0, 6);

  const cols: Column<CallRow>[] = [
    { key: "c", header: "Customer", cell: (c) => <Link href={`/bank/conversations?call=${c.call_id}`} className="font-medium text-bank-accent-ink underline-offset-2 hover:underline">{customerName(c.customer_ref)}</Link> },
    { key: "t", header: "Started", cell: (c) => relTime(c.started_at) },
    { key: "l", header: "Language", cell: (c) => langLabel(c.language), className: "hidden sm:table-cell" },
    { key: "o", header: "Outcome", cell: (c) => <OutcomeBadge outcome={c.outcome} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Today" description="What needs your attention across calls, handovers, collections and security." />
      {err && <ErrorState message={err} onRetry={retry} />}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link href="/bank/conversations" className="block rounded-lg">
          <KpiTile label="Calls today" value={todays == null ? "–" : capped(todays)} hint={`${live} live now`} loading={calls.loading} />
        </Link>
        <Link href="/bank/conversations" className="block rounded-lg">
          <KpiTile label="Resolved by agent" value={ended.length ? `${Math.round((resolved / ended.length) * 100)}%` : "–"} hint={`${num(resolved)} of ${num(ended.length)} ended calls; rest handed over`} tone="ok" loading={calls.loading} />
        </Link>
        <Link href="/bank/handovers" className="block rounded-lg">
          <KpiTile label="Handovers waiting" value={handovers.data ? capped(handovers.data.length) : "–"} hint="Calls needing a person" tone="warn" loading={handovers.loading} />
        </Link>
        <Link href="/bank/security" className="block rounded-lg">
          <KpiTile label="Blocked attempts" value={security.data ? capped(security.data.length) : "–"} hint="Secrets, failed checks, unapproved requests" tone="danger" loading={security.loading} />
        </Link>
        <Link href="/bank/collections" className="block rounded-lg">
          <KpiTile label="Overdue total" value={inrCompact(overdue)} hint={`${num(coll.data?.cases.length)} open cases`} tone="info" loading={coll.loading} />
        </Link>
      </section>

      <div className="grid gap-6 xl:grid-cols-5">
        <section aria-labelledby="attn" className="min-w-0 space-y-3 xl:col-span-2">
          <h2 id="attn" className="b-title text-lg">Needs attention</h2>
          {handovers.loading || security.loading ? (
            <div className="skeleton h-40 rounded-lg" aria-label="Loading" />
          ) : items.length === 0 ? (
            <EmptyState title="Nothing needs attention" description="No handovers or security events yet." />
          ) : (
            <ul className="divide-y divide-bank-line rounded-lg border border-bank-line bg-bank-surface">
              {items.map((i) => (
                <li key={i.key}>
                  <Link href={i.href} className="flex min-h-12 items-start gap-3 px-4 py-3 hover:bg-bank-sunken focus-visible:bg-bank-sunken">
                    <StatusBadge tone={i.kind === "handover" ? "warn" : "danger"}>{i.kind === "handover" ? "Handover" : "Security"}</StatusBadge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.who}</span>
                      <span className="block truncate text-sm text-bank-muted">{i.text}</span>
                    </span>
                    <span className="shrink-0 text-xs text-bank-muted" title={istTime(i.ts)}>{relTime(i.ts)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="recent" className="min-w-0 space-y-3 xl:col-span-3">
          <div className="flex items-baseline justify-between">
            <h2 id="recent" className="b-title text-lg">Recent conversations</h2>
            <Link href="/bank/conversations" className="text-sm font-medium text-bank-accent-ink hover:underline">View all</Link>
          </div>
          <DataTable caption="Most recent calls" columns={cols} rows={(rows ?? []).slice(0, 6)} rowKey={(c) => c.call_id} loading={calls.loading}
            empty={<EmptyState title="No calls yet" description="Calls appear here as borrowers phone in." />} />
        </section>
      </div>
    </div>
  );
}
