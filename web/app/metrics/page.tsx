"use client";
import { useState } from "react";
import { Metrics, useGet } from "@/lib/api";
import { Card, Empty, ErrorBox, Icon, Pill, Shell, Skeleton, StatTile } from "@/components/ui";

const TARGET_P95 = 50;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const th = "px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted";

function NotMeasured({ label, why }: { label: string; why: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-line bg-card px-3.5 py-2.5 text-xs text-muted">
      <Icon name="clock" size={14} className="mt-0.5 shrink-0" />
      <span>
        <strong className="font-semibold text-fg">{label}: Not measured yet.</strong> {why}
      </span>
    </div>
  );
}

function CopyButton({
  value,
  itemKey,
  copiedKey,
  onCopy,
}: {
  value: string;
  itemKey: string;
  copiedKey: string | null;
  onCopy: (val: string, key: string) => void;
}) {
  const isCopied = copiedKey === itemKey;
  return (
    <button
      type="button"
      onClick={() => onCopy(value, itemKey)}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-medium transition-colors cursor-pointer border ${
        isCopied
          ? "bg-ok-bg text-ok-fg border-ok-border"
          : "bg-sunken hover:bg-surface-variant text-fg border-line"
      }`}
      title="Copy value to clipboard"
    >
      <Icon name={isCopied ? "check" : "copy"} size={11} />
      <span>{isCopied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export default function MetricsPage() {
  const { data: m, error, loading } = useGet<Metrics>("/dashboard/metrics", 10000);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (val: string, key: string) => {
    try {
      navigator.clipboard?.writeText(val);
    } catch {
      /* clipboard blocked */
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const t = m?.totals;
  const actions = m?.per_action ?? [];
  const failing = actions.filter((a) => a.p95 >= TARGET_P95);
  const withErrors = actions.filter((a) => a.errors > 0);
  const sortedActions = [...actions].sort((a, b) => {
    const aFail = a.p95 >= TARGET_P95 ? 2 : a.errors > 0 ? 1 : 0;
    const bFail = b.p95 >= TARGET_P95 ? 2 : b.errors > 0 ? 1 : 0;
    if (aFail !== bFail) return bFail - aFail;
    return b.p95 - a.p95;
  });

  const maxStt = Math.max(
    1,
    ...(m?.stt_benchmark?.rows.flatMap((r) => [r.with_keyterms, r.without_keyterms]) ?? [1])
  );

  const loadEntries = m?.loadtest ? Object.entries(m.loadtest) : [];
  const scalarLoad = loadEntries.filter(
    ([, v]) => typeof v !== "object" || v === null
  );
  const nestedLoad = loadEntries.filter(
    ([, v]) => typeof v === "object" && v !== null
  );

  return (
    <Shell
      title="Metrics &amp; SLA"
      sub={`Gateway latency benchmarks (p95 target < ${TARGET_P95} ms), error counts, and load test telemetry.`}
    >
      <ErrorBox error={error} />
      {!m ? (
        loading ? (
          <Skeleton rows={4} />
        ) : (
          <Empty>No metrics available yet. They appear after the first call.</Empty>
        )
      ) : (
        <div className="space-y-6">
          {/* Failure-First SLA Alert Summary */}
          {(failing.length > 0 || withErrors.length > 0) && (
            <div
              role="status"
              className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-xs text-danger-fg"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <Icon name="alert" size={15} />
                  <span>
                    {failing.length > 0
                      ? `${failing.length} gateway action${failing.length === 1 ? "" : "s"} breaching p95 SLA (< ${TARGET_P95} ms)`
                      : "Gateway action errors detected"}
                  </span>
                </div>
                <span className="font-mono text-[11px]">
                  {failing.length}/{actions.length} SLA FAIL · {withErrors.length} with errors
                </span>
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                {failing.map((a) => (
                  <li key={`f-${a.action}`}>
                    <strong>{a.action}</strong>: p95 {a.p95} ms (+{(a.p95 - TARGET_P95).toFixed(1)} ms over target)
                  </li>
                ))}
                {withErrors.map((a) => (
                  <li key={`e-${a.action}`}>
                    <strong>{a.action}</strong>: {a.errors} error{a.errors === 1 ? "" : "s"} ({a.count} calls)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Compact Headline KPIs — Breaches & Failures Emphasized Over Vanity Completion */}
          {t && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile
                value={`${failing.length} / ${actions.length}`}
                caption="p95 SLA Breaches"
                tone={failing.length > 0 ? "danger" : "ok"}
              />
              <StatTile
                value={actions.reduce((s, a) => s + a.errors, 0)}
                caption="Action Errors"
                tone={withErrors.length > 0 ? "warn" : "neutral"}
              />
              <StatTile value={t.calls} caption="Total Calls" />
              <StatTile value={pct(t.task_completion_rate)} caption="Task Completion" />
              <StatTile value={pct(t.handover_rate)} caption="Handover Rate" />
              <StatTile
                value={`${t.secrets_detected} / ${t.blocked}`}
                caption="Secrets / Blocked"
                tone={t.secrets_detected > 0 || t.blocked > 0 ? "warn" : "neutral"}
              />
            </div>
          )}

          {/* Gateway Latency Per Action (Sorted Failing & Error Rows First) */}
          <section aria-labelledby="pa">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="pa" className="text-sm font-semibold text-fg">
                Gateway Latency Per Action{" "}
                <span className="font-normal text-muted">
                  (Target p95 &lt; {TARGET_P95} ms · failing rows first)
                </span>
              </h2>
              <span className="font-mono text-[11px] text-muted">
                {actions.length} actions measured at gateway
              </span>
            </div>

            {!sortedActions.length ? (
              <Empty>No actions recorded yet.</Empty>
            ) : (
              <Card className="overflow-hidden">
                <div className="max-h-[460px] overflow-auto">
                  <table className="num w-full min-w-[680px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-line bg-sunken">
                      <tr>
                        {["Action", "Status", "Count", "p50 ms", "p95 ms", "p99 ms", "Errors", `vs ${TARGET_P95} ms Target`].map(
                          (h) => (
                            <th key={h} className={th}>
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {sortedActions.map((a) => {
                        const pass = a.p95 < TARGET_P95;
                        const rowTint = !pass
                          ? "bg-danger-bg/45 hover:bg-danger-bg/70"
                          : a.errors > 0
                          ? "bg-warn-bg/35 hover:bg-warn-bg/60"
                          : "hover:bg-sunken/70";
                        return (
                          <tr key={a.action} className={`${rowTint} transition-colors`}>
                            <td className="px-3 py-2 font-mono font-semibold text-fg">
                              {a.action}
                            </td>
                            <td className="px-3 py-2">
                              <Pill tone={pass ? "ok" : "danger"} icon={pass ? "check" : "x"}>
                                {pass ? "PASS" : "FAIL"}
                              </Pill>
                            </td>
                            <td className="px-3 py-2 text-muted">{a.count}</td>
                            <td className="px-3 py-2 text-fg">{a.p50}</td>
                            <td className={`px-3 py-2 font-bold ${pass ? "text-fg" : "text-danger-fg"}`}>
                              {a.p95}
                            </td>
                            <td className="px-3 py-2 text-muted">{a.p99}</td>
                            <td className={`px-3 py-2 font-medium ${a.errors > 0 ? "text-warn-fg" : "text-muted"}`}>
                              {a.errors}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2.5">
                                <div className="relative h-2 w-28 overflow-hidden rounded-sm border border-line bg-sunken">
                                  <div
                                    className={`h-full ${pass ? "bg-ok-fg" : "bg-danger-fg"}`}
                                    style={{
                                      width: `${Math.min(100, (a.p95 / (TARGET_P95 * 2)) * 100)}%`,
                                    }}
                                  />
                                  <div
                                    className="absolute bottom-0 top-0 w-0.5 bg-fg"
                                    style={{ left: `${(TARGET_P95 / (TARGET_P95 * 2)) * 100}%` }}
                                    title={`Target ${TARGET_P95} ms`}
                                  />
                                </div>
                                <span className={`font-mono text-[11px] ${pass ? "text-muted" : "font-semibold text-danger-fg"}`}>
                                  {pass
                                    ? `-${(TARGET_P95 - a.p95).toFixed(1)} ms`
                                    : `+${(a.p95 - TARGET_P95).toFixed(1)} ms`}
                                </span>
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

          {/* End-to-End Turn Latency */}
          <section aria-labelledby="e2">
            <h2 id="e2" className="mb-2 text-sm font-semibold text-fg">
              End-to-End Turn Latency
            </h2>
            {m.e2e_latency ? (
              <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
                <StatTile value={`${m.e2e_latency.p50} ms`} caption="p50 Turn Latency" />
                <StatTile value={`${m.e2e_latency.p95} ms`} caption="p95 Turn Latency" />
                <StatTile value={m.e2e_latency.n} caption="Completed Samples" />
              </div>
            ) : (
              <NotMeasured
                label="End-to-End Turn Latency"
                why="Needs a live voice call through the agent to populate."
              />
            )}
          </section>

          {/* Load Test Results */}
          <section aria-labelledby="lt">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="lt" className="text-sm font-semibold text-fg">
                Locust Gateway Concurrency Load Test
              </h2>
              <span className="font-mono text-[11px] text-muted">
                Values as recorded by the load test
              </span>
            </div>
            {m.loadtest ? (
              <div className="space-y-3">
                {scalarLoad.length > 0 && (
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {scalarLoad.map(([k, v]) => {
                      const raw = String(v);
                      const display =
                        typeof v === "number" && k === "rps" ? Number(v).toFixed(1) : raw;
                      return (
                        <div
                          key={k}
                          className="flex flex-col justify-between rounded-lg border border-line bg-card px-3 py-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <dt className="truncate font-mono text-[11px] uppercase tracking-wider text-muted">
                              {k.replace(/_/g, " ")}
                            </dt>
                            <CopyButton
                              value={raw}
                              itemKey={k}
                              copiedKey={copiedKey}
                              onCopy={copyText}
                            />
                          </div>
                          <dd className="num mt-1 truncate text-sm font-semibold text-fg" title={display}>
                            {display}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}

                {nestedLoad.length > 0 && (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {nestedLoad.map(([k, v]) => {
                      const rawString = JSON.stringify(v, null, 2);
                      return (
                        <details
                          key={k}
                          className="rounded-lg border border-line bg-card p-3 text-xs"
                          open={k === "overall"}
                        >
                          <summary className="flex cursor-pointer items-center justify-between gap-2 font-mono font-semibold uppercase tracking-wider text-fg">
                            <span>{k.replace(/_/g, " ")}</span>
                            <span onClick={(e) => e.preventDefault()}>
                              <CopyButton
                                value={rawString}
                                itemKey={k}
                                copiedKey={copiedKey}
                                onCopy={copyText}
                              />
                            </span>
                          </summary>
                          <pre className="mt-2 max-h-52 overflow-auto rounded-md border border-line bg-sunken p-2.5 font-mono text-[11px] leading-relaxed text-fg">
                            {rawString}
                          </pre>
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <NotMeasured
                label="Concurrency Load Test"
                why="Run the gateway load test (e.g. `locust`) to record concurrency and latency results."
              />
            )}
          </section>

          {/* STT Benchmark */}
          <section aria-labelledby="sb">
            <h2 id="sb" className="mb-2 text-sm font-semibold text-fg">
              STT Entity Accuracy Benchmark
            </h2>
            {m.stt_benchmark?.rows.length ? (
              <Card className="overflow-x-auto">
                <table className="num w-full min-w-[500px] border-collapse text-left text-xs">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      <th className={th}>Entity</th>
                      <th className={th}>With Keyterms</th>
                      <th className={th}>Without Keyterms</th>
                      <th className={th}>Samples</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {m.stt_benchmark.rows.map((r) => (
                      <tr key={r.entity} className="hover:bg-sunken/70 transition-colors">
                        <td className="px-3 py-2 font-semibold text-fg">{r.entity}</td>
                        <td className="px-3 py-2">
                          <span className="mr-2 font-semibold text-fg">{r.with_keyterms}%</span>
                          <div className="inline-block h-1.5 w-20 overflow-hidden rounded-sm bg-sunken align-middle">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${(r.with_keyterms / maxStt) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="mr-2 text-muted">{r.without_keyterms}%</span>
                          <div className="inline-block h-1.5 w-20 overflow-hidden rounded-sm bg-sunken align-middle">
                            <div
                              className="h-full bg-muted"
                              style={{ width: `${(r.without_keyterms / maxStt) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : (
              <NotMeasured
                label="STT Entity Benchmark"
                why="The speech-to-text benchmark has not been run against the STT engine yet."
              />
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
