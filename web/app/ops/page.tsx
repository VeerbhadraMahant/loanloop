"use client";
import { useCallback, useState } from "react";
import { langLabel } from "@/lib/languages";
import { CallRow, GwEvent, Handover, useEvents, useGet } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Icon, Pill, Shell, Skeleton, fmtTime, stagger } from "@/components/ui";

const tierLabel = ["Tier 0 · info", "Tier 1 · verified", "Tier 2 · approval"];
const tierTone = ["neutral", "neutral", "accent"] as const;

function OutcomePill({ outcome }: { outcome: string }) {
  if (outcome === "ok") return <Pill tone="ok" icon="check">ok</Pill>;
  if (outcome === "blocked") return <Pill tone="warn" icon="shield">blocked</Pill>;
  return <Pill tone="danger" icon="x">{outcome}</Pill>;
}

function LivePill({ live }: { live: boolean }) {
  return (
    <span role="status" className={`inline-flex min-h-8 items-center gap-2 rounded-full border border-line px-3 text-sm ${live ? "bg-ok-bg text-ok-fg" : "bg-warn-bg text-warn-fg"}`}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "pulse bg-ok-fg" : "bg-warn-fg"}`} />
      Live stream: {live ? "connected" : "disconnected"}
    </span>
  );
}

const h2 = "mb-3 text-xl font-medium";
const th = "px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted";

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
    <Shell title="Ops console" sub="Live calls, handovers and blocked requests." status={<LivePill live={live} />}>
      <ErrorBox error={err} />
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="lc" className="min-w-0">
          <h2 id="lc" className={h2}>Calls</h2>
          {calls.loading ? <Skeleton rows={4} /> : !calls.data?.length ? <Empty>No calls yet. Run the call simulator to see activity here.</Empty> : (
            <Card as="div" className="relative overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-line bg-sunken"><tr>
                  <th className={th}>Customer</th><th className={th}>Lang</th><th className={th}>Tier</th>
                  <th className={th}>Current action</th><th className={th}>Blocked</th><th className={th}><span className="sr-only">Select</span></th>
                </tr></thead>
                <tbody>
                  {calls.data.map((c, i) => (
                    <tr key={c.call_id} style={stagger(i)} className={`enter border-t border-line first:border-t-0 ${sel === c.call_id ? "bg-sunken" : ""}`}>
                      <td className="px-3 py-2">{c.customer_ref}{c.ended_at && <span className="ml-1 text-xs text-muted">(ended)</span>}</td>
                      <td className="px-3 py-2">{langLabel(c.language)}</td>
                      <td className="px-3 py-2"><Pill tone={tierTone[c.tier] ?? "neutral"}>{tierLabel[c.tier] ?? `Tier ${c.tier}`}</Pill></td>
                      <td className="px-3 py-2">{c.current_action ?? "-"}</td>
                      <td className="num px-3 py-2">{c.blocked_count > 0 ? <Pill tone="warn" icon="shield">{c.blocked_count}</Pill> : 0}</td>
                      <td className="px-3 py-1">
                        <Button variant="secondary" small aria-pressed={sel === c.call_id} onClick={() => setSel(c.call_id)}>Timeline</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        <section aria-labelledby="tl" className="min-w-0">
          <h2 id="tl" className={h2}>Call timeline</h2>
          {!sel ? <Empty icon="clock">Select a call to see its timeline.</Empty>
            : timeline.error ? <ErrorBox error={timeline.error} />
            : timeline.loading ? <Skeleton rows={4} />
            : !timeline.data?.length ? <Empty>No events for this call.</Empty> : (
            <Card as="div" className="p-2">
              <ol className="space-y-1 text-sm">
                {timeline.data.map((e, i) => (
                  <li key={e.id} style={stagger(i)} className={`enter flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 ${e.type === "security" ? "border-l-4 border-danger-line bg-danger-bg text-danger-fg" : ""}`}>
                    <span className="num text-xs text-muted">{fmtTime(e.ts)}</span>
                    <span className="flex items-center gap-1 font-medium">
                      {e.type === "security" && <Icon name="alert" size={14} />}{e.type === "security" ? "SECURITY" : e.action ?? e.type}
                    </span>
                    {e.latency_ms != null && <span className="num text-muted">{e.latency_ms} ms</span>}
                    {e.outcome && <OutcomePill outcome={e.outcome} />}
                    {e.error_code && <code className="text-xs">{e.error_code}</code>}
                    {e.detail && <span className="text-muted">{e.detail}</span>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </section>

        <section aria-labelledby="hq" className="min-w-0">
          <h2 id="hq" className={h2}>Handover queue</h2>
          {handovers.loading ? <Skeleton rows={3} /> : !handovers.data?.length ? <Empty>No handovers. Calls the agent cannot finish will queue here.</Empty> : (
            <ul className="space-y-3">
              {handovers.data.map((h, i) => (
                <Card as="li" key={h.id} style={stagger(i)} className="enter p-4 text-sm">
                  <p className="font-medium">{h.customer_ref} <span className="num font-normal text-muted">· {fmtTime(h.created_at)}</span></p>
                  <p className="mt-1"><strong className="font-medium">Reason:</strong> {h.reason}</p>
                  <p className="my-1 text-muted">{h.summary}</p>
                  <p><strong className="font-medium">Done:</strong> {h.requests_done.join(", ") || "none"}</p>
                  <p><strong className="font-medium">Pending:</strong> {h.requests_pending.join(", ") || "none"}</p>
                </Card>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="av" className="min-w-0 rounded-lg border-2 border-danger-line bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="av" className="flex items-center gap-2 text-xl font-medium"><Icon name="shield" size={20} />Attack view</h2>
            {!!security.data?.length && <Pill tone="danger" icon="alert">{security.data.length} blocked</Pill>}
          </div>
          {security.loading ? <Skeleton rows={3} /> : !security.data?.length ? <Empty icon="shield">No blocked requests. Attempts to extract secrets or skip approval show up here.</Empty> : (
            <ul className="space-y-2 text-sm">
              {security.data.map((e, i) => (
                <li key={e.id} style={stagger(i)} className="enter rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <Icon name="alert" size={14} />
                    <strong className="font-semibold">{e.error_code ?? e.type}</strong>
                    {e.action && <span>on {e.action}</span>}
                    {e.customer_ref && <span>for {e.customer_ref}</span>}
                    <span className="num text-xs opacity-80">{fmtTime(e.ts)}</span>
                  </p>
                  {e.detail && <p className="mt-0.5">{e.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
