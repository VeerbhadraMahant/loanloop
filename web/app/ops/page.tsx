"use client";
import { useCallback, useState } from "react";
import { CallRow, GwEvent, Handover, useEvents, useGet } from "@/lib/api";
import { Empty, ErrorBox, Shell, fmtTime } from "@/components/ui";

const outcomeCls: Record<string, string> = {
  ok: "text-green-800",
  error: "text-red-800 font-semibold",
  blocked: "text-orange-800 font-semibold",
};
const tierCls = ["bg-slate-200 text-slate-900", "bg-blue-200 text-blue-950", "bg-green-200 text-green-950"];

export default function Ops() {
  const calls = useGet<CallRow[]>("/dashboard/calls", 5000);
  const handovers = useGet<Handover[]>("/dashboard/handovers", 5000);
  const security = useGet<GwEvent[]>("/dashboard/security", 5000);
  const [sel, setSel] = useState<string | null>(null);
  const timeline = useGet<GwEvent[]>(sel ? `/dashboard/calls/${encodeURIComponent(sel)}/timeline` : null, 0);

  const { reload: rc } = calls, { reload: rh } = handovers, { reload: rs } = security, { reload: rt } = timeline;
  const onEvent = useCallback((e: GwEvent) => {
    rc();
    if (e.type === "handover") rh();
    if (e.type === "security" || e.outcome === "blocked" || e.type === "approval") rs();
    if (e.call_id === sel) rt();
  }, [rc, rh, rs, rt, sel]);
  const live = useEvents(onEvent);
  const err = calls.error ?? handovers.error ?? security.error;

  return (
    <Shell title="Ops console" wide>
      <p className="mb-3 text-sm" role="status">
        Live stream: <strong className={live ? "text-green-800" : "text-red-800"}>{live ? "connected" : "disconnected"}</strong>
      </p>
      <ErrorBox error={err} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="lc">
          <h2 id="lc" className="mb-2 text-lg font-semibold">Calls</h2>
          {!calls.data?.length ? <Empty>No calls yet.</Empty> : (
            <div className="overflow-x-auto rounded border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100"><tr>
                  <th className="p-2">Customer</th><th className="p-2">Lang</th><th className="p-2">Tier</th>
                  <th className="p-2">Current action</th><th className="p-2">Blocked</th><th className="p-2"><span className="sr-only">Select</span></th>
                </tr></thead>
                <tbody>
                  {calls.data.map((c) => (
                    <tr key={c.call_id} className={`border-t ${sel === c.call_id ? "bg-blue-50" : ""}`}>
                      <td className="p-2">{c.customer_ref}{c.ended_at && <span className="ml-1 text-xs text-slate-600">(ended)</span>}</td>
                      <td className="p-2">{c.language}</td>
                      <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-bold ${tierCls[c.tier] ?? tierCls[0]}`}>Tier {c.tier}</span></td>
                      <td className="p-2">{c.current_action ?? "-"}</td>
                      <td className="p-2">{c.blocked_count > 0 ? <strong className="text-orange-800">{c.blocked_count}</strong> : 0}</td>
                      <td className="p-2">
                        <button onClick={() => setSel(c.call_id)} aria-pressed={sel === c.call_id}
                          className="rounded border border-blue-800 px-2 py-0.5 text-blue-900 hover:bg-blue-100">Timeline</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="tl">
          <h2 id="tl" className="mb-2 text-lg font-semibold">Call timeline</h2>
          {!sel ? <Empty>Select a call to see its timeline.</Empty>
            : timeline.error ? <ErrorBox error={timeline.error} />
            : !timeline.data?.length ? <Empty>No events for this call.</Empty> : (
            <ol className="space-y-1 rounded border bg-white p-2 text-sm">
              {timeline.data.map((e) => (
                <li key={e.id} className={`flex flex-wrap gap-x-3 rounded px-2 py-1 ${e.type === "security" ? "border-l-4 border-orange-600 bg-orange-50" : ""}`}>
                  <span className="text-xs text-slate-600">{fmtTime(e.ts)}</span>
                  <span className="font-medium">{e.type === "security" ? "SECURITY" : e.action ?? e.type}</span>
                  {e.latency_ms != null && <span>{e.latency_ms} ms</span>}
                  {e.outcome && <span className={outcomeCls[e.outcome]}>{e.outcome}</span>}
                  {e.error_code && <code className="text-xs">{e.error_code}</code>}
                  {e.detail && <span className="text-slate-700">{e.detail}</span>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="hq">
          <h2 id="hq" className="mb-2 text-lg font-semibold">Handover queue</h2>
          {!handovers.data?.length ? <Empty>No handovers.</Empty> : (
            <ul className="space-y-3">
              {handovers.data.map((h) => (
                <li key={h.id} className="rounded border bg-white p-3 text-sm">
                  <p className="font-medium">{h.customer_ref} <span className="font-normal text-slate-600">· {fmtTime(h.created_at)}</span></p>
                  <p><strong>Reason:</strong> {h.reason}</p>
                  <p className="my-1">{h.summary}</p>
                  <p><strong>Done:</strong> {h.requests_done.join(", ") || "none"}</p>
                  <p><strong>Pending:</strong> {h.requests_pending.join(", ") || "none"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="av" className="rounded border-2 border-orange-600 bg-white p-3">
          <h2 id="av" className="mb-2 text-lg font-semibold">Attack view</h2>
          {!security.data?.length ? <Empty>No blocked requests.</Empty> : (
            <ul className="space-y-2 text-sm">
              {security.data.map((e) => (
                <li key={e.id} className="border-b pb-1 last:border-0">
                  <span className="text-xs text-slate-600">{fmtTime(e.ts)}</span>{" "}
                  <strong className="text-orange-900">{e.error_code ?? e.type}</strong>{" "}
                  {e.action && <span>on {e.action}</span>}{" "}
                  {e.customer_ref && <span>for {e.customer_ref}</span>}
                  {e.detail && <p className="text-slate-700">{e.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
