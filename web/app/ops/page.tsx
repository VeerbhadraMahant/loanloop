"use client";
import { useCallback, useState } from "react";
import { langLabel } from "@/lib/languages";
import { CallRow, GwEvent, Handover, useEvents, useGet } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Icon, Pill, Shell, Skeleton, fmtTime, stagger } from "@/components/ui";

const tierLabel = ["Tier 0 · Info", "Tier 1 · Verified", "Tier 2 · Approval"];
const tierTone = ["neutral", "neutral", "accent"] as const;

function OutcomePill({ outcome }: { outcome: string }) {
  if (outcome === "ok") return <Pill tone="ok" icon="check">ok</Pill>;
  if (outcome === "blocked") return <Pill tone="warn" icon="shield">blocked</Pill>;
  return <Pill tone="danger" icon="x">{outcome}</Pill>;
}

function LivePill({ live }: { live: boolean }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono font-medium ${
        live
          ? "bg-ok-bg text-ok-fg border-ok-border"
          : "bg-warn-bg text-warn-fg border-warn-border"
      }`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "pulse bg-ok-fg" : "bg-warn-fg"}`} />
      Live stream: {live ? "connected" : "disconnected"}
    </span>
  );
}

const th = "px-3 py-2.5 text-xs font-mono font-medium uppercase tracking-wider text-muted";

export default function Ops() {
  const calls = useGet<CallRow[]>("/dashboard/calls", 5000);
  const handovers = useGet<Handover[]>("/dashboard/handovers", 5000);
  const security = useGet<GwEvent[]>("/dashboard/security", 5000);
  const [sel, setSel] = useState<string | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [filter, setFilter] = useState<"all" | "attention" | "verified" | "outbound">("all");
  const timeline = useGet<GwEvent[]>(sel ? `/dashboard/calls/${encodeURIComponent(sel)}/timeline` : null, 0);

  const { reload: rc } = calls,
    { reload: rh } = handovers,
    { reload: rs } = security,
    { reload: rt } = timeline;

  const onEvent = useCallback(
    (e: GwEvent) => {
      rc();
      if (e.type === "handover") rh();
      if (e.type === "security" || e.outcome === "blocked" || e.type === "approval") rs();
      if (e.call_id === sel) rt();
    },
    [rc, rh, rs, rt, sel]
  );

  const live = useEvents(onEvent);
  const err = calls.error ?? handovers.error ?? security.error;

  const callList = calls.data ?? [];
  const activeCount = callList.filter((c) => !c.ended_at).length;
  const handoverCount = handovers.data?.length ?? 0;
  const threatCount = security.data?.length ?? 0;

  const filteredCalls = callList.filter((c) => {
    if (filter === "attention") return c.blocked_count > 0 || !c.ended_at;
    if (filter === "verified") return c.tier >= 1;
    if (filter === "outbound") return c.customer_ref?.toLowerCase().includes("outbound");
    return true;
  });

  return (
    <Shell
      title="Live Operations"
      sub="Real-time telemetry, bilateral voice streams and security guardrails."
      status={
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-sunken border border-line">
            <button
              type="button"
              onClick={() => setDensity("comfortable")}
              className={`px-2.5 py-1 rounded text-xs transition-all ${
                density === "comfortable"
                  ? "bg-card text-fg font-medium shadow-xs"
                  : "text-muted hover:text-fg"
              }`}
            >
              Comfortable
            </button>
            <button
              type="button"
              onClick={() => setDensity("compact")}
              className={`px-2.5 py-1 rounded text-xs transition-all ${
                density === "compact"
                  ? "bg-card text-fg font-medium shadow-xs"
                  : "text-muted hover:text-fg"
              }`}
            >
              Compact
            </button>
          </div>
          <LivePill live={live} />
        </div>
      }
    >
      <ErrorBox error={err} />

      {/* Top Banner & Quick Filter Strip */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-fg text-sm">Session Filter:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === "all"
                    ? "bg-primary text-primary-fg shadow-xs"
                    : "bg-sunken text-muted hover:text-fg border border-line"
                }`}
              >
                All calls ({callList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("attention")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === "attention"
                    ? "bg-warn-bg text-warn-fg border border-warn-border"
                    : "bg-sunken text-muted hover:text-fg border border-line"
                }`}
              >
                Needs attention
              </button>
              <button
                type="button"
                onClick={() => setFilter("verified")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === "verified"
                    ? "bg-secondary-container text-primary border border-primary/20"
                    : "bg-sunken text-muted hover:text-fg border border-line"
                }`}
              >
                Verified only
              </button>
              <button
                type="button"
                onClick={() => setFilter("outbound")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === "outbound"
                    ? "bg-secondary-container text-primary border border-primary/20"
                    : "bg-sunken text-muted hover:text-fg border border-line"
                }`}
              >
                Outbound
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-muted">
            <Icon name="tune" size={14} />
            <span>Ingress: Mumbai-01 · Active Gateway</span>
          </div>
        </div>
      </Card>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-mono font-medium">
              Active Calls
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-ok-bg text-ok-fg font-semibold flex items-center gap-1 border border-ok-border">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-fg animate-pulse"></span>
              {activeCount} live
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-fg">{activeCount}</span>
            <span className="font-mono text-xs text-muted">of {callList.length} total sessions</span>
          </div>
          <div className="mt-3 pt-2 border-t border-line flex items-center justify-between text-[11px] font-mono text-muted">
            <span>Bandwidth: 128 kbps</span>
            <span className="text-primary font-medium">Opus / PCM 16kHz</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-mono font-medium">
              Pending Handover
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-warn-bg text-warn-fg border border-warn-border">
              Escort Queue
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-warn-fg">{handoverCount}</span>
            <span className="font-mono text-xs text-muted">agents waiting</span>
          </div>
          <div className="mt-3 pt-2 border-t border-line flex items-center justify-between text-[11px] font-mono text-muted">
            <span>SLA Breach Risk: Low</span>
            <span className="text-warn-fg font-medium">Counselor Ready</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-mono font-medium">
              Threats Blocked
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-danger-bg text-danger-fg border border-danger-line">
              Firewall Active
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-danger-fg">{threatCount}</span>
            <span className="font-mono text-xs text-danger-fg font-medium">security incidents</span>
          </div>
          <div className="mt-3 pt-2 border-t border-line flex items-center justify-between text-[11px] font-mono text-muted">
            <span>Zero Secrets Policy</span>
            <span className="text-primary font-medium">0 Leaks</span>
          </div>
        </Card>
      </div>

      {/* Main Grid: 8 Cols Left (Active Sessions & Timeline), 4 Cols Right (Handover & Alert) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6 min-w-0">
          {/* Active Sessions Table Card */}
          <section aria-labelledby="lc" className="min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 id="lc" className="serif text-xl font-semibold text-fg">Active Sessions</h2>
              <span className="font-mono text-xs text-muted">{filteredCalls.length} sessions listed</span>
            </div>

            {calls.loading ? (
              <Skeleton rows={4} />
            ) : !filteredCalls.length ? (
              <Empty>No calls matching current filter. Run a test case or call to populate.</Empty>
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      <th className={th}>Customer</th>
                      <th className={th}>Lang</th>
                      <th className={th}>Tier</th>
                      <th className={th}>Current Action</th>
                      <th className={th}>Blocked</th>
                      <th className={th}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredCalls.map((c, i) => {
                      const isSel = sel === c.call_id;
                      const py = density === "compact" ? "py-1.5" : "py-3";
                      return (
                        <tr
                          key={c.call_id}
                          style={stagger(i)}
                          onClick={() => setSel(c.call_id)}
                          className={`enter transition-colors cursor-pointer ${
                            isSel ? "bg-accent-soft/40 border-l-4 border-primary" : "hover:bg-sunken"
                          }`}
                        >
                          <td className={`px-3 ${py}`}>
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  c.ended_at ? "bg-muted" : "bg-ok-fg animate-pulse"
                                }`}
                              ></span>
                              <span className="font-medium text-fg">{c.customer_ref}</span>
                              {c.ended_at && (
                                <span className="text-xs text-muted font-mono">(ended)</span>
                              )}
                            </div>
                          </td>
                          <td className={`px-3 ${py} text-xs text-muted`}>
                            {langLabel(c.language)}
                          </td>
                          <td className={`px-3 ${py}`}>
                            <Pill tone={tierTone[c.tier] ?? "neutral"}>
                              {tierLabel[c.tier] ?? `Tier ${c.tier}`}
                            </Pill>
                          </td>
                          <td className={`px-3 ${py}`}>
                            {c.current_action ? (
                              <span className="px-2 py-0.5 rounded font-mono text-xs bg-sunken border border-line text-fg font-medium">
                                {c.current_action}
                              </span>
                            ) : (
                              <span className="text-muted text-xs">—</span>
                            )}
                          </td>
                          <td className={`num px-3 ${py}`}>
                            {c.blocked_count > 0 ? (
                              <Pill tone="warn" icon="shield">
                                {c.blocked_count}
                              </Pill>
                            ) : (
                              <span className="text-xs text-muted">0</span>
                            )}
                          </td>
                          <td className={`px-3 ${py} text-right`}>
                            <Button
                              variant={isSel ? "primary" : "secondary"}
                              small
                              aria-pressed={isSel}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSel(c.call_id);
                              }}
                              className="text-xs"
                            >
                              Timeline
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          {/* Call Timeline Rail */}
          <section aria-labelledby="tl" className="min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 id="tl" className="serif text-xl font-semibold text-fg">Call Timeline</h2>
              {sel && (
                <span className="font-mono text-xs text-muted">
                  Call ID: {sel.slice(0, 8)}…
                </span>
              )}
            </div>

            {!sel ? (
              <Empty icon="clock">Select a call from the table to inspect its event timeline.</Empty>
            ) : timeline.error ? (
              <ErrorBox error={timeline.error} />
            ) : timeline.loading ? (
              <Skeleton rows={4} />
            ) : !timeline.data?.length ? (
              <Empty>No telemetry events logged for this call session yet.</Empty>
            ) : (
              <Card className="p-4">
                <ol className="relative border-l border-line ml-3 space-y-4">
                  {timeline.data.map((e, i) => {
                    const isSec = e.type === "security";
                    return (
                      <li key={e.id} style={stagger(i)} className="enter ml-6 relative">
                        <span
                          className={`absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-card ${
                            isSec ? "bg-danger-fg" : "bg-primary"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-primary-fg" />
                        </span>

                        <div
                          className={`p-3 rounded-xl border text-sm ${
                            isSec
                              ? "bg-danger-bg border-danger-line text-danger-fg"
                              : "bg-surface-container-low border-line text-fg"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs font-mono">
                                {isSec ? "SECURITY INCIDENT" : e.action ?? e.type}
                              </span>
                              {e.outcome && <OutcomePill outcome={e.outcome} />}
                              {e.latency_ms != null && (
                                <span className="font-mono text-xs text-muted">
                                  {e.latency_ms} ms
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-xs text-muted">
                              {fmtTime(e.ts)}
                            </span>
                          </div>

                          {e.error_code && (
                            <p className="font-mono text-xs font-semibold mt-1">
                              Error: {e.error_code}
                            </p>
                          )}
                          {e.detail && <p className="text-xs text-muted mt-0.5">{e.detail}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            )}
          </section>
        </div>

        {/* Right Column (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6 min-w-0">
          {/* Handover Queue */}
          <section aria-labelledby="hq" className="min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 id="hq" className="serif text-xl font-semibold text-fg">Handover Queue</h2>
              {handoverCount > 0 && (
                <Pill tone="warn" icon="clock">
                  {handoverCount} waiting
                </Pill>
              )}
            </div>

            {handovers.loading ? (
              <Skeleton rows={3} />
            ) : !handovers.data?.length ? (
              <Empty>No handovers. Calls the agent cannot finish will queue here for human agents.</Empty>
            ) : (
              <ul className="space-y-3">
                {handovers.data.map((h, i) => (
                  <Card
                    as="li"
                    key={h.id}
                    style={stagger(i)}
                    className="enter p-4 text-sm border-l-4 border-warn-border"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-fg">{h.customer_ref}</span>
                      <span className="font-mono text-xs text-muted">{fmtTime(h.created_at)}</span>
                    </div>
                    <p className="text-xs font-medium text-warn-fg mt-1">
                      <strong>Reason:</strong> {h.reason}
                    </p>
                    <p className="text-xs text-muted my-2 leading-relaxed">{h.summary}</p>
                    <div className="space-y-1 text-xs mb-3">
                      <p>
                        <strong className="text-fg font-medium">Done:</strong>{" "}
                        <span className="text-muted">{h.requests_done.join(", ") || "none"}</span>
                      </p>
                      <p>
                        <strong className="text-fg font-medium">Pending:</strong>{" "}
                        <span className="text-muted">{h.requests_pending.join(", ") || "none"}</span>
                      </p>
                    </div>
                    <Button small className="w-full font-semibold text-xs justify-center">
                      <Icon name="support_agent" size={14} />
                      <span>Take Over Call</span>
                    </Button>
                  </Card>
                ))}
              </ul>
            )}
          </section>

          {/* Attack View */}
          <section
            aria-labelledby="av"
            className="min-w-0 rounded-xl border border-danger-line bg-card p-4 shadow-xs"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="av" className="serif flex items-center gap-2 text-xl font-semibold text-fg">
                <Icon name="shield" size={18} />
                <span>Attack View</span>
              </h2>
              {threatCount > 0 && (
                <Pill tone="danger" icon="alert">
                  {threatCount} blocked
                </Pill>
              )}
            </div>

            {security.loading ? (
              <Skeleton rows={3} />
            ) : !security.data?.length ? (
              <Empty icon="shield">
                No blocked requests. Attempts to extract secrets or skip approval show up here.
              </Empty>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {security.data.map((e, i) => (
                  <li
                    key={e.id}
                    style={stagger(i)}
                    className="enter rounded-lg bg-danger-bg p-3 text-danger-fg border border-danger-line/60"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                      <span className="font-mono font-bold text-xs">
                        {e.error_code ?? e.type}
                      </span>
                      <span className="font-mono text-[11px] opacity-80">{fmtTime(e.ts)}</span>
                    </div>
                    <p className="text-xs">
                      {e.action && <span>Target: {e.action} · </span>}
                      {e.customer_ref && <span>Caller: {e.customer_ref}</span>}
                    </p>
                    {e.detail && <p className="text-xs mt-1 text-danger-fg/90">{e.detail}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}
