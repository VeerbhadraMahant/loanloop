"use client";
import { useState } from "react";
import { post, useGet, type CollCase, type CollPtp, type CollRtp, type Collections } from "@/lib/api";
import { PageHeader } from "@/components/bank/page-header";
import { KpiTile } from "@/components/bank/kpi-tile";
import { DataTable, type Column } from "@/components/bank/data-table";
import { FilterBar } from "@/components/bank/filter-bar";
import { DetailDrawer } from "@/components/bank/detail-drawer";
import { StatusBadge, type Tone } from "@/components/bank/status-badge";
import { EmptyState, ErrorState } from "@/components/bank/states";
import { inr, inrCompact, istTime, num } from "@/components/bank/format";

const PTP_TONE: Record<string, Tone> = { open: "info", kept: "ok", broken: "danger", cancelled: "neutral" };
const human = (s: string) => { const t = s.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const btn = "b-pressable min-h-10 cursor-pointer rounded-md border border-bank-line-strong px-4 font-medium";

function Buckets({ cases }: { cases: CollCase[] }) {
  const map = new Map<string, { n: number; amt: number; dpd: number }>();
  for (const c of cases) {
    const b = map.get(c.bucket) ?? { n: 0, amt: 0, dpd: c.dpd };
    b.n++; b.amt += c.overdue_amount; b.dpd = Math.min(b.dpd, c.dpd); map.set(c.bucket, b);
  }
  const list = [...map].sort((a, b) => a[1].dpd - b[1].dpd);
  const max = Math.max(1, ...list.map(([, v]) => v.amt));
  return (
    <section aria-label="Overdue by days past due" className="rounded-lg border border-bank-line bg-bank-surface p-4">
      <h2 className="b-title text-lg">Overdue by days past due</h2>
      {list.length === 0 ? <p className="mt-2 text-bank-muted">No open cases.</p> : (
        <ul className="mt-3 space-y-3">
          {list.map(([name, v]) => (
            <li key={name} className="grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[6rem_1fr_16rem]">
              <span className="font-medium">{name}</span>
              <div className="h-3 overflow-hidden rounded-full bg-bank-sunken" aria-hidden>
                <div className="h-full rounded-full bg-bank-accent" style={{ width: `${Math.max(2, (v.amt / max) * 100)}%` }} />
              </div>
              <span className="b-num col-span-2 text-sm text-bank-muted sm:col-span-1 sm:text-right">{inr(v.amt)} · {num(v.n)} {v.n === 1 ? "case" : "cases"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function CollectionsPage() {
  const { data, error, loading, reload } = useGet<Collections>("/dashboard/collections", 15000);
  const [tab, setTab] = useState("queue");
  const [selected, setSelected] = useState<CollCase | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [run, setRun] = useState<{ busy: boolean; msg?: string; err?: string }>({ busy: false });

  const cases = data?.cases ?? [], ptps = data?.ptps ?? [], rtps = data?.rtps ?? [], queue = data?.queue ?? [];
  const open = ptps.filter((p) => p.status === "open");
  const kept = ptps.filter((p) => p.status === "kept").length, broken = ptps.filter((p) => p.status === "broken").length;
  const overdue = cases.reduce((s, c) => s + c.overdue_amount, 0);

  const doRun = async () => {
    setConfirm(false); setRun({ busy: true });
    try {
      const r = await post<{ runs: unknown[] }>("/dashboard/jobs/run");
      setRun({ busy: false, msg: `Jobs ran (${r.runs?.length ?? 0} completed).` }); reload();
    } catch (e) { setRun({ busy: false, err: e instanceof Error ? e.message : "Jobs failed" }); }
  };

  const qCols: Column<CollCase>[] = [
    { key: "prio", header: "Priority", cell: (c) => c.priority, num: true },
    { key: "cust", header: "Customer", cell: (c) => c.customer ?? "–" },
    { key: "loan", header: "Loan", cell: (c) => c.loan, className: "hidden sm:table-cell" },
    { key: "dpd", header: "DPD", cell: (c) => c.dpd, num: true, align: "right" },
    { key: "amt", header: "Overdue", cell: (c) => inr(c.overdue_amount), num: true, align: "right" },
    { key: "att", header: "Attempts", cell: (c) => c.attempts, num: true, align: "right", className: "hidden md:table-cell" },
    { key: "next", header: "Next action (IST)", cell: (c) => istTime(c.next_action_at), className: "hidden md:table-cell whitespace-nowrap" },
    { key: "st", header: "Status", cell: (c) => <StatusBadge tone={c.status === "resolved" ? "ok" : "warn"}>{human(c.status)}</StatusBadge> },
  ];
  const pCols: Column<CollPtp>[] = [
    { key: "c", header: "Customer", cell: (p) => p.customer ?? "–" },
    { key: "l", header: "Loan", cell: (p) => p.loan, className: "hidden sm:table-cell" },
    { key: "a", header: "Promised", cell: (p) => inr(p.amount), num: true, align: "right" },
    { key: "d", header: "Promised date", cell: (p) => istTime(p.promised_date), className: "whitespace-nowrap" },
    { key: "t", header: "Type", cell: (p) => human(p.amount_tag), className: "hidden md:table-cell" },
    { key: "pd", header: "Paid", cell: (p) => (p.paid_amount == null ? "–" : inr(p.paid_amount)), num: true, align: "right", className: "hidden md:table-cell" },
    { key: "s", header: "Status", cell: (p) => <StatusBadge tone={PTP_TONE[p.status] ?? "neutral"}>{human(p.status)}</StatusBadge> },
  ];
  const rCols: Column<CollRtp>[] = [
    { key: "c", header: "Customer", cell: (r) => r.customer ?? "–" },
    { key: "l", header: "Loan", cell: (r) => r.loan, className: "hidden sm:table-cell" },
    { key: "r", header: "Reason", cell: (r) => human(r.reason_code) },
    { key: "n", header: "Note", cell: (r) => <span className="line-clamp-1 text-bank-muted">{r.note ?? "–"}</span>, className: "hidden lg:table-cell" },
    { key: "o", header: "Overdue", cell: (r) => inr(r.overdue_amount), num: true, align: "right" },
    { key: "f", header: "Follow-up (IST)", cell: (r) => istTime(r.follow_up_at), className: "hidden md:table-cell whitespace-nowrap" },
  ];

  const casePtps = selected ? ptps.filter((p) => p.case_id === selected.id) : [];
  const caseRtps = selected ? rtps.filter((r) => r.case_id === selected.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Collections" description="Overdue cases, promises to pay and refusals. Calls only 08:00–19:00 IST." />
      {error && <ErrorState message={error} onRetry={reload} />}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Open cases" value={num(cases.length)} tone="info" loading={loading} />
        <KpiTile label="Overdue total" value={inrCompact(overdue)} hint={inr(overdue)} tone="danger" loading={loading} />
        <KpiTile label="Open promises to pay" value={num(open.length)} hint={`${inr(open.reduce((s, p) => s + p.amount, 0))} promised`} tone="warn" loading={loading} />
        <KpiTile label="Promises kept / broken" value={`${num(kept)} / ${num(broken)}`} tone="ok" loading={loading} />
      </section>
      <Buckets cases={cases} />
      <FilterBar filters={[{ label: "View", value: tab, onChange: setTab, options: [
        { value: "queue", label: "Dialer queue", count: queue.length }, { value: "ptp", label: "Promises to pay", count: ptps.length }, { value: "rtp", label: "Refusals to pay", count: rtps.length }] }]}>
        <button type="button" className={btn} disabled={run.busy} onClick={() => setConfirm(true)}>{run.busy ? "Running…" : "Run jobs now"}</button>
      </FilterBar>
      {confirm && (
        <div role="alertdialog" aria-label="Confirm run jobs" className="flex flex-wrap items-center gap-3 rounded-lg border border-bank-warn-fg/40 bg-bank-warn-bg px-4 py-3 text-bank-warn-fg">
          <p className="flex-1">Run the collections jobs now? This updates cases and the queue on the gateway.</p>
          <button type="button" className={btn} autoFocus onClick={doRun}>Yes, run jobs</button>
          <button type="button" className={btn} onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      )}
      {run.msg && <p role="status" className="rounded-lg border border-bank-ok-fg/40 bg-bank-ok-bg px-4 py-3 text-bank-ok-fg">{run.msg}</p>}
      {run.err && <ErrorState message={run.err} />}
      {tab === "queue" && <DataTable caption="Dialer queue" columns={qCols} rows={queue} rowKey={(c) => String(c.id)} loading={loading} onRowClick={setSelected} selectedKey={selected ? String(selected.id) : null}
        empty={<EmptyState title="Dialer queue is empty" description="No cases are due for a call right now." />} />}
      {tab === "ptp" && <DataTable caption="Promises to pay" columns={pCols} rows={ptps} rowKey={(p) => String(p.id)} loading={loading}
        empty={<EmptyState title="No promises to pay" description="Promises appear when a borrower commits to a date and amount on a call." />} />}
      {tab === "rtp" && <DataTable caption="Refusals to pay" columns={rCols} rows={rtps} rowKey={(r) => String(r.id)} loading={loading}
        empty={<EmptyState title="No refusals to pay" description="Refusals appear with the borrower's stated reason when they decline to pay." />} />}
      <DetailDrawer open={!!selected} onClose={() => setSelected(null)} title={selected?.customer ?? "Case"} subtitle={selected ? `${selected.loan} · ${selected.dpd} DPD · ${inr(selected.overdue_amount)} overdue` : undefined}>
        {selected && (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-bank-muted">Missed EMIs</dt><dd className="b-num">{selected.missed_emis}</dd></div>
              <div><dt className="text-bank-muted">Attempts</dt><dd className="b-num">{selected.attempts}</dd></div>
              <div><dt className="text-bank-muted">Last call (IST)</dt><dd>{istTime(selected.last_call_at)}</dd></div>
              <div><dt className="text-bank-muted">Next action (IST)</dt><dd>{istTime(selected.next_action_at)}</dd></div>
            </dl>
            <div>
              <h3 className="b-title text-lg">Promises to pay</h3>
              {casePtps.length === 0 ? <p className="mt-1 text-bank-muted">None for this case.</p> : (
                <ul className="mt-2 space-y-2">{casePtps.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-bank-line p-3">
                    <span className="b-num">{inr(p.amount)} by {istTime(p.promised_date)}</span>
                    <StatusBadge tone={PTP_TONE[p.status] ?? "neutral"}>{human(p.status)}</StatusBadge>
                  </li>))}</ul>
              )}
            </div>
            <div>
              <h3 className="b-title text-lg">Refusals to pay</h3>
              {caseRtps.length === 0 ? <p className="mt-1 text-bank-muted">None for this case.</p> : (
                <ul className="mt-2 space-y-2">{caseRtps.map((r) => (
                  <li key={r.id} className="rounded-md border border-bank-line p-3">
                    <p className="font-medium">{human(r.reason_code)}</p>
                    {r.note && <p className="text-sm text-bank-muted">{r.note}</p>}
                    <p className="text-sm text-bank-muted">Follow-up {istTime(r.follow_up_at)} IST</p>
                  </li>))}</ul>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
