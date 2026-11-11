"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { get, useGet, type CallRow, type GwEvent } from "@/lib/api";
import { PageHeader } from "@/components/bank/page-header";
import { FilterBar } from "@/components/bank/filter-bar";
import { DataTable, type Column } from "@/components/bank/data-table";
import { DetailDrawer } from "@/components/bank/detail-drawer";
import { EmptyState, ErrorState } from "@/components/bank/states";
import { StatusBadge } from "@/components/bank/status-badge";
import { istTime, num, relTime } from "@/components/bank/format";
import { OutcomeBadge, customerName, langLabel, outcomeLabel } from "./shared";

const PAGE = 30;
const ALL = "all";
// Lifecycle events are not "requests"; only successful actions count as handled.
const handled = (t: GwEvent[]) => t.filter((e) => e.type === "action" && e.outcome === "ok").length;

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Conversations" description="Every borrower call, with outcome and language." />
      <Suspense fallback={<DataTable caption="Loading calls" columns={[]} rows={[]} rowKey={() => ""} loading />}>
        <Conversations />
      </Suspense>
    </div>
  );
}

function Conversations() {
  const calls = useGet<CallRow[]>("/dashboard/calls", 15000);
  const router = useRouter();
  const pathname = usePathname();
  const callId = useSearchParams().get("call");
  const [q, setQ] = useState("");
  const [lang, setLang] = useState(ALL);
  const [outcome, setOutcome] = useState(ALL);
  const [tier, setTier] = useState(ALL);
  const [shown, setShown] = useState(PAGE);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const all = useMemo(() => calls.data ?? [], [calls.data]);
  const opts = (vals: string[], label: (v: string) => string) =>
    [{ value: ALL, label: "All" }, ...[...new Set(vals)].sort().map((v) => ({ value: v, label: label(v) }))];
  const rows = useMemo(() => all.filter((c) =>
    (lang === ALL || c.language === lang) && (outcome === ALL || (c.outcome ?? "in_progress") === outcome) &&
    (tier === ALL || String(c.tier) === tier) && customerName(c.customer_ref).toLowerCase().includes(q.trim().toLowerCase())), [all, q, lang, outcome, tier]);
  const visible = rows.slice(0, shown);

  // "Requests handled" is not on the list endpoint, so fetch each ended call's timeline once, at most 4 at a time.
  // Asked ids live in a ref (not state): a state-derived dependency re-ran this effect on every response and caused a request storm.
  const asked = useRef(new Set<string>());
  const ids = visible.filter((c) => c.ended_at).map((c) => c.call_id).join(",");
  useEffect(() => {
    const todo = ids.split(",").filter((id) => id && !asked.current.has(id));
    todo.forEach((id) => asked.current.add(id));
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const id = todo[i++];
        try { const t = await get<GwEvent[]>(`/dashboard/calls/${id}/timeline`); setCounts((p) => ({ ...p, [id]: handled(t) })); }
        catch { asked.current.delete(id); }
      }
    };
    for (let k = 0; k < 4; k++) void worker();
  }, [ids]);

  const setCall = (id: string | null) => router.replace(id ? `${pathname}?call=${encodeURIComponent(id)}` : pathname, { scroll: false });
  const selected = all.find((c) => c.call_id === callId) ?? null;

  const cols: Column<CallRow>[] = [
    { key: "c", header: "Customer", cell: (c) => <span className="font-medium">{customerName(c.customer_ref)}</span> },
    { key: "s", header: "Started", cell: (c) => <><span>{relTime(c.started_at)}</span><span className="block text-xs text-bank-muted">{istTime(c.started_at)} IST</span></> },
    { key: "l", header: "Language", cell: (c) => langLabel(c.language), className: "hidden md:table-cell" },
    { key: "t", header: "Tier", cell: (c) => `Tier ${c.tier}`, className: "hidden md:table-cell" },
    { key: "o", header: "Outcome", cell: (c) => <OutcomeBadge outcome={c.outcome} /> },
    { key: "r", header: "Requests", align: "right", num: true, cell: (c) => (counts[c.call_id] ?? "–"), className: "hidden sm:table-cell" },
    { key: "f", header: "Security flags", align: "right", num: true, cell: (c) => (c.blocked_count ? <StatusBadge tone="danger">{c.blocked_count}</StatusBadge> : "0") },
  ];

  return (
    <>
      <FilterBar search={{ value: q, onChange: setQ, placeholder: "Search customer" }}
        filters={[
          { label: "Language", value: lang, onChange: setLang, options: opts(all.map((c) => c.language), langLabel) },
          { label: "Outcome", value: outcome, onChange: setOutcome, options: opts(all.map((c) => c.outcome ?? "in_progress"), (v) => outcomeLabel(v === "in_progress" ? null : v)) },
          { label: "Verification tier", value: tier, onChange: setTier, options: opts(all.map((c) => String(c.tier)), (v) => `Tier ${v}`) },
        ]} />
      {calls.error ? <ErrorState message={calls.error} onRetry={calls.reload} /> : (
        <>
          <DataTable caption="Borrower calls" columns={cols} rows={visible} rowKey={(c) => c.call_id} loading={calls.loading}
            selectedKey={callId} onRowClick={(c) => setCall(c.call_id)}
            empty={<EmptyState title={all.length ? "No calls match these filters" : "No calls yet"} description={all.length ? "Clear the search or a filter to see more." : "Calls appear here as borrowers phone in."} />} />
          {rows.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="b-pressable min-h-10 cursor-pointer rounded-md border border-bank-line-strong px-4 text-sm font-medium hover:bg-bank-sunken">
              Show more ({num(rows.length - shown)} left)
            </button>
          )}
          {all.length >= 100 && <p className="text-xs text-bank-muted">Showing the latest 100 calls from the gateway.</p>}
        </>
      )}
      <DetailDrawer open={!!callId} onClose={() => setCall(null)} title={customerName(selected?.customer_ref)} subtitle={selected ? `${istTime(selected.started_at)} IST` : "Call details"}>
        {callId && <CallDetail id={callId} call={selected} loadingCall={calls.loading} />}
      </DetailDrawer>
    </>
  );
}

function CallDetail({ id, call, loadingCall }: { id: string; call: CallRow | null; loadingCall: boolean }) {
  const tl = useGet<GwEvent[]>(`/dashboard/calls/${id}/timeline`, call?.ended_at === undefined || call?.ended_at === null ? 5000 : 0);
  const events = tl.data ?? [];
  return (
    <div className="space-y-6">
      {call ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {[["Language", langLabel(call.language)], ["Verification", `Tier ${call.tier}`], ["Outcome", outcomeLabel(call.outcome)],
            ["Ended", call.ended_at ? istTime(call.ended_at) : "Still live"], ["Requests handled", num(handled(events))], ["Security flags", String(call.blocked_count)]].map(([k, v]) => (
            <div key={k}><dt className="text-xs text-bank-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
          ))}
        </dl>
      ) : !loadingCall && <p className="text-sm text-bank-muted">This call is not in the latest 100; showing its timeline only.</p>}
      <section aria-labelledby="tl">
        <h3 id="tl" className="b-title mb-3 text-lg">Timeline</h3>
        {tl.error ? <ErrorState message={tl.error} onRetry={tl.reload} />
          : tl.loading ? <div className="skeleton h-32 rounded-lg" aria-label="Loading" />
          : events.length === 0 ? <EmptyState title="No events recorded" description="This call has no audit entries." />
          : (
            <ol className="relative ml-2 border-l border-bank-line-strong">
              {events.map((e) => {
                const sec = e.type === "security" || e.outcome === "blocked";
                const tone = sec ? "danger" : e.outcome === "error" ? "warn" : "ok";
                return (
                  <li key={e.id} className="relative pb-5 pl-5 last:pb-0">
                    <span aria-hidden className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bank-surface ${sec ? "bg-bank-danger-fg" : e.outcome === "error" ? "bg-bank-warn-fg" : "bg-bank-ok-fg"}`} />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{(e.action ?? e.type).replace(/_/g, " ")}</span>
                      <StatusBadge tone={tone}>{sec ? "Blocked" : e.outcome === "error" ? "Error" : "OK"}</StatusBadge>
                      {e.latency_ms != null && <span className="b-num text-xs text-bank-muted">{Math.round(e.latency_ms)} ms</span>}
                    </div>
                    <div className="text-xs text-bank-muted">{istTime(e.ts)}{e.tier != null && ` · Tier ${e.tier}`}</div>
                    {e.detail && <p className="mt-0.5 text-sm">{e.detail}</p>}
                  </li>
                );
              })}
            </ol>
          )}
      </section>
    </div>
  );
}
