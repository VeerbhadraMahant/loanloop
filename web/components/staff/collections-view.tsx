"use client";
import React, { useState } from "react";
import { post, useGet, type CollCase, type Collections } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Icon, Pill, Skeleton, StatTile } from "@/components/ui";

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

export function CollectionsView({ onLaunchCall }: { onLaunchCall: (caseId: number) => void }) {
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-line">
        <div>
          <h2 className="text-base font-bold text-fg">Collections &amp; Recoveries</h2>
          <p className="text-xs text-muted">Overdue cases, automated dialer queue, promises to pay (PTP), and refusals to pay (RTP).</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] text-muted">RBI Window: 08:00–19:00 IST</span>
          <Button small onClick={runJobs} disabled={running} className="font-semibold">
            <Icon name="sync" size={13} />
            <span>{running ? "Running…" : "Run Jobs Now"}</span>
          </Button>
        </div>
      </div>

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

          {/* DPD Bucket Distribution Bar */}
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-fg">DPD Bucket Distribution</span>
              <span className="font-mono text-muted">Total Overdue: {inr(cases.reduce((s, c) => s + c.overdue_amount, 0))}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {bucket.map(({ b, n, amt }) => (
                <div key={b} className="space-y-1">
                  <div className="h-10 rounded bg-sunken p-1 flex flex-col justify-end">
                    <div
                      className="rounded bg-primary/70 transition-all"
                      style={{ height: `${Math.round((amt / maxAmt) * 100)}%`, minHeight: amt > 0 ? "4px" : "0" }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-muted">{b}</span>
                    <span className="font-medium text-fg">{n}</span>
                  </div>
                  <div className="text-[10px] font-mono text-muted truncate">{inr(amt)}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Automated Dialer Queue */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-fg">Dialer Queue ({sortedQueue.length})</h3>
                <p className="text-[11px] text-muted">
                  Click column headers to sort · hover or focus a row to launch call
                </p>
              </div>
            </div>
            {!sortedQueue.length ? (
              <Empty>Dialer queue is clear. No calls pending.</Empty>
            ) : (
              <Card className="overflow-hidden">
                <div className="max-h-[480px] overflow-auto">
                  <table className="num w-full min-w-[720px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-line bg-sunken">
                      <tr>
                        <SortHeader label="Pri" k="priority" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <SortHeader label="Customer" k="customer" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <SortHeader label="DPD" k="dpd" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <th className={th}>Bucket</th>
                        <SortHeader label="Overdue" k="overdue_amount" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <SortHeader label="Attempts" k="attempts" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <SortHeader label="Next Action" k="next_action_at" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                        <th className={`${th} text-right`}></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {sortedQueue.map((c) => (
                        <tr key={c.id} className="group hover:bg-sunken/70 transition-colors">
                          <td className={`${td} font-mono font-semibold text-muted`}>#{c.priority}</td>
                          <td className={`${td} font-sans font-medium text-fg`}>
                            <div className="truncate max-w-[140px]">{c.customer}</div>
                            <div className="font-mono text-[10px] text-muted">{c.loan}</div>
                          </td>
                          <td className={`${td} font-mono font-semibold ${c.dpd > 60 ? "text-danger-fg" : "text-fg"}`}>{c.dpd}d</td>
                          <td className={td}>
                            <Pill tone={c.bucket === "90+" ? "danger" : c.bucket === "61-90" ? "warn" : "neutral"}>
                              {c.bucket}
                            </Pill>
                          </td>
                          <td className={`${td} font-semibold text-fg`}>{inr(c.overdue_amount)}</td>
                          <td className={`${td} font-mono text-muted`}>{c.attempts}</td>
                          <td className={`${td} font-mono text-muted`}>{when(c.next_action_at)}</td>
                          <td className={`${td} text-right`}>
                            <Button small className="font-semibold cursor-pointer" onClick={() => onLaunchCall(c.id)}>
                              <Icon name="support_agent" size={13} />
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

          {/* Bottom Split: PTPs & RTPs */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-fg">Promises to Pay ({ptps.length})</h3>
              {!ptps.length ? (
                <Empty>No promises to pay recorded yet.</Empty>
              ) : (
                <Table head={["Customer", "Amount", "Promised Date", "Status", "Recorded"]} min={480}>
                  {ptps.map((p) => (
                    <tr key={p.id} className="hover:bg-sunken/70 transition-colors">
                      <td className={`${td} font-sans font-medium text-fg`}>{p.customer}</td>
                      <td className={`${td} font-semibold text-fg`}>{inr(p.amount)}</td>
                      <td className={`${td} font-mono text-fg`}>{day(p.promised_date)}</td>
                      <td className={td}>
                        <Pill tone={ptpTone[p.status]}>{p.status.toUpperCase()}</Pill>
                      </td>
                      <td className={td}>{when(p.created_at)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg">Refusals to Pay ({rtps.length})</h3>
                <span className="font-mono text-[11px] text-muted">
                  Reasons: {Object.entries(byReason).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}
                </span>
              </div>
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
    </div>
  );
}
