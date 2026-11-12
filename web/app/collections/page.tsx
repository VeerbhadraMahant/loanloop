"use client";
import { useState } from "react";
import { post, useGet, type CollCase, type Collections } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Icon, Pill, Shell, Skeleton, StatTile } from "@/components/ui";

const th = "px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted";
const td = "px-3 py-2 text-xs";
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

type QueueSortKey = "priority" | "customer" | "dpd" | "overdue_amount" | "attempts" | "next_action_at";

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  k: QueueSortKey;
  sortKey: QueueSortKey;
  sortDir: "asc" | "desc";
  onToggle: (k: QueueSortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className={th} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider cursor-pointer transition-colors ${
          active ? "text-fg font-semibold" : "text-muted hover:text-fg"
        }`}
      >
        <span>{label}</span>
        <Icon name="arrow_up_down" size={11} />
      </button>
    </th>
  );
}

function Table({ head, children, min = 640 }: { head: string[]; children: React.ReactNode; min?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="max-h-[420px] overflow-auto">
        <table className="num w-full border-collapse text-left text-xs" style={{ minWidth: min }}>
          <thead className="sticky top-0 z-10 border-b border-line bg-sunken">
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
      </div>
    </Card>
  );
}

export default function CollectionsPage() {
  const { data, error, loading, reload } = useGet<Collections>("/dashboard/collections", 5000);
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<QueueSortKey>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  const toggleSort = (key: QueueSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "overdue_amount" || key === "dpd" ? "desc" : "asc");
    }
  };

  const cases = data?.cases ?? [];
  const ptps = data?.ptps ?? [];
  const rtps = data?.rtps ?? [];
  const queue = data?.queue ?? [];
  const openPtps = ptps.filter((p) => p.status === "open");
  const kept = ptps.filter((p) => p.status === "kept").length;
  const broken = ptps.filter((p) => p.status === "broken").length;
  const byReason = rtps.reduce<Record<string, number>>(
    (m, r) => ({ ...m, [r.reason_code]: (m[r.reason_code] ?? 0) + 1 }),
    {}
  );
  const bucket = BUCKETS.map((b) => {
    const cs = cases.filter((c) => c.bucket === b);
    return { b, n: cs.length, amt: cs.reduce((s, c) => s + c.overdue_amount, 0) };
  });
  const maxAmt = Math.max(1, ...bucket.map((x) => x.amt));

  const sortedQueue = [...queue].sort((a: CollCase, b: CollCase) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "customer") return mul * a.customer.localeCompare(b.customer);
    if (sortKey === "next_action_at") {
      return mul * (a.next_action_at ?? "").localeCompare(b.next_action_at ?? "");
    }
    return mul * (a[sortKey] - b[sortKey]);
  });

  return (
    <Shell
      title="Collections &amp; Recoveries"
      sub="Overdue cases, automated dialer queue, promises to pay (PTP), and refusals to pay (RTP)."
      status={
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] text-muted">RBI Window: 08:00–19:00 IST</span>
          <Button small onClick={runJobs} disabled={running} className="font-semibold">
            <Icon name="sync" size={13} />
            <span>{running ? "Running…" : "Run Jobs Now"}</span>
          </Button>
        </div>
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
        <div className="space-y-6">
          {/* Top KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile value={cases.length} caption="Open Cases" />
            <StatTile value={inr(cases.reduce((s, c) => s + c.overdue_amount, 0))} caption="Overdue Total" accent />
            <StatTile
              value={openPtps.length}
              caption={`Open PTPs · ${inr(openPtps.reduce((s, p) => s + p.amount, 0))}`}
            />
            <StatTile
              value={`${kept} / ${broken}`}
              caption="PTPs Kept / Broken"
              tone={broken > 0 ? "warn" : "neutral"}
            />
          </div>

          {/* Bucket Distribution + RTP Breakdown */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <section aria-labelledby="bk" className="lg:col-span-8">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="bk" className="text-sm font-semibold text-fg">
                  Overdue by DPD Bucket
                </h2>
                <span className="font-mono text-[11px] text-muted">
                  {bucket.filter((x) => x.n > 0).length} of {bucket.length} buckets active
                </span>
              </div>
              <Card className="divide-y divide-line">
                {bucket.map(({ b, n, amt }) => {
                  const pctWidth = n === 0 ? 0 : Math.max(4, (amt / maxAmt) * 100);
                  return (
                    <div
                      key={b}
                      className={`grid grid-cols-[4.5rem_1fr_11rem] items-center gap-3 px-3.5 py-2 font-mono text-xs ${
                        n === 0 ? "text-muted/60" : "text-fg"
                      }`}
                    >
                      <span className="font-semibold">DPD {b}</span>
                      <div className="h-2 w-full overflow-hidden rounded-sm bg-sunken">
                        {pctWidth > 0 && (
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${pctWidth}%` }}
                          />
                        )}
                      </div>
                      <span className="text-right">
                        {n === 0 ? (
                          <span className="text-[11px] text-muted">0 cases</span>
                        ) : (
                          <>
                            <span className="text-muted">{n} cases · </span>
                            <strong className="font-semibold text-fg">{inr(amt)}</strong>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </Card>
            </section>

            <section aria-labelledby="rtp-reasons" className="lg:col-span-4 flex flex-col">
              <h2 id="rtp-reasons" className="mb-2 text-sm font-semibold text-fg">
                RTPs by Reason
              </h2>
              {Object.keys(byReason).length === 0 ? (
                <Empty icon="inbox">No refusals recorded across open cases.</Empty>
              ) : (
                <Card className="p-3.5 flex-1">
                  <ul className="flex flex-wrap gap-1.5">
                    {Object.entries(byReason).map(([k, n]) => (
                      <li key={k}>
                        <Pill tone="warn">
                          {k.replace(/_/g, " ")}: {n}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </div>

          {/* Sortable, Sticky-Header Automated Call Queue */}
          <section aria-labelledby="q">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 id="q" className="text-sm font-semibold text-fg">
                  Recovery Dialer Call Queue
                </h2>
                <span className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-muted">
                  {queue.length}
                </span>
              </div>
              <span className="text-[11px] text-muted">
                Click column headers to sort · hover or focus a row to launch call
              </span>
            </div>

            {!queue.length ? (
              <Empty>Queue is empty. Run jobs to rebuild it from open cases.</Empty>
            ) : (
              <Card className="overflow-hidden">
                <div className="max-h-[480px] overflow-auto">
                  <table className="num w-full min-w-[840px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-line bg-sunken">
                      <tr>
                        <SortHeader label="Priority" k="priority" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <SortHeader label="Customer" k="customer" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <th className={th}>Loan ID</th>
                        <SortHeader label="DPD" k="dpd" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <th className={th}>Bucket</th>
                        <SortHeader label="Overdue" k="overdue_amount" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <SortHeader label="Attempts" k="attempts" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <SortHeader label="Next Action" k="next_action_at" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <th className={`${th} text-right`}>Launch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {sortedQueue.map((c) => (
                        <tr key={c.id} className="group hover:bg-sunken/70 focus-within:bg-sunken/70 transition-colors">
                          <td className={`${td} font-semibold text-fg`}>{c.priority}</td>
                          <td className={`${td} font-sans font-medium text-fg`}>{c.customer}</td>
                          <td className={`${td} font-mono text-muted`}>{c.loan}</td>
                          <td className={td}>
                            <span className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono">
                              {c.dpd} d
                            </span>
                          </td>
                          <td className={td}>
                            <Pill tone="warn">{c.bucket}</Pill>
                          </td>
                          <td className={`${td} font-semibold text-fg`}>{inr(c.overdue_amount)}</td>
                          <td className={`${td} text-muted`}>{c.attempts}</td>
                          <td className={`${td} text-muted`}>{when(c.next_action_at)}</td>
                          <td className={`${td} text-right`}>
                            <Button
                              small
                              variant="secondary"
                              href={`/call/outbound/${c.id}`}
                              className="text-xs font-medium transition-opacity sm:opacity-35 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                            >
                              <Icon name="phone_forwarded" size={12} />
                              <span>Call</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>

          {/* Promises to Pay & Refusals to Pay */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section aria-labelledby="p">
              <h2 id="p" className="mb-2 text-sm font-semibold text-fg">
                Promises to Pay (PTP)
              </h2>
              {!ptps.length ? (
                <Empty>No promises recorded yet.</Empty>
              ) : (
                <Table head={["Customer", "Loan", "Amount", "Promised", "Type", "Status", "Paid", "Dir"]} min={560}>
                  {ptps.map((p) => (
                    <tr key={p.id} className="hover:bg-sunken/70 transition-colors">
                      <td className={`${td} font-sans font-medium text-fg`}>{p.customer}</td>
                      <td className={`${td} font-mono text-muted`}>{p.loan}</td>
                      <td className={`${td} font-semibold text-fg`}>{inr(p.amount)}</td>
                      <td className={td}>{day(p.promised_date)}</td>
                      <td className={td}>
                        <Pill tone={p.amount_tag === "full" ? "ok" : "warn"}>{p.amount_tag}</Pill>
                      </td>
                      <td className={td}>
                        <Pill tone={ptpTone[p.status]}>{p.status}</Pill>
                      </td>
                      <td className={`${td} text-muted`}>{p.paid_amount == null ? "-" : inr(p.paid_amount)}</td>
                      <td className={`${td} font-mono text-[11px] uppercase`}>{p.direction}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>

            <section aria-labelledby="r">
              <h2 id="r" className="mb-2 text-sm font-semibold text-fg">
                Refusals to Pay (RTP)
              </h2>
              {!rtps.length ? (
                <Empty>No refusals recorded yet.</Empty>
              ) : (
                <Table head={["Customer", "Loan", "Reason", "Overdue", "Recorded", "Follow-up"]} min={540}>
                  {rtps.map((r) => (
                    <tr key={r.id} className="hover:bg-sunken/70 transition-colors">
                      <td className={`${td} font-sans font-medium text-fg`}>{r.customer}</td>
                      <td className={`${td} font-mono text-muted`}>{r.loan}</td>
                      <td className={td}>
                        <Pill tone="warn">{r.reason_code.replace(/_/g, " ")}</Pill>
                      </td>
                      <td className={`${td} font-semibold text-fg`}>{inr(r.overdue_amount)}</td>
                      <td className={td}>{when(r.created_at)}</td>
                      <td className={td}>{day(r.follow_up_at)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>
          </div>
        </div>
      )}
    </Shell>
  );
}
