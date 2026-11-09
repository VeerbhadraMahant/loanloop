"use client";
import { useState } from "react";
import { post, useGet, type Collections } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Pill, Shell, Skeleton, StatTile } from "@/components/ui";

const h2 = "mb-3 text-xl font-medium";
const th = "px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted";
const td = "px-3 py-2";
const BUCKETS = ["0", "1-30", "31-60", "61-90", "90+"];
const inr = (n: number | null | undefined) => (n == null ? "-" : `₹${n.toLocaleString("en-IN")}`);
const when = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const day = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const ptpTone = { open: "accent", kept: "ok", broken: "danger", cancelled: "neutral" } as const;

function Table({ head, children, min = 640 }: { head: string[]; children: React.ReactNode; min?: number }) {
  return (
    <Card as="div" className="overflow-x-auto">
      <table className="num w-full text-left text-sm" style={{ minWidth: min }}>
        <thead className="border-b border-line bg-sunken"><tr>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}
const row = "border-t border-line first:border-t-0";

export default function CollectionsPage() {
  const { data, error, loading, reload } = useGet<Collections>("/dashboard/collections", 5000);
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const runJobs = async () => {
    setRunning(true); setRunErr(null);
    try { await post("/dashboard/jobs/run"); await reload(); }
    catch (e) { setRunErr(e instanceof Error ? e.message : "failed"); }
    finally { setRunning(false); }
  };

  const cases = data?.cases ?? [];
  const ptps = data?.ptps ?? [];
  const rtps = data?.rtps ?? [];
  const openPtps = ptps.filter((p) => p.status === "open");
  const kept = ptps.filter((p) => p.status === "kept").length;
  const broken = ptps.filter((p) => p.status === "broken").length;
  const byReason = rtps.reduce<Record<string, number>>((m, r) => ({ ...m, [r.reason_code]: (m[r.reason_code] ?? 0) + 1 }), {});
  const bucket = BUCKETS.map((b) => {
    const cs = cases.filter((c) => c.bucket === b);
    return { b, n: cs.length, amt: cs.reduce((s, c) => s + c.overdue_amount, 0) };
  });
  const maxAmt = Math.max(1, ...bucket.map((x) => x.amt));

  return (
    <Shell title="Collections" sub="Overdue cases, the call queue, promises and refusals to pay. Synthetic data."
      status={<Button small onClick={runJobs} disabled={running}>{running ? "Running…" : "Run jobs now"}</Button>}>
      <ErrorBox error={error ?? runErr} />
      {!data ? (loading ? <Skeleton rows={4} /> : <Empty>No collections data yet.</Empty>) : (
        <div className="space-y-10">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile value={cases.length} caption="Open cases" />
            <StatTile value={inr(cases.reduce((s, c) => s + c.overdue_amount, 0))} caption="Overdue total" accent />
            <StatTile value={openPtps.length} caption={`Open PTPs · ${inr(openPtps.reduce((s, p) => s + p.amount, 0))}`} />
            <StatTile value={`${kept} / ${broken}`} caption="PTPs kept / broken" />
            <div className="rounded-lg border border-line bg-card p-5">
              <p className="text-sm text-muted">RTPs by reason</p>
              {Object.keys(byReason).length === 0 ? <p className="mt-2 text-sm text-muted">None yet</p> : (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(byReason).map(([k, n]) => <li key={k}><Pill>{k.replace(/_/g, " ")} {n}</Pill></li>)}
                </ul>
              )}
            </div>
          </div>

          <section aria-labelledby="bk">
            <h2 id="bk" className={h2}>Overdue by bucket (days past due)</h2>
            <Card as="div" className="space-y-2 p-4">
              {bucket.map(({ b, n, amt }) => (
                <div key={b} className="grid grid-cols-[4rem_1fr_11rem] items-center gap-3 text-sm">
                  <span className="font-medium">{b}</span>
                  <svg role="img" aria-label={`${b}: ${n} cases, ${inr(amt)}`} width="100%" height="10">
                    <rect width="100%" height="10" rx="5" fill="var(--sunken)" />
                    <rect width={`${(amt / maxAmt) * 100}%`} height="10" rx="5" fill="var(--ok-fg)" />
                  </svg>
                  <span className="num text-right text-muted">{n} cases · {inr(amt)}</span>
                </div>
              ))}
            </Card>
          </section>

          <section aria-labelledby="q">
            <h2 id="q" className={h2}>Call queue</h2>
            {!data.queue.length ? <Empty>Queue is empty. Run jobs to rebuild it.</Empty> : (
              <Table head={["Priority", "Customer", "Loan", "DPD", "Bucket", "Overdue", "Attempts", "Next action", ""]} min={820}>
                {data.queue.map((c) => (
                  <tr key={c.id} className={row}>
                    <td className={`${td} font-semibold`}>{c.priority}</td><td className={td}>{c.customer}</td><td className={td}>{c.loan}</td>
                    <td className={td}>{c.dpd}</td><td className={td}>{c.bucket}</td><td className={td}>{inr(c.overdue_amount)}</td>
                    <td className={td}>{c.attempts}</td><td className={td}>{when(c.next_action_at)}</td>
                    <td className={td}><Button small variant="secondary" href={`/call/outbound/${c.id}`}>Call</Button></td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          <section aria-labelledby="p">
            <h2 id="p" className={h2}>Promises to pay</h2>
            {!ptps.length ? <Empty>No promises recorded yet.</Empty> : (
              <Table head={["Customer", "Loan", "Amount", "Promised for", "Type", "Status", "Paid", "Direction"]}>
                {ptps.map((p) => (
                  <tr key={p.id} className={row}>
                    <td className={td}>{p.customer}</td><td className={td}>{p.loan}</td><td className={td}>{inr(p.amount)}</td>
                    <td className={td}>{day(p.promised_date)}</td><td className={td}><Pill tone={p.amount_tag === "full" ? "ok" : "warn"}>{p.amount_tag}</Pill></td>
                    <td className={td}><Pill tone={ptpTone[p.status]}>{p.status}</Pill></td><td className={td}>{p.paid_amount == null ? "-" : inr(p.paid_amount)}</td>
                    <td className={td}>{p.direction}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          <section aria-labelledby="r">
            <h2 id="r" className={h2}>Refusals to pay</h2>
            {!rtps.length ? <Empty>No refusals recorded yet.</Empty> : (
              <Table head={["Customer", "Loan", "Reason", "Overdue", "Recorded", "Follow-up"]} min={600}>
                {rtps.map((r) => (
                  <tr key={r.id} className={row}>
                    <td className={td}>{r.customer}</td><td className={td}>{r.loan}</td><td className={td}><Pill>{r.reason_code.replace(/_/g, " ")}</Pill></td>
                    <td className={td}>{inr(r.overdue_amount)}</td><td className={td}>{when(r.created_at)}</td><td className={td}>{day(r.follow_up_at)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          <section aria-labelledby="j">
            <h2 id="j" className={h2}>Last job runs</h2>
            {!data.last_runs.length ? <Empty>No runs yet. Press Run jobs now.</Empty> : (
              <Table head={["Job", "Started", "Finished", "Stats"]} min={560}>
                {data.last_runs.map((j) => (
                  <tr key={j.id} className={row}>
                    <td className={`${td} font-medium`}>{j.job}</td><td className={td}>{when(j.started_at)}</td><td className={td}>{when(j.finished_at)}</td>
                    <td className={`${td} text-muted`}>{j.stats ? JSON.stringify(j.stats) : "-"}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
