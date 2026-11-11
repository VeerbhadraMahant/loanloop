"use client";
import Link from "next/link";
import { useGet, type CallRow, type Collections, type GwEvent, type Handover } from "@/lib/api";
import { PageHeader } from "@/components/bank/page-header";
import { KpiTile } from "@/components/bank/kpi-tile";
import { ErrorState } from "@/components/bank/states";
import { inrCompact, num } from "@/components/bank/format";

const POLL = 15000;

export default function TodayPage() {
  const calls = useGet<CallRow[]>("/dashboard/calls", POLL);
  const handovers = useGet<Handover[]>("/dashboard/handovers", POLL);
  const security = useGet<GwEvent[]>("/dashboard/security", POLL);
  const coll = useGet<Collections>("/dashboard/collections", POLL);

  const live = calls.data?.filter((c) => !c.ended_at).length ?? 0;
  const overdue = coll.data?.cases.reduce((s, c) => s + c.overdue_amount, 0) ?? 0;
  const err = calls.error ?? handovers.error ?? security.error ?? coll.error;
  const retry = () => { calls.reload(); handovers.reload(); security.reload(); coll.reload(); };

  return (
    <div className="space-y-6">
      <PageHeader title="Today" description="What needs your attention across calls, handovers, collections and security." />
      {err && <ErrorState message={err} onRetry={retry} />}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/bank/conversations" className="block rounded-lg">
          <KpiTile label="Calls handled" value={num(calls.data?.length)} hint={`${live} live now`} loading={calls.loading} />
        </Link>
        <Link href="/bank/handovers" className="block rounded-lg">
          <KpiTile label="Handovers to your team" value={num(handovers.data?.length)} hint="Calls needing a person" tone="warn" loading={handovers.loading} />
        </Link>
        <Link href="/bank/security" className="block rounded-lg">
          <KpiTile label="Blocked attempts" value={num(security.data?.length)} hint="Secrets, failed checks, unapproved requests" tone="danger" loading={security.loading} />
        </Link>
        <Link href="/bank/collections" className="block rounded-lg">
          <KpiTile label="Overdue amount" value={inrCompact(overdue)} hint={`${num(coll.data?.cases.length)} open cases`} tone="info" loading={coll.loading} />
        </Link>
      </section>
    </div>
  );
}
