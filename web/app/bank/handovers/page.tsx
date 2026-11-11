"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useGet, type Handover } from "@/lib/api";
import { PageHeader } from "@/components/bank/page-header";
import { KpiTile } from "@/components/bank/kpi-tile";
import { StatusBadge } from "@/components/bank/status-badge";
import { DataTable, type Column } from "@/components/bank/data-table";
import { DetailDrawer } from "@/components/bank/detail-drawer";
import { FilterBar } from "@/components/bank/filter-bar";
import { EmptyState, ErrorState } from "@/components/bank/states";
import { istTime, num } from "@/components/bank/format";
import { human, keyOf, reasonOf } from "@/components/bank/labels";

const GATEWAY_CAP = 100; // /dashboard/handovers returns at most 100 rows

const ts = (iso: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
function waited(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - ts(iso)) / 60000));
  if (m < 1) return "under 1 min";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}
const hay = (h: Handover) => `${h.customer_ref} ${reasonOf(h.reason).label} ${h.summary} ${h.call_id}`.toLowerCase();

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-bank-muted">{empty}</p>;
  return <ul className="flex flex-wrap gap-2">{items.map((x, i) => <li key={i}><StatusBadge>{human(x)}</StatusBadge></li>)}</ul>;
}

export default function HandoversPage() {
  const { data, error, loading, reload } = useGet<Handover[]>("/dashboard/handovers", 15000);
  const [reason, setReason] = useState("all");
  const [q, setQ] = useState("");
  const [newestFirst, setNewestFirst] = useState(false);
  const [selected, setSelected] = useState<Handover | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => { const t = () => setNow(Date.now()); t(); const i = setInterval(t, 30000); return () => clearInterval(i); }, [data]);

  const all = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((h) => m.set(reasonOf(h.reason).label, (m.get(reasonOf(h.reason).label) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const dir = newestFirst ? -1 : 1; // oldest first = ascending created_at
    return all
      .filter((h) => (reason === "all" || reasonOf(h.reason).label === reason) && (!s || hay(h).includes(s)))
      .sort((a, b) => dir * (ts(a.created_at) - ts(b.created_at)));
  }, [all, reason, q, newestFirst]);

  const oldest = all.length ? all.reduce((a, b) => (ts(a.created_at) < ts(b.created_at) ? a : b)) : null;
  const waiting = all.length >= GATEWAY_CAP ? `${GATEWAY_CAP}+` : num(all.length);
  const top = counts[0];

  const columns: Column<Handover>[] = [
    { key: "age", header: "Age", num: true, className: "w-28 whitespace-nowrap", cell: (h) => waited(h.created_at, now) },
    { key: "cust", header: "Customer", className: "w-32 whitespace-nowrap", cell: (h) => h.customer_ref ?? "Unknown" },
    { key: "reason", header: "Reason", className: "w-56", cell: (h) => <StatusBadge tone={reasonOf(h.reason).tone}>{reasonOf(h.reason).label}</StatusBadge> },
    { key: "sum", header: "Summary", className: "hidden md:table-cell min-w-64", cell: (h) => <span className="line-clamp-2">{h.summary}</span> },
    { key: "req", header: "Requests", num: true, className: "hidden lg:table-cell w-44 whitespace-nowrap", cell: (h) => `${h.requests_done.length} done, ${h.requests_pending.length} pending` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Handovers" description="Calls the agent passed to your team, with a case summary." />
      {error && <ErrorState message={error} onRetry={reload} />}

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-3">
        <KpiTile label="Handovers (latest 100)" value={waiting} hint="Calls passed to your team; no resolved state yet" tone="warn" loading={loading} />
        <KpiTile label="Oldest in list" value={oldest ? waited(oldest.created_at, now) : "–"} hint={oldest ? `Since ${istTime(oldest.created_at)}` : undefined} tone="info" loading={loading} />
        <KpiTile label="Most common reason" value={top ? <span className="text-xl">{top[0]}</span> : "–"} hint={top ? `${top[1]} of ${all.length}` : undefined} loading={loading} />
      </section>

      {counts.length > 0 && (
        <section aria-label="Reasons" className="rounded-lg border border-bank-line bg-bank-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Why calls were handed over</h2>
          <ul className="space-y-2">
            {counts.map(([r, n]) => (
              <li key={r} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3 text-sm sm:grid-cols-[14rem_1fr_2rem]">
                <span className="truncate">{r}</span>
                <span className="h-2 rounded-full bg-bank-sunken" aria-hidden><span className="block h-2 rounded-full bg-bank-accent" style={{ width: `${(n / counts[0][1]) * 100}%` }} /></span>
                <span className="b-num text-right">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: "Search customer or summary" }}
        filters={[{ label: "Reason", value: reason, onChange: setReason, options: [{ value: "all", label: "All", count: all.length }, ...counts.map(([r, n]) => ({ value: r, label: r, count: n }))] }]}
      >
        <button type="button" onClick={() => setNewestFirst((v) => !v)} className="b-pressable min-h-10 cursor-pointer rounded-md border border-bank-line-strong bg-bank-surface px-3 text-sm font-medium hover:bg-bank-sunken">
          {newestFirst ? "Newest first" : "Oldest first"}
        </button>
      </FilterBar>

      {!error && (
        <DataTable
          caption="Handovers" columns={columns} rows={rows} rowKey={(h) => String(h.id)} loading={loading}
          onRowClick={setSelected} selectedKey={selected ? String(selected.id) : null}
          empty={<EmptyState title={all.length ? "No handovers match" : "No handovers yet"} description={all.length ? "Clear the search or reason filter." : "When the agent passes a call to your team it will appear here."} />}
        />
      )}

      <DetailDrawer open={!!selected} onClose={() => setSelected(null)} title={selected ? `Handover from ${selected.customer_ref ?? "unknown customer"}` : ""} subtitle={selected ? `Handed over ${waited(selected.created_at, now)} ago, at ${istTime(selected.created_at)}` : undefined}>
        {selected && (
          <div className="space-y-5">
            {keyOf(selected.reason) === "hardship" && (
              <div role="note" className="rounded-lg border border-bank-warn-fg/40 bg-bank-warn-bg px-4 py-3 text-bank-warn-fg">
                <p className="font-medium">This customer has said they are struggling to pay.</p>
                <p className="mt-1 text-sm">Listen first and acknowledge their situation. Check the case summary for what was already discussed.</p>
              </div>
            )}
            <div><StatusBadge tone={reasonOf(selected.reason).tone}>{reasonOf(selected.reason).label}</StatusBadge></div>
            <section><h3 className="mb-1 text-sm font-medium text-bank-muted">Case summary</h3><p>{selected.summary}</p></section>
            <section><h3 className="mb-2 text-sm font-medium text-bank-muted">Already done on the call</h3><Chips items={selected.requests_done} empty="Nothing completed." /></section>
            <section><h3 className="mb-2 text-sm font-medium text-bank-muted">Still pending for your team</h3><Chips items={selected.requests_pending} empty="Nothing pending." /></section>
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-bank-line p-3 text-sm">
              <div><dt className="text-bank-muted">Customer</dt><dd>{selected.customer_ref ?? "Unknown"}</dd></div>
              <div><dt className="text-bank-muted">Call</dt><dd className="break-all">{selected.call_id}</dd></div>
            </dl>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/bank/conversations?call=${encodeURIComponent(selected.call_id)}`} className="b-pressable inline-flex min-h-10 items-center rounded-md bg-bank-accent px-4 font-medium text-bank-accent-fg">Open conversation</Link>
              <button type="button" disabled title="Not wired yet: the gateway has no endpoint to assign or resolve handovers." className="min-h-10 cursor-not-allowed rounded-md border border-bank-line-strong px-4 font-medium text-bank-muted opacity-60">Assign</button>
            </div>
            <p className="text-xs text-bank-muted">Assigning and resolving are not wired yet, so handovers stay in this list.</p>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
