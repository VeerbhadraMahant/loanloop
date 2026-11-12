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

// gateway caps these lists at 100 rows, so show "100+" rather than a misleading exact count
const cap = (n: number) => (n >= 100 ? "100+" : String(n));

const th = "px-3.5 py-2.5 text-xs font-mono font-medium uppercase tracking-wider text-muted";

export default function Ops() {
  const calls = useGet<CallRow[]>("/dashboard/calls", 5000);
  const handovers = useGet<Handover[]>("/dashboard/handovers", 5000);
  const security = useGet<GwEvent[]>("/dashboard/security", 5000);
  const [sel, setSel] = useState<string | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [filter, setFilter] = useState<"all" | "attention" | "verified" | "outbound">("all");
  const [hubTab, setHubTab] = useState<"all" | "handovers" | "threats">("all");
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
  const attentionCount = callList.filter((c) => c.blocked_count > 0 || !c.ended_at).length;

  const filteredCalls = callList.filter((c) => {
    if (filter === "attention") return c.blocked_count > 0 || !c.ended_at;
    if (filter === "verified") return c.tier >= 1;
    if (filter === "outbound") return c.customer_ref?.toLowerCase().includes("outbound");
    return true;
  });

  const selectedCall = callList.find((c) => c.call_id === sel);

  return (
    <Shell
      title="Live Operations"
      status={
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-sunken border border-line">
            <button
              type="button"
              onClick={() => setDensity("comfortable")}
              className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
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
              className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
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

      {/* Quick Filter Strip (Clean & Compact) */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            filter === "all"
              ? "bg-primary text-primary-fg shadow-xs font-semibold"
              : "bg-card text-muted hover:text-fg border border-line"
          }`}
        >
          All ({cap(callList.length)})
        </button>
        <button
          type="button"
          onClick={() => setFilter("attention")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            filter === "attention"
              ? "bg-warn-bg text-warn-fg border border-warn-border font-semibold shadow-xs"
              : "bg-card text-muted hover:text-fg border border-line"
          }`}
        >
          Needs attention ({attentionCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter("verified")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            filter === "verified"
              ? "bg-secondary-container text-primary border border-primary/20 font-semibold shadow-xs"
              : "bg-card text-muted hover:text-fg border border-line"
          }`}
        >
          Verified only
        </button>
        <button
          type="button"
          onClick={() => setFilter("outbound")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            filter === "outbound"
              ? "bg-secondary-container text-primary border border-primary/20 font-semibold shadow-xs"
              : "bg-card text-muted hover:text-fg border border-line"
          }`}
        >
          Outbound
        </button>
      </div>

      {/* 3 Streamlined KPI Cards (Zero Extra Footers) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card
          className="p-4 flex flex-col justify-between hover:border-primary/40 transition-all cursor-pointer shadow-xs"
          onClick={() => setFilter("all")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-mono font-medium">
              Active Calls
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-ok-bg text-ok-fg font-semibold flex items-center gap-1 border border-ok-border">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-fg animate-pulse"></span>
              {activeCount} live
            </span>
          </div>
          <div className="mt-2">
            <span className="font-mono text-3xl font-bold text-fg">{activeCount}</span>
          </div>
        </Card>

        <Card
          className="p-4 flex flex-col justify-between hover:border-warn-border transition-all cursor-pointer shadow-xs"
          onClick={() => setHubTab("handovers")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-mono font-medium">
              Pending Handover
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-warn-bg text-warn-fg border border-warn-border">
              Queue
            </span>
          </div>
          <div className="mt-2">
            <span className="font-mono text-3xl font-bold text-warn-fg">{cap(handoverCount)}</span>
          </div>
        </Card>

        <Card
          className="p-4 flex flex-col justify-between hover:border-danger-line transition-all cursor-pointer shadow-xs"
          onClick={() => setHubTab("threats")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted font-mono font-medium">
              Threats Blocked
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-danger-bg text-danger-fg border border-danger-line">
              Blocked
            </span>
          </div>
          <div className="mt-2">
            <span className="font-mono text-3xl font-bold text-danger-fg">{threatCount}</span>
          </div>
        </Card>
      </div>

      {/* SECTION 1: Active Sessions Table (Full Width - Clean & Uncluttered) */}
      <section aria-labelledby="lc" className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h2 id="lc" className="serif text-xl font-semibold text-fg flex items-center gap-2">
              <Icon name="phone_in_talk" size={20} className="text-primary" />
              <span>Active Sessions</span>
            </h2>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-sunken text-muted border border-line">
              {filteredCalls.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-ok-fg animate-pulse"></span>
            <span>{activeCount} live</span>
          </div>
        </div>

        {calls.loading ? (
          <Skeleton rows={4} />
        ) : !filteredCalls.length ? (
          <Empty>No calls matching filter.</Empty>
        ) : (
          <Card className="overflow-hidden shadow-xs">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[680px]">
                <thead className="border-b border-line bg-sunken">
                  <tr>
                    <th className={th}>Customer</th>
                    <th className={th}>Language</th>
                    <th className={th}>Auth Tier</th>
                    <th className={th}>Current Action</th>
                    <th className={th}>Security</th>
                    <th className={th}>Started</th>
                    <th className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredCalls.map((c, i) => {
                    const isSel = sel === c.call_id;
                    const py = density === "compact" ? "py-2" : "py-3";
                    const inCall = !c.ended_at;
                    return (
                      <tr
                        key={c.call_id}
                        style={stagger(i)}
                        onClick={() => setSel(c.call_id)}
                        className={`enter transition-colors cursor-pointer ${
                          isSel
                            ? "bg-secondary-container/50 border-l-4 border-primary font-medium"
                            : "hover:bg-sunken/60"
                        }`}
                      >
                        <td className={`px-3.5 ${py}`}>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                inCall ? "bg-ok-fg animate-pulse" : "bg-muted opacity-50"
                              }`}
                            ></span>
                            <div className="font-semibold text-fg flex items-center gap-1.5">
                              <span>{c.customer_ref || "Caller"}</span>
                              {c.ended_at && (
                                <span className="text-[10px] font-mono text-muted uppercase px-1 py-0.2 rounded bg-sunken border border-line">
                                  ended
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={`px-3.5 ${py} text-xs`}>
                          <span className="px-2 py-0.5 rounded bg-sunken border border-line text-fg font-medium">
                            {langLabel(c.language)}
                          </span>
                        </td>
                        <td className={`px-3.5 ${py}`}>
                          <Pill tone={tierTone[c.tier] ?? "neutral"}>
                            {tierLabel[c.tier] ?? `Tier ${c.tier}`}
                          </Pill>
                        </td>
                        <td className={`px-3.5 ${py}`}>
                          {c.current_action ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs bg-sunken border border-line text-fg font-medium">
                              <Icon name="tune" size={11} className="text-primary" />
                              {c.current_action}
                            </span>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className={`px-3.5 ${py}`}>
                          {c.blocked_count > 0 ? (
                            <Pill tone="warn" icon="shield">
                              {c.blocked_count} blocked
                            </Pill>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-ok-fg font-mono font-medium">
                              <Icon name="check" size={12} />
                              Pass
                            </span>
                          )}
                        </td>
                        <td className={`px-3.5 ${py} font-mono text-xs text-muted`}>
                          {c.started_at ? fmtTime(c.started_at) : "—"}
                        </td>
                        <td className={`px-3.5 ${py} text-right`}>
                          <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant={isSel ? "primary" : "secondary"}
                              small
                              aria-pressed={isSel}
                              onClick={() => setSel(c.call_id)}
                              className="text-xs"
                            >
                              <Icon name="clock" size={12} />
                              <span>{isSel ? "Active" : "Timeline"}</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* SECTION 2: Balanced Lower Grid (Timeline + Escalations) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Call Timeline */}
        <section aria-labelledby="tl" className="lg:col-span-7 flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 id="tl" className="serif text-xl font-semibold text-fg flex items-center gap-2">
                <Icon name="clock" size={20} className="text-primary" />
                <span>Call Timeline</span>
              </h2>
              {selectedCall && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-secondary-container text-primary font-semibold border border-primary/20">
                  {selectedCall.customer_ref || "Active Session"}
                </span>
              )}
            </div>
            {sel && (
              <button
                type="button"
                onClick={() => setSel(null)}
                className="text-xs font-mono text-muted hover:text-fg underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {!sel ? (
            <Card className="p-8 text-center flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-sunken flex items-center justify-center text-muted mb-2">
                <Icon name="clock" size={20} />
              </div>
              <p className="text-xs text-muted">Select a call to inspect timeline</p>
            </Card>
          ) : timeline.error ? (
            <ErrorBox error={timeline.error} />
          ) : timeline.loading ? (
            <Skeleton rows={4} />
          ) : !timeline.data?.length ? (
            <Empty>No telemetry events logged.</Empty>
          ) : (
            <Card className="p-4 max-h-[520px] overflow-y-auto shadow-xs">
              <ol className="relative border-l border-line ml-3 space-y-3.5">
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
                        className={`p-3 rounded-xl border text-sm transition-all ${
                          isSec
                            ? "bg-danger-bg border-danger-line text-danger-fg shadow-xs"
                            : "bg-surface-container-low border-line text-fg"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs font-mono">
                              {isSec ? "SECURITY INCIDENT" : e.action ?? e.type}
                            </span>
                            {e.outcome && <OutcomePill outcome={e.outcome} />}
                            {e.latency_ms != null && (
                              <span className="font-mono text-xs text-muted px-1.5 py-0.5 rounded bg-sunken border border-line">
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
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}
        </section>

        {/* Right Column (5 cols): Escalation & Security Hub */}
        <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
          {/* Header & Tabs */}
          <div className="flex items-center justify-between">
            <h2 className="serif text-xl font-semibold text-fg flex items-center gap-2">
              <Icon name="shield" size={20} className="text-primary" />
              <span>Escalations &amp; Security</span>
            </h2>
            <div className="inline-flex items-center p-0.5 rounded-lg bg-sunken border border-line text-xs font-mono">
              <button
                type="button"
                onClick={() => setHubTab("all")}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  hubTab === "all"
                    ? "bg-card text-fg font-bold shadow-xs border border-line"
                    : "text-muted hover:text-fg"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setHubTab("handovers")}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  hubTab === "handovers"
                    ? "bg-card text-warn-fg font-bold shadow-xs border border-line"
                    : "text-muted hover:text-fg"
                }`}
              >
                Handovers ({cap(handoverCount)})
              </button>
              <button
                type="button"
                onClick={() => setHubTab("threats")}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  hubTab === "threats"
                    ? "bg-card text-danger-fg font-bold shadow-xs border border-line"
                    : "text-muted hover:text-fg"
                }`}
              >
                Threats ({threatCount})
              </button>
            </div>
          </div>

          {/* Handover Queue */}
          {(hubTab === "all" || hubTab === "handovers") && (
            <section aria-labelledby="hq" className="min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5">
                  <Icon name="support_agent" size={14} className="text-warn-fg" />
                  <span>Handover Queue</span>
                </span>
                {handoverCount > 0 && (
                  <Pill tone="warn" icon="clock">
                    {cap(handoverCount)} waiting
                  </Pill>
                )}
              </div>

              {handovers.loading ? (
                <Skeleton rows={3} />
              ) : !handovers.data?.length ? (
                <Card className="p-3.5 text-center text-xs text-muted">
                  No pending handovers
                </Card>
              ) : (
                <ul className="space-y-3">
                  {handovers.data.map((h, i) => (
                    <Card
                      as="li"
                      key={h.id}
                      style={stagger(i)}
                      className="enter p-3.5 text-sm border-l-4 border-warn-border shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-semibold text-fg">{h.customer_ref}</span>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-warn-bg text-warn-fg border border-warn-border font-medium">
                            {h.reason}
                          </span>
                          <span className="font-mono text-xs text-muted">{fmtTime(h.created_at)}</span>
                        </div>
                      </div>
                      <Button small disabled title="Demo: live takeover is not wired up" className="w-full font-semibold text-xs justify-center mt-1">
                        <Icon name="support_agent" size={14} />
                        <span>Take Over Call</span>
                      </Button>
                    </Card>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Attack View */}
          {(hubTab === "all" || hubTab === "threats") && (
            <section
              aria-labelledby="av"
              className="min-w-0 rounded-xl border border-danger-line bg-card p-3.5 shadow-xs"
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="font-mono text-xs uppercase tracking-wider text-danger-fg font-semibold flex items-center gap-1.5">
                  <Icon name="shield" size={15} />
                  <span>Attack View</span>
                </span>
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
                  No security threats
                </Empty>
              ) : (
                <ul className="space-y-2 text-sm">
                  {security.data.map((e, i) => (
                    <li
                      key={e.id}
                      style={stagger(i)}
                      className="enter rounded-lg bg-danger-bg p-2.5 text-danger-fg border border-danger-line/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-mono font-bold text-xs">
                          {e.error_code ?? e.type}
                        </span>
                        <span className="font-mono text-[11px] opacity-80">{fmtTime(e.ts)}</span>
                      </div>
                      {(e.action || e.customer_ref) && (
                        <p className="text-xs mt-1 text-danger-fg/80">
                          {e.action && <span>Target: {e.action}</span>}
                          {e.action && e.customer_ref && <span> · </span>}
                          {e.customer_ref && <span>Caller: {e.customer_ref}</span>}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}
