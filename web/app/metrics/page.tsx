"use client";
import { Metrics, useGet } from "@/lib/api";
import { Card, Empty, ErrorBox, Icon, Pill, Shell, Skeleton, StatTile } from "@/components/ui";

const TARGET_P95 = 50;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const h2 = "mb-3 text-xl font-medium";
const th = "px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted";

function NotMeasured({ why }: { why: string }) {
  return (
    <p className="flex items-start gap-3 rounded-lg border border-dashed border-line px-4 py-4 text-sm text-muted">
      <Icon name="clock" size={18} /><span><strong className="font-medium text-fg">Not measured yet.</strong> {why}</span>
    </p>
  );
}

export default function MetricsPage() {
  const { data: m, error, loading } = useGet<Metrics>("/dashboard/metrics", 10000);
  const t = m?.totals;
  const tiles: [string, string | number][] = t ? [
    ["Calls", t.calls], ["Task completion", pct(t.task_completion_rate)], ["Handover rate", pct(t.handover_rate)],
    ["Secrets detected", t.secrets_detected], ["Blocked", t.blocked],
  ] : [];
  const maxStt = Math.max(1, ...(m?.stt_benchmark?.rows.flatMap((r) => [r.with_keyterms, r.without_keyterms]) ?? [1]));

  return (
    <Shell title="Metrics" sub="Call outcomes and gateway latency against the p95 < 50 ms target.">
      <ErrorBox error={error} />
      {!m ? (loading ? <Skeleton rows={4} /> : <Empty>No metrics available yet. They appear after the first call.</Empty>) : (
        <div className="space-y-10">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {tiles.map(([k, v], i) => <StatTile key={k} value={v} caption={k} accent={i === 1} />)}
          </div>

          <section aria-labelledby="pa">
            <h2 id="pa" className={h2}>Gateway latency per action <span className="text-base text-muted">(target p95 &lt; {TARGET_P95} ms)</span></h2>
            {!m.per_action.length ? <Empty>No actions recorded yet.</Empty> : (
              <Card as="div" className="relative overflow-x-auto">
                <table className="num w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-line bg-sunken"><tr>
                    {["Action", "Count", "p50 ms", "p95 ms", "p99 ms", "Errors", "p95 target"].map((h) => <th key={h} className={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {m.per_action.map((a) => {
                      const pass = a.p95 < TARGET_P95;
                      return (
                        <tr key={a.action} className="border-t border-line first:border-t-0">
                          <td className="px-3 py-2 font-medium">{a.action}</td><td className="px-3 py-2">{a.count}</td>
                          <td className="px-3 py-2">{a.p50}</td><td className="px-3 py-2 font-semibold">{a.p95}</td><td className="px-3 py-2">{a.p99}</td>
                          <td className="px-3 py-2">{a.errors}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-2">
                              <Pill tone={pass ? "ok" : "danger"} icon={pass ? "check" : "x"}>{pass ? "PASS" : "FAIL"}</Pill>
                              <svg role="img" aria-label={`p95 ${a.p95} ms of ${TARGET_P95} ms target`} width="96" height="6">
                                <rect width="96" height="6" rx="3" fill="var(--sunken)" stroke="var(--line)" strokeWidth="0.5" />
                                <rect width={Math.min(96, (a.p95 / (TARGET_P95 * 2)) * 96)} height="6" rx="3" fill={pass ? "var(--ok-fg)" : "var(--danger-line)"} />
                                <rect x="47.5" width="1.5" height="6" fill="var(--fg)" />
                              </svg>
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

          <section aria-labelledby="e2">
            <h2 id="e2" className={h2}>End-to-end latency</h2>
            {m.e2e_latency ? (
              <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
                <StatTile value={m.e2e_latency.p50} caption="p50 ms" />
                <StatTile value={m.e2e_latency.p95} caption="p95 ms" />
                <StatTile value={m.e2e_latency.n} caption="samples" />
              </div>
            ) : <NotMeasured why="End-to-end timing needs a live voice call through the agent; run one to populate it." />}
          </section>

          <section aria-labelledby="lt">
            <h2 id="lt" className={h2}>Load test</h2>
            {m.loadtest ? (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(m.loadtest).map(([k, v]) => (
                  <Card as="div" key={k} className="p-3 text-sm">
                    <dt className="text-xs text-muted">{k}</dt><dd className="num break-words font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                  </Card>
                ))}
              </dl>
            ) : <NotMeasured why="Run the gateway load test to record concurrency and latency results here." />}
          </section>

          <section aria-labelledby="sb">
            <h2 id="sb" className={h2}>STT benchmark (accuracy by entity)</h2>
            {m.stt_benchmark?.rows.length ? (
              <Card as="div" className="relative overflow-x-auto">
                <table className="num w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-line bg-sunken"><tr>
                    <th className={th}>Entity</th><th className={th}>With keyterms</th><th className={th}>Without keyterms</th><th className={th}>n</th>
                  </tr></thead>
                  <tbody>
                    {m.stt_benchmark.rows.map((r) => (
                      <tr key={r.entity} className="border-t border-line first:border-t-0">
                        <td className="px-3 py-2 font-medium">{r.entity}</td>
                        <td className="px-3 py-2">{r.with_keyterms}
                          <svg aria-hidden width="80" height="6" className="ml-2 inline-block"><rect width={(r.with_keyterms / maxStt) * 80} height="6" rx="3" fill="var(--fg)" /></svg></td>
                        <td className="px-3 py-2">{r.without_keyterms}
                          <svg aria-hidden width="80" height="6" className="ml-2 inline-block"><rect width={(r.without_keyterms / maxStt) * 80} height="6" rx="3" fill="var(--muted)" /></svg></td>
                        <td className="px-3 py-2">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : <NotMeasured why="The speech-to-text benchmark has not been run against Gnani Prisma yet." />}
          </section>
        </div>
      )}
    </Shell>
  );
}
