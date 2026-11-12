"use client";
import { Fragment, useCallback, useState } from "react";
import Link from "next/link";
import { langLabel } from "@/lib/languages";
import { CallRow, GwEvent, Handover, useEvents, useGet } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Icon, Pill, Shell, Skeleton, fmtTime, stagger } from "@/components/ui";

const tierLabel = ["Tier 0 · Info", "Tier 1 · Verified", "Tier 2 · Approval"];
const tierTone = ["neutral", "neutral", "accent"] as const;

const ACTION_LABELS: Record<string, string> = {
  start_call: "Call started",
  end_call: "Call ended",
  handover: "Agent handover",
  emi_info: "EMI inquiry",
  branch_lookup: "Branch lookup",
  check_payment: "Payment check",
  check_approval: "Approval check",
  confirm_readback: "Readback confirmed",
  emi_date_change: "EMI date change",
  explain_emi_change: "EMI change explained",
  report_secret_spoken: "Secret detected",
};

function humanAction(action?: string | null): string {
  if (!action) return "—";
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function shortCallId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;
}

function callDurationLabel(startedAt?: string | null, endedAt?: string | null): string {
  if (!startedAt) return "—";
  if (!endedAt) return "Active";
  const a = new Date(startedAt).getTime();
  const b = new Date(endedAt).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return "—";
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function OutcomePill({ outcome }: { outcome: string }) {
  if (outcome === "ok") return <Pill tone="ok" icon="check">ok</Pill>;
  if (outcome === "blocked") return <Pill tone="warn" icon="shield">blocked</Pill>;
  return <Pill tone="danger" icon="x">{outcome}</Pill>;
}

function LivePill({ live }: { live: boolean }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium ${
        live
          ? "bg-ok-bg text-ok-fg border-ok-border"
          : "bg-warn-bg text-warn-fg border-warn-border"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${live ? "pulse bg-ok-fg" : "bg-warn-fg"}`} />
      Live stream: {live ? "connected" : "disconnected"}
    </span>
  );
}

// gateway caps these lists at 100 rows, so show "100+" rather than a misleading exact count
const cap = (n: number) => (n >= 100 ? "100+" : String(n));

const th = "px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted";

export default function Ops() {
  const calls = useGet<CallRow[]>("/dashboard/calls", 5000);
  const handovers = useGet<Handover[]>("/dashboard/handovers", 5000);
  const security = useGet<GwEvent[]>("/dashboard/security", 5000);
  const [sel, setSel] = useState<string | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">("compact");
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

  const liveOrAttention = filteredCalls.filter((c) => !c.ended_at || c.blocked_count > 0);
  const completedRows = filteredCalls.filter((c) => c.ended_at && c.blocked_count === 0);
  const sessionGroups = [
    { label: "Live & Needs Attention", rows: liveOrAttention },
    { label: "Completed", rows: completedRows },
  ].filter((g) => g.rows.length > 0);

  const selectedCall = callList.find((c) => c.call_id === sel);

  return (
    <Shell
      title="Live Operations"
      sub="Real-time call stream, session timeline, handover queue, and guardrail incidents."
      status={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-line bg-sunken p-0.5">
            <button
              type="button"
              onClick={() => setDensity("compact")}
              aria-pressed={density === "compact"}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                density === "compact"
                  ? "bg-card text-fg border border-line"
                  : "text-muted hover:text-fg"
              }`}
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => setDensity("comfortable")}
              aria-pressed={density === "comfortable"}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                density === "comfortable"
                  ? "bg-card text-fg border border-line"
                  : "text-muted hover:text-fg"
              }`}
            >
              Comfortable
            </button>
          </div>
          <LivePill live={live} />
        </div>
      }
    >
      <ErrorBox error={err} />

      {/* Quick Filter Strip */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border ${
              filter === "all"
                ? "bg-primary text-primary-fg border-primary"
                : "bg-card text-muted hover:text-fg border-line"
            }`}
          >
            All ({cap(callList.length)})
          </button>
          <button
            type="button"
            onClick={() => setFilter("attention")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border ${
              filter === "attention"
                ? "bg-warn-bg text-warn-fg border-warn-border font-semibold"
                : "bg-card text-muted hover:text-fg border-line"
            }`}
          >
            Needs attention ({attentionCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("verified")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border ${
              filter === "verified"
                ? "bg-secondary-container text-accent-ink border-primary/25 font-semibold"
                : "bg-card text-muted hover:text-fg border-line"
            }`}
          >
            Verified only
          </button>
          <button
            type="button"
            onClick={() => setFilter("outbound")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border ${
              filter === "outbound"
                ? "bg-secondary-container text-accent-ink border-primary/25 font-semibold"
                : "bg-card text-muted hover:text-fg border-line"
            }`}
          >
            Outbound
          </button>
        </div>
      </div>

      {/* Streamlined Operational Counters */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card
          className="cursor-pointer border-l-[3px] border-l-ok-fg px-3.5 py-2.5 transition-colors hover:bg-sunken/50"
          onClick={() => setFilter("all")}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Active Calls
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ok-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-ok-fg pulse" />
              {activeCount} live
            </span>
          </div>
          <div className="num mt-1 text-2xl font-semibold text-fg">{activeCount}</div>
        </Card>

        <Card
          className="cursor-pointer border-l-[3px] border-l-warn-fg px-3.5 py-2.5 transition-colors hover:bg-sunken/50"
          onClick={() => setHubTab("handovers")}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Pending Handover
            </span>
            <Pill tone="warn">Queue</Pill>
          </div>
          <div className="num mt-1 text-2xl font-semibold text-warn-fg">{cap(handoverCount)}</div>
        </Card>

        <Card
          className="cursor-pointer border-l-[3px] border-l-danger-fg px-3.5 py-2.5 transition-colors hover:bg-sunken/50"
          onClick={() => setHubTab("threats")}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Threats Blocked
            </span>
            <Pill tone="danger">Blocked</Pill>
          </div>
          <div className="num mt-1 text-2xl font-semibold text-danger-fg">{threatCount}</div>
        </Card>
      </div>

      {/* SECTION 1: Grouped Sessions Table */}
      <section aria-labelledby="lc" className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 id="lc" className="text-sm font-semibold text-fg">
              Sessions
            </h2>
            <span className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {filteredCalls.length}
            </span>
          </div>
          <span className="font-mono text-[11px] text-muted">
            Click a row to inspect timeline &amp; raw action IDs
          </span>
        </div>

        {calls.loading ? (
          <Skeleton rows={4} />
        ) : !filteredCalls.length ? (
          <Empty>No calls matching filter.</Empty>
        ) : (
          <Card className="overflow-hidden">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-line bg-sunken">
                  <tr>
                    <th className={th}>Session / Caller</th>
                    <th className={th}>Language</th>
                    <th className={th}>Auth Tier</th>
                    <th className={th}>Current State</th>
                    <th className={th}>Security</th>
                    <th className={th}>Duration</th>
                    <th className={th}>Started</th>
                    <th className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sessionGroups.map((group) => (
                    <Fragment key={group.label}>
                      {sessionGroups.length > 1 && (
                        <tr className="bg-surface-container-low">
                          <td
                            colSpan={8}
                            className="px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted"
                          >
                            {group.label} ({group.rows.length})
                          </td>
                        </tr>
                      )}
                      {group.rows.map((c, i) => {
                        const isSel = sel === c.call_id;
                        const py = density === "compact" ? "py-1.5" : "py-2.5";
                        const inCall = !c.ended_at;
                        const label = c.customer_ref || "Unidentified caller";
                        return (
                          <tr
                            key={c.call_id}
                            style={stagger(i)}
                            onClick={() => setSel(c.call_id)}
                            className={`enter cursor-pointer transition-colors ${
                              isSel
                                ? "bg-secondary-container/70 font-medium"
                                : "hover:bg-sunken/70"
                            }`}
                          >
                            <td className={`px-3 ${py}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${
                                    inCall ? "bg-ok-fg pulse" : "bg-outline-variant"
                                  }`}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate font-medium text-fg">{label}</span>
                                    {c.ended_at && (
                                      <span className="rounded border border-line bg-sunken px-1 font-mono text-[10px] text-muted">
                                        ended
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-mono text-[10px] text-muted" title={c.call_id}>
                                    {shortCallId(c.call_id)}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className={`px-3 ${py}`}>
                              <span className="text-fg">{langLabel(c.language)}</span>
                            </td>
                            <td className={`px-3 ${py}`}>
                              <Pill tone={tierTone[c.tier] ?? "neutral"}>
                                {tierLabel[c.tier] ?? `Tier ${c.tier}`}
                              </Pill>
                            </td>
                            <td className={`px-3 ${py}`}>
                              <span
                                className="text-fg"
                                title={c.current_action ? `Raw action: ${c.current_action}` : undefined}
                              >
                                {humanAction(c.current_action)}
                              </span>
                            </td>
                            <td className={`px-3 ${py}`}>
                              {c.blocked_count > 0 ? (
                                <Pill tone="warn" icon="shield">
                                  {c.blocked_count} blocked
                                </Pill>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ok-fg">
                                  <Icon name="check" size={12} />
                                  Pass
                                </span>
                              )}
                            </td>
                            <td className={`px-3 ${py} num text-muted`}>
                              {callDurationLabel(c.started_at, c.ended_at)}
                            </td>
                            <td className={`px-3 ${py} num text-muted`}>
                              {c.started_at ? fmtTime(c.started_at) : "—"}
                            </td>
                            <td className={`px-3 ${py} text-right`}>
                              <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant={isSel ? "primary" : "secondary"}
                                  small
                                  aria-pressed={isSel}
                                  onClick={() => setSel(c.call_id)}
                                >
                                  <Icon name="clock" size={12} />
                                  <span>{isSel ? "Selected" : "Timeline"}</span>
                                </Button>
                                <Link
                                  href={`/call/${encodeURIComponent((c.customer_ref || "priya").toLowerCase())}`}
                                  className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md border border-line bg-card text-primary hover:bg-sunken transition-colors"
                                  title={`Open Calling Desk for ${c.customer_ref || "caller"}`}
                                  aria-label={`Open Calling Desk for ${c.customer_ref || "caller"}`}
                                >
                                  <Icon name="phone" size={13} />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* SECTION 2: Balanced Lower Grid (Timeline + Escalations) */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Left Column (7 cols): Call Timeline & Raw Action Inspector */}
        <section aria-labelledby="tl" className="lg:col-span-7 flex min-w-0 flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 id="tl" className="text-sm font-semibold text-fg">
                Call Timeline
              </h2>
              {selectedCall && (
                <span className="truncate rounded border border-primary/25 bg-secondary-container px-2 py-0.5 font-mono text-[11px] font-medium text-accent-ink">
                  {selectedCall.customer_ref || shortCallId(selectedCall.call_id)}
                </span>
              )}
            </div>
            {sel && (
              <button
                type="button"
                onClick={() => setSel(null)}
                className="font-mono text-xs text-muted hover:text-fg underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {!sel ? (
            <Card className="p-6 text-center text-xs text-muted">
              Select a session row above to inspect step-by-step events, latencies, and raw action IDs.
            </Card>
          ) : timeline.error ? (
            <ErrorBox error={timeline.error} />
          ) : timeline.loading ? (
            <Skeleton rows={4} />
          ) : !timeline.data?.length ? (
            <Empty>No telemetry events logged.</Empty>
          ) : (
            <Card className="max-h-[480px] overflow-y-auto p-3.5">
              {selectedCall && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 font-mono text-[11px] text-muted">
                  <span>ID: {selectedCall.call_id}</span>
                  <span>
                    Raw current_action: <strong className="text-fg">{selectedCall.current_action ?? "none"}</strong>
                  </span>
                </div>
              )}
              <ol className="relative ml-2.5 space-y-2.5 border-l border-line">
                {timeline.data.map((e, i) => {
                  const isSec = e.type === "security";
                  const rawCode = e.action ?? e.type;
                  const titleText = isSec ? "SECURITY INCIDENT" : humanAction(rawCode);
                  return (
                    <li key={e.id} style={stagger(i)} className="enter relative ml-4">
                      <span
                        className={`absolute -left-[21px] top-2 h-2 w-2 rounded-full ring-4 ring-card ${
                          isSec ? "bg-danger-fg" : "bg-primary"
                        }`}
                      />

                      <div
                        className={`rounded-md border p-2.5 text-xs ${
                          isSec
                            ? "border-danger-line bg-danger-bg text-danger-fg"
                            : "border-line bg-surface-container-low text-fg"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{titleText}</span>
                            <code className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted">
                              {rawCode}
                            </code>
                            {e.outcome && <OutcomePill outcome={e.outcome} />}
                            {e.latency_ms != null && (
                              <span className="num rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-muted">
                                {e.latency_ms} ms
                              </span>
                            )}
                          </div>
                          <span className="num text-[11px] text-muted">{fmtTime(e.ts)}</span>
                        </div>

                        {e.error_code && (
                          <p className="mt-1 font-mono text-[11px] font-semibold">
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
        <div className="lg:col-span-5 flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">
              Escalations &amp; Security
            </h2>
            <div className="inline-flex items-center rounded-md border border-line bg-sunken p-0.5 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setHubTab("all")}
                className={`rounded px-2 py-0.5 transition-colors cursor-pointer ${
                  hubTab === "all"
                    ? "bg-card text-fg font-semibold border border-line"
                    : "text-muted hover:text-fg"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setHubTab("handovers")}
                className={`rounded px-2 py-0.5 transition-colors cursor-pointer ${
                  hubTab === "handovers"
                    ? "bg-card text-warn-fg font-semibold border border-line"
                    : "text-muted hover:text-fg"
                }`}
              >
                Handovers ({cap(handoverCount)})
              </button>
              <button
                type="button"
                onClick={() => setHubTab("threats")}
                className={`rounded px-2 py-0.5 transition-colors cursor-pointer ${
                  hubTab === "threats"
                    ? "bg-card text-danger-fg font-semibold border border-line"
                    : "text-muted hover:text-fg"
                }`}
              >
                Threats ({threatCount})
              </button>
            </div>
          </div>

          {(hubTab === "all" || hubTab === "handovers") && (
            <section aria-labelledby="hq" className="min-w-0 space-y-2">
              <div className="flex items-center justify-between">
                <span id="hq" className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Handover Queue
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
                <Empty icon="support_agent">No pending handovers</Empty>
              ) : (
                <ul className="space-y-2">
                  {handovers.data.map((h, i) => (
                    <Card
                      as="li"
                      key={h.id}
                      style={stagger(i)}
                      className="enter border-l-[3px] border-l-warn-fg p-3 text-xs"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-semibold text-fg">
                          {h.customer_ref || shortCallId(h.call_id)}
                        </span>
                        <div className="flex items-center gap-2">
                          <Pill tone="warn">{h.reason}</Pill>
                          <span className="num text-[11px] text-muted">{fmtTime(h.created_at)}</span>
                        </div>
                      </div>
                      <Button
                        small
                        disabled
                        title="Demo: live takeover is not wired up"
                        className="w-full justify-center font-medium"
                      >
                        <Icon name="support_agent" size={13} />
                        <span>Take Over Call</span>
                      </Button>
                    </Card>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(hubTab === "all" || hubTab === "threats") && (
            <section aria-labelledby="av" className="min-w-0 space-y-2">
              <div className="flex items-center justify-between">
                <span id="av" className="text-[11px] font-semibold uppercase tracking-wider text-danger-fg">
                  Attack View
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
                <Empty icon="shield">No security threats</Empty>
              ) : (
                <ul className="space-y-2 text-xs">
                  {security.data.map((e, i) => (
                    <li
                      key={e.id}
                      style={stagger(i)}
                      className="enter rounded-lg border border-danger-line bg-danger-bg p-2.5 text-danger-fg"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-mono font-semibold">
                          {e.error_code ?? e.type}
                        </span>
                        <span className="num text-[11px] opacity-80">{fmtTime(e.ts)}</span>
                      </div>
                      {(e.action || e.customer_ref) && (
                        <p className="mt-1 text-[11px] opacity-90">
                          {e.action && (
                            <span>
                              Target: {humanAction(e.action)}{" "}
                              <code className="font-mono opacity-80">({e.action})</code>
                            </span>
                          )}
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
