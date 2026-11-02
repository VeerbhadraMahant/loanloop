"use client";
import { Metrics, useGet } from "@/lib/api";
import { Empty, ErrorBox, Shell } from "@/components/ui";

const TARGET_P95 = 50;
const NM = <span className="text-slate-600">not measured yet</span>;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function MetricsPage() {
  const { data: m, error } = useGet<Metrics>("/dashboard/metrics", 10000);
  const t = m?.totals;
  const tiles: [string, string | number][] = t ? [
    ["Calls", t.calls], ["Task completion", pct(t.task_completion_rate)], ["Handover rate", pct(t.handover_rate)],
    ["Secrets detected", t.secrets_detected], ["Blocked", t.blocked],
  ] : [];
  const maxStt = Math.max(1, ...(m?.stt_benchmark?.rows.flatMap((r) => [r.with_keyterms, r.without_keyterms]) ?? [1]));

  return (
    <Shell title="Metrics" wide>
      <ErrorBox error={error} />
      {!m ? <Empty>No metrics available yet.</Empty> : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {tiles.map(([k, v]) => (
              <div key={k} className="rounded border bg-white p-3">
                <p className="text-xs text-slate-600">{k}</p><p className="text-2xl font-semibold">{v}</p>
              </div>
            ))}
          </div>

          <section aria-labelledby="pa">
            <h2 id="pa" className="mb-2 text-lg font-semibold">Gateway latency per action (target p95 &lt; {TARGET_P95} ms)</h2>
            {!m.per_action.length ? <Empty>No actions recorded.</Empty> : (
              <div className="overflow-x-auto rounded border bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100"><tr>
                    {["Action", "Count", "p50 ms", "p95 ms", "p99 ms", "Errors", "p95 target"].map((h) => <th key={h} className="p-2">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {m.per_action.map((a) => {
                      const pass = a.p95 < TARGET_P95;
                      return (
                        <tr key={a.action} className="border-t">
                          <td className="p-2 font-medium">{a.action}</td><td className="p-2">{a.count}</td>
                          <td className="p-2">{a.p50}</td><td className="p-2 font-semibold">{a.p95}</td><td className="p-2">{a.p99}</td>
                          <td className="p-2">{a.errors}</td>
                          <td className="p-2">
                            <span className={`rounded px-2 py-0.5 text-xs font-bold ${pass ? "bg-green-200 text-green-950" : "bg-red-200 text-red-950"}`}>
                              {pass ? "PASS" : "FAIL"}
                            </span>
                            <svg role="img" aria-label={`p95 ${a.p95} ms of ${TARGET_P95} ms target`} width="100" height="8" className="ml-2 inline-block align-middle">
                              <rect width="100" height="8" fill="#e2e8f0" />
                              <rect width={Math.min(100, (a.p95 / (TARGET_P95 * 2)) * 100)} height="8" fill={pass ? "#15803d" : "#b91c1c"} />
                              <rect x="50" width="1.5" height="8" fill="#0f172a" />
                            </svg>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="e2">
            <h2 id="e2" className="mb-2 text-lg font-semibold">End-to-end latency</h2>
            <p>{m.e2e_latency ? `p50 ${m.e2e_latency.p50} ms · p95 ${m.e2e_latency.p95} ms · n=${m.e2e_latency.n}` : NM}</p>
          </section>

          <section aria-labelledby="lt">
            <h2 id="lt" className="mb-2 text-lg font-semibold">Load test</h2>
            {m.loadtest ? (
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(m.loadtest).map(([k, v]) => (
                  <div key={k} className="rounded border bg-white p-2 text-sm">
                    <dt className="text-xs text-slate-600">{k}</dt><dd className="font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : NM}
          </section>

          <section aria-labelledby="sb">
            <h2 id="sb" className="mb-2 text-lg font-semibold">STT benchmark (accuracy by entity)</h2>
            {m.stt_benchmark?.rows.length ? (
              <div className="overflow-x-auto rounded border bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100"><tr>
                    <th className="p-2">Entity</th><th className="p-2">With keyterms</th><th className="p-2">Without keyterms</th><th className="p-2">n</th>
                  </tr></thead>
                  <tbody>
                    {m.stt_benchmark.rows.map((r) => (
                      <tr key={r.entity} className="border-t">
                        <td className="p-2 font-medium">{r.entity}</td>
                        <td className="p-2">{r.with_keyterms}
                          <svg aria-hidden width="80" height="6" className="ml-2 inline-block"><rect width={(r.with_keyterms / maxStt) * 80} height="6" fill="#15803d" /></svg></td>
                        <td className="p-2">{r.without_keyterms}
                          <svg aria-hidden width="80" height="6" className="ml-2 inline-block"><rect width={(r.without_keyterms / maxStt) * 80} height="6" fill="#64748b" /></svg></td>
                        <td className="p-2">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : NM}
          </section>
        </div>
      )}
    </Shell>
  );
}
