"use client";
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

export default function MetricsPage() {
  const { data: m, error, loading } = useGet<Metrics>("/dashboard/metrics", 10000);
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
                FastAPI Async Engine · In-Memory Caching
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
            <h2 id="lt" className={h2}>
              Locust Gateway Concurrency Load Test Proof
            </h2>
            {m.loadtest ? (
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Object.entries(m.loadtest).map(([k, v]) => (
                  <Card key={k} className="p-4">
                    <dt className="text-xs font-mono uppercase text-muted mb-1">{k}</dt>
                    <dd className="num break-words font-bold text-lg text-fg">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </Card>
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
