"use client";
import { useState } from "react";
import { Metrics, useGet } from "@/lib/api";
import { Card, Empty, ErrorBox, Icon, Pill, Shell, Skeleton, StatTile } from "@/components/ui";

const TARGET_P95 = 50;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const h2 = "serif text-xl font-semibold text-fg mb-3";
const th = "px-3.5 py-2.5 text-xs font-mono font-medium uppercase tracking-wider text-muted";

function NotMeasured({ why }: { why: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-line bg-card/60 p-4 text-xs text-muted">
      <Icon name="clock" size={16} />
      <span>
        <strong className="font-semibold text-fg">Not measured yet.</strong> {why}
      </span>
    </div>
  );
}

function LoadTestCard({
  label,
  value,
  copiedKey,
  onCopy,
}: {
  label: string;
  value: unknown;
  copiedKey: string | null;
  onCopy: (val: string, key: string) => void;
}) {
  const isCopied = copiedKey === label;
  const rawString = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  const isSimple =
    typeof value === "number" || (typeof value === "string" && value.length < 16 && !value.includes("{"));

  return (
    <Card className="p-3.5 flex flex-col justify-between min-w-0 overflow-hidden h-44 shadow-xs">
      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-line shrink-0">
        <dt className="text-xs font-mono font-semibold uppercase tracking-wider text-muted truncate" title={label}>
          {label.replace(/_/g, " ")}
        </dt>
        <button
          type="button"
          onClick={() => onCopy(rawString, label)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer shrink-0 border ${
            isCopied
              ? "bg-ok-bg text-ok-fg border-ok-border"
              : "bg-sunken hover:bg-surface-variant text-primary border-line"
          }`}
          title="Copy value to clipboard"
        >
          <Icon name={isCopied ? "check" : "inbox"} size={12} />
          <span>{isCopied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <dd className="flex-1 min-h-0 overflow-y-auto rounded-lg bg-surface-container-low p-2 border border-line text-xs font-mono text-fg break-all">
        {isSimple ? (
          <div className="h-full flex items-center">
            <span className="serif num text-xl sm:text-2xl font-bold text-fg">
              {typeof value === "number" && label === "rps" ? Number(value).toFixed(1) : String(value)}
            </span>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
            {rawString}
          </pre>
        )}
      </dd>
    </Card>
  );
}

export default function MetricsPage() {
  const { data: m, error, loading } = useGet<Metrics>("/dashboard/metrics", 10000);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (val: string, key: string) => {
    try {
      navigator.clipboard?.writeText(val);
    } catch {
      // clipboard access fallback
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const t = m?.totals;
  const tiles: [string, string | number][] = t
    ? [
        ["Total Calls", t.calls],
        ["Task Completion", pct(t.task_completion_rate)],
        ["Handover Rate", pct(t.handover_rate)],
        ["Secrets Detected", t.secrets_detected],
        ["Blocked Requests", t.blocked],
      ]
    : [];
  const maxStt = Math.max(
    1,
    ...(m?.stt_benchmark?.rows.flatMap((r) => [r.with_keyterms, r.without_keyterms]) ?? [1])
  );

  return (
    <Shell
      title="Metrics &amp; SLA Architecture Proof"
      sub="Deterministic gateway latency benchmarks, p95 SLA targets (< 50 ms), and load test telemetry."
    >
      <ErrorBox error={error} />
      {!m ? (
        loading ? (
          <Skeleton rows={4} />
        ) : (
          <Empty>No metrics available yet. They appear after the first call.</Empty>
        )
      ) : (
        <div className="space-y-8">
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {tiles.map(([k, v], i) => (
              <StatTile key={k} value={v} caption={k} accent={i === 1} />
            ))}
          </div>

          {/* Gateway Latency per Action */}
          <section aria-labelledby="pa">
            <div className="flex items-center justify-between mb-3">
              <h2 id="pa" className={h2}>
                Gateway Latency Per Action{" "}
                <span className="text-sm font-sans text-muted font-normal">
                  (Target p95 &lt; {TARGET_P95} ms)
                </span>
              </h2>
              <span className="text-xs font-mono text-muted">
                Measured at the gateway
              </span>
            </div>

            {!m.per_action.length ? (
              <Empty>No actions recorded yet.</Empty>
            ) : (
              <Card className="overflow-x-auto">
                <table className="num w-full min-w-[680px] text-left text-xs">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      {["Action", "Count", "p50 ms", "p95 ms", "p99 ms", "Errors", "p95 Target"].map(
                        (h) => (
                          <th key={h} className={th}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {m.per_action.map((a) => {
                      const pass = a.p95 < TARGET_P95;
                      return (
                        <tr key={a.action} className="hover:bg-sunken transition-colors">
                          <td className="px-3.5 py-3 font-semibold text-fg font-mono">{a.action}</td>
                          <td className="px-3.5 py-3 text-muted">{a.count}</td>
                          <td className="px-3.5 py-3 text-fg">{a.p50}</td>
                          <td className="px-3.5 py-3 font-bold text-fg">{a.p95}</td>
                          <td className="px-3.5 py-3 text-muted">{a.p99}</td>
                          <td className="px-3.5 py-3 text-muted">{a.errors}</td>
                          <td className="px-3.5 py-3">
                            <span className="inline-flex items-center gap-3">
                              <Pill tone={pass ? "ok" : "danger"} icon={pass ? "check" : "x"}>
                                {pass ? "PASS" : "FAIL"}
                              </Pill>
                              <div className="w-24 h-2 rounded-full bg-sunken overflow-hidden border border-line relative">
                                <div
                                  className={`h-full rounded-full ${pass ? "bg-ok-fg" : "bg-danger-fg"}`}
                                  style={{
                                    width: `${Math.min(100, (a.p95 / (TARGET_P95 * 1.5)) * 100)}%`,
                                  }}
                                />
                                <div
                                  className="absolute top-0 bottom-0 w-0.5 bg-fg"
                                  style={{ left: `${(TARGET_P95 / (TARGET_P95 * 1.5)) * 100}%` }}
                                  title={`Target ${TARGET_P95}ms`}
                                />
                              </div>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          {/* End-to-End Latency */}
          <section aria-labelledby="e2">
            <h2 id="e2" className={h2}>
              End-to-End Turn Latency
            </h2>
            {m.e2e_latency ? (
              <div className="grid grid-cols-3 gap-4 sm:max-w-xl">
                <StatTile value={`${m.e2e_latency.p50} ms`} caption="p50 Turn Latency" />
                <StatTile value={`${m.e2e_latency.p95} ms`} caption="p95 Turn Latency" />
                <StatTile value={m.e2e_latency.n} caption="Completed Samples" />
              </div>
            ) : (
              <NotMeasured why="End-to-end timing needs a live voice call through the agent; run one to populate it." />
            )}
          </section>

          {/* Load Test Results */}
          <section aria-labelledby="lt">
            <div className="flex items-center justify-between mb-3">
              <h2 id="lt" className={h2}>
                Locust Gateway Concurrency Load Test Proof
              </h2>
              <span className="text-xs font-mono text-muted">
                Values as recorded by the load test
              </span>
            </div>
            {m.loadtest ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                {Object.entries(m.loadtest).map(([k, v]) => (
                  <LoadTestCard
                    key={k}
                    label={k}
                    value={v}
                    copiedKey={copiedKey}
                    onCopy={copyText}
                  />
                ))}
              </dl>
            ) : (
              <NotMeasured why="Run the gateway load test (e.g. `locust`) to record concurrency and latency results here." />
            )}
          </section>

          {/* STT Benchmark */}
          <section aria-labelledby="sb">
            <h2 id="sb" className={h2}>
              STT Entity Accuracy Benchmark
            </h2>
            {m.stt_benchmark?.rows.length ? (
              <Card className="overflow-x-auto">
                <table className="num w-full min-w-[500px] text-left text-xs">
                  <thead className="border-b border-line bg-sunken">
                    <tr>
                      <th className={th}>Entity</th>
                      <th className={th}>With Keyterms</th>
                      <th className={th}>Without Keyterms</th>
                      <th className={th}>Sample Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {m.stt_benchmark.rows.map((r) => (
                      <tr key={r.entity} className="hover:bg-sunken transition-colors">
                        <td className="px-3.5 py-3 font-semibold text-fg">{r.entity}</td>
                        <td className="px-3.5 py-3">
                          <span className="font-bold text-fg mr-2">{r.with_keyterms}%</span>
                          <div className="inline-block w-20 h-1.5 rounded-full bg-sunken overflow-hidden align-middle">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${(r.with_keyterms / maxStt) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3.5 py-3">
                          <span className="text-muted mr-2">{r.without_keyterms}%</span>
                          <div className="inline-block w-20 h-1.5 rounded-full bg-sunken overflow-hidden align-middle">
                            <div
                              className="h-full bg-muted rounded-full"
                              style={{ width: `${(r.without_keyterms / maxStt) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3.5 py-3 text-muted">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : (
              <NotMeasured why="The speech-to-text benchmark has not been run against the STT engine yet." />
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
