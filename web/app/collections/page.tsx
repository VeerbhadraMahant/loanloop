"use client";
import { useState } from "react";
import { post, useGet, type Collections } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Icon, Pill, Shell, Skeleton, StatTile } from "@/components/ui";

const h2 = "serif text-xl font-semibold text-fg mb-3";
const th = "px-3.5 py-2.5 text-xs font-mono font-medium uppercase tracking-wider text-muted";
const td = "px-3.5 py-3 text-xs";
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
    <Card className="overflow-x-auto">
      <table className="num w-full text-left text-sm" style={{ minWidth: min }}>
        <thead className="border-b border-line bg-sunken">
          <tr>
            {head.map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </Card>
  );
}

export default function CollectionsPage() {
  const { data, error, loading, reload } = useGet<Collections>("/dashboard/collections", 5000);
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);

  const runJobs = async () => {
    setRunning(true);
    setRunErr(null);
    try {
      await post("/dashboard/jobs/run");
      await reload();
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "failed");
    } finally {
      setRunning(false);
    }
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
    <Shell
      title="Collections &amp; Recoveries Console"
      sub="Overdue cases, automated dialer queue, promises to pay (PTP), and refusals to pay (RTP)."
      status={
        <Button small onClick={runJobs} disabled={running} className="font-semibold text-xs">
          <Icon name="sync" size={14} />
          <span>{running ? "Running…" : "Run Jobs Now"}</span>
        </Button>
      }
    >
      <ErrorBox error={error ?? runErr} />
      {!data ? (
        loading ? (
          <Skeleton rows={4} />
        ) : (
          <Empty>No collections data yet.</Empty>
        )
      ) : (
        <div className="space-y-8">
          {/* Top KPI Tiles */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatTile value={cases.length} caption="Open Cases" />
            <StatTile value={inr(cases.reduce((s, c) => s + c.overdue_amount, 0))} caption="Overdue Total" accent />
            <StatTile
              value={openPtps.length}
              caption={`Open PTPs · ${inr(openPtps.reduce((s, p) => s + p.amount, 0))}`}
            />
            <StatTile value={`${kept} / ${broken}`} caption="PTPs Kept / Broken" />
            <Card className="p-4 flex flex-col justify-between">
              <span className="text-xs font-mono uppercase text-muted font-medium">RTPs by Reason</span>
              {Object.keys(byReason).length === 0 ? (
                <p className="mt-2 text-xs text-muted">None recorded</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(byReason).map(([k, n]) => (
                    <li key={k}>
                      <Pill tone="warn">
                        {k.replace(/_/g, " ")}: {n}
                      </Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Overdue by Bucket Histogram */}
          <section aria-labelledby="bk">
            <h2 id="bk" className={h2}>
              Overdue by Bucket (Days Past Due)
            </h2>
            <Card className="p-5 space-y-3">
              {bucket.map(({ b, n, amt }) => (
                <div key={b} className="grid grid-cols-[5rem_1fr_13rem] items-center gap-4 text-xs font-mono">
                  <span className="font-semibold text-fg">DPD {b}</span>
                  <div className="h-3 w-full bg-sunken rounded-full overflow-hidden border border-line">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(2, (amt / maxAmt) * 100)}%` }}
                    />
                  </div>
                  <span className="text-right text-muted">
                    {n} cases · <strong className="text-fg">{inr(amt)}</strong>
                  </span>
                </div>
              ))}
            </Card>
          </section>

          {/* Automated Call Queue */}
          <section aria-labelledby="q">
            <div className="flex items-center justify-between mb-3">
              <h2 id="q" className={h2}>
                Recovery Dialer Call Queue
              </h2>
              <span className="text-xs font-mono text-muted">
                RBI Window: 08:00–19:00 IST
              </span>
            </div>

            {!data.queue.length ? (
              <Empty>Queue is empty. Run jobs to rebuild it from open cases.</Empty>
            ) : (
              <Table
                head={["Priority", "Customer", "Loan ID", "DPD", "Bucket", "Overdue", "Attempts", "Next Action", "Launch"]}
                min={860}
              >
                {data.queue.map((c) => (
                  <tr key={c.id} className="hover:bg-sunken transition-colors">
                    <td className={`${td} font-bold text-fg`}>{c.priority}</td>
                    <td className={`${td} font-medium text-fg`}>{c.customer}</td>
                    <td className={`${td} text-muted font-mono`}>{c.loan}</td>
                    <td className={td}>
                      <span className="px-2 py-0.5 rounded bg-sunken border border-line font-mono font-medium">
                        {c.dpd} d
                      </span>
                    </td>
                    <td className={td}>
                      <span className="px-2 py-0.5 rounded bg-warn-bg text-warn-fg border border-warn-border font-mono">
                        {c.bucket}
                      </span>
                    </td>
                    <td className={`${td} font-bold text-fg`}>{inr(c.overdue_amount)}</td>
                    <td className={`${td} text-muted`}>{c.attempts}</td>
                    <td className={`${td} text-muted`}>{when(c.next_action_at)}</td>
                    <td className={td}>
                      <Button small variant="secondary" href={`/call/outbound/${c.id}`} className="text-xs font-semibold">
                        <Icon name="phone_forwarded" size={13} />
                        <span>Call</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          {/* Promises to Pay */}
          <section aria-labelledby="p">
            <h2 id="p" className={h2}>
              Promises to Pay (PTP)
            </h2>
            {!ptps.length ? (
              <Empty>No promises recorded yet.</Empty>
            ) : (
              <Table head={["Customer", "Loan", "Amount", "Promised Date", "Type", "Status", "Paid Amount", "Direction"]}>
                {ptps.map((p) => (
                  <tr key={p.id} className="hover:bg-sunken transition-colors">
                    <td className={`${td} font-medium text-fg`}>{p.customer}</td>
                    <td className={`${td} text-muted font-mono`}>{p.loan}</td>
                    <td className={`${td} font-bold text-fg`}>{inr(p.amount)}</td>
                    <td className={td}>{day(p.promised_date)}</td>
                    <td className={td}>
                      <Pill tone={p.amount_tag === "full" ? "ok" : "warn"}>{p.amount_tag}</Pill>
                    </td>
                    <td className={td}>
                      <Pill tone={ptpTone[p.status]}>{p.status}</Pill>
                    </td>
                    <td className={`${td} text-muted`}>{p.paid_amount == null ? "-" : inr(p.paid_amount)}</td>
                    <td className={`${td} uppercase font-mono text-[11px]`}>{p.direction}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          {/* Refusals to Pay */}
          <section aria-labelledby="r">
            <h2 id="r" className={h2}>
              Refusals to Pay (RTP)
            </h2>
            {!rtps.length ? (
              <Empty>No refusals recorded yet.</Empty>
            ) : (
              <Table head={["Customer", "Loan", "Reason Code", "Overdue Amount", "Recorded Time", "Follow-up Date"]} min={600}>
                {rtps.map((r) => (
                  <tr key={r.id} className="hover:bg-sunken transition-colors">
                    <td className={`${td} font-medium text-fg`}>{r.customer}</td>
                    <td className={`${td} text-muted font-mono`}>{r.loan}</td>
                    <td className={td}>
                      <Pill tone="warn">{r.reason_code.replace(/_/g, " ")}</Pill>
                    </td>
                    <td className={`${td} font-bold text-fg`}>{inr(r.overdue_amount)}</td>
                    <td className={td}>{when(r.created_at)}</td>
                    <td className={td}>{day(r.follow_up_at)}</td>
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
