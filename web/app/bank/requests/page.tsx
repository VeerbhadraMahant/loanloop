"use client";
import { useState } from "react";
import { useGet, type ReqStatus, type ServiceRequestRow, type ServiceRequests } from "@/lib/api";
import { PageHeader } from "@/components/bank/page-header";
import { KpiTile } from "@/components/bank/kpi-tile";
import { DataTable, type Column } from "@/components/bank/data-table";
import { FilterBar } from "@/components/bank/filter-bar";
import { DetailDrawer } from "@/components/bank/detail-drawer";
import { StatusBadge, type Tone } from "@/components/bank/status-badge";
import { EmptyState, ErrorState } from "@/components/bank/states";
import { istTime, num } from "@/components/bank/format";

const TYPE_LABEL: Record<string, string> = {
  statement: "Statement", interest_cert: "Interest certificate", nominee: "Nominee update", address: "Address update",
  emi_date_change: "EMI date change", reconciliation: "Payment reconciliation", closure: "Loan closure",
};
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", done: "Done", rejected: "Rejected" };
const STATUS_TONE: Record<ReqStatus, Tone> = { open: "warn", in_progress: "info", done: "ok", rejected: "danger" };
const label = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, " ");

export default function RequestsPage() {
  const { data, error, loading, reload } = useGet<ServiceRequests>("/dashboard/requests", 15000);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<ServiceRequestRow | null>(null);

  const all = data?.requests ?? [];
  const bs = data?.counts.by_status ?? {};
  const bt = data?.counts.by_type ?? {};
  const rows = all.filter((r) => (type === "all" || r.type === type) && (status === "all" || r.status === status));

  const columns: Column<ServiceRequestRow>[] = [
    { key: "id", header: "Ref", cell: (r) => `#${r.id}`, num: true },
    { key: "type", header: "Request", cell: (r) => label(r.type) },
    { key: "customer", header: "Customer", cell: (r) => r.customer_ref, className: "hidden sm:table-cell" },
    { key: "summary", header: "Summary", cell: (r) => <span className="line-clamp-1 text-bank-muted">{r.summary}</span>, className: "hidden lg:table-cell" },
    { key: "created", header: "Raised (IST)", cell: (r) => istTime(r.created_at), className: "whitespace-nowrap" },
    { key: "status", header: "Status", cell: (r) => <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</StatusBadge> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Service requests" description="Requests raised by the voice agent during calls, awaiting action." />
      {error && <ErrorState message={error} onRetry={reload} />}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Open" value={num(bs.open ?? 0)} hint="Not yet picked up (all requests)" tone="warn" loading={loading} />
        <KpiTile label="In progress" value={num(bs.in_progress ?? 0)} hint="All requests" tone="info" loading={loading} />
        <KpiTile label="Done" value={num(bs.done ?? 0)} hint="All requests" tone="ok" loading={loading} />
        <KpiTile label="Rejected" value={num(bs.rejected ?? 0)} hint="All requests" tone="danger" loading={loading} />
      </section>
      {!error && !loading && all.length === 0 ? (
        <EmptyState
          title="No service requests yet"
          description="Requests appear here when the voice agent raises them during calls: statements, interest certificates, EMI date changes, nominee and address updates, reconciliations and closures."
        />
      ) : (
        <>
          <FilterBar
            filters={[
              { label: "Status", value: status, onChange: setStatus, options: [{ value: "all", label: "All" }, ...Object.keys(STATUS_LABEL).map((s) => ({ value: s, label: STATUS_LABEL[s], count: bs[s] ?? 0 }))] },
              { label: "Type", value: type, onChange: setType, options: [{ value: "all", label: "All" }, ...Object.keys(TYPE_LABEL).map((t) => ({ value: t, label: TYPE_LABEL[t], count: bt[t] ?? 0 }))] },
            ]}
          />
          <DataTable
            caption="Service requests" columns={columns} rows={rows} rowKey={(r) => String(r.id)} loading={loading}
            onRowClick={setSelected} selectedKey={selected ? String(selected.id) : null}
            empty={<EmptyState title="No requests match these filters" description="Clear a filter to see more." action={<button type="button" className="b-pressable min-h-10 cursor-pointer rounded-md border border-bank-line-strong px-4 font-medium" onClick={() => { setType("all"); setStatus("all"); }}>Clear filters</button>} />}
          />
          {all.length >= 100 && <p className="text-xs text-bank-muted">The table shows the latest 100 requests; the figures above count all requests.</p>}
        </>
      )}
      <DetailDrawer open={!!selected} onClose={() => setSelected(null)} title={selected ? `${label(selected.type)} #${selected.id}` : ""} subtitle={selected ? `${selected.customer_ref} · ${istTime(selected.created_at)} IST` : undefined}>
        {selected && (
          <div className="space-y-4">
            <StatusBadge tone={STATUS_TONE[selected.status] ?? "neutral"}>{STATUS_LABEL[selected.status] ?? selected.status}</StatusBadge>
            <div>
              <h3 className="text-xs font-medium text-bank-muted">Summary</h3>
              <p className="mt-1 whitespace-pre-wrap">{selected.summary || "No summary recorded."}</p>
            </div>
            <p className="text-sm text-bank-muted">Details are masked at source; full identifiers are never shown here.</p>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
