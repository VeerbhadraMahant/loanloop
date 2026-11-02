"use client";
import { useEffect, useState } from "react";
import { Approval, Sms, useEvents, useGet, post, GwEvent } from "@/lib/api";
import { Button, Empty, ErrorBox, Icon, Pill, Skeleton, fmtTime, stagger } from "@/components/ui";

function Countdown({ from, to }: { from: string; to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const end = new Date(to).getTime();
  const total = Math.max(1000, end - new Date(from).getTime());
  const ms = Math.max(0, end - now);
  const s = Math.floor(ms / 1000);
  return (
    <div className="mb-4">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <Icon name="clock" size={14} />Expires in <span className="num inline-block min-w-[3ch] font-medium text-fg">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken" role="presentation">
        <div className="bar h-full origin-left rounded-full bg-accent transition-transform duration-1000 ease-linear"
          style={{ transform: `scaleX(${Math.min(1, ms / total)})` }} />
      </div>
    </div>
  );
}

const statusTone = { approved: "ok", denied: "danger", pending: "warn", expired: "neutral" } as const;
const statusIcon = { approved: "check", denied: "x", pending: "clock", expired: "clock" } as const;

export default function PhoneApp({ customer }: { customer: string }) {
  const base = `/phone/${encodeURIComponent(customer)}`;
  const me = useGet<{ name: string; mobile_masked: string }>(base, 0);
  const sms = useGet<Sms[]>(`${base}/sms`, 3000);
  const appr = useGet<Approval[]>(`${base}/approvals`, 3000);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);

  useEvents((e: GwEvent) => {
    if (e.customer_key !== customer) return;
    if (e.type === "sms") sms.reload();
    if (e.type === "approval") appr.reload();
  });

  const pending = (appr.data ?? []).find((a) => a.status === "pending");
  const act = async (id: string, verb: "approve" | "deny") => {
    setBusy(true); setActErr(null);
    try { await post(`${base}/approvals/${encodeURIComponent(id)}/${verb}`); await appr.reload(); }
    catch (e) { setActErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  };
  const err = me.error ?? sms.error ?? appr.error;
  const h2 = "mb-3 text-xs font-semibold uppercase tracking-wider text-muted";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sunken sm:p-6">
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-bg sm:h-[800px] sm:max-h-[calc(100dvh-48px)] sm:w-[390px] sm:rounded-[36px] sm:border-[6px] sm:border-bezel sm:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
        <header className="border-b border-line bg-card px-5 pb-4 pt-6">
          <p className="serif text-[26px] leading-tight">Sahyadri Finance Bank</p>
          <p className="num mt-0.5 text-sm text-muted">{me.data ? `${me.data.name} · ${me.data.mobile_masked}` : customer}</p>
        </header>
        <p className="border-b border-line bg-warn-bg px-5 py-1.5 text-xs text-warn-fg">Demo app · synthetic data</p>
        <div className="flex-1 space-y-7 overflow-y-auto p-4">
          <ErrorBox error={err} />
          {pending && (
            <section key={pending.id} aria-labelledby="ap" className="enter rounded-lg border border-fg bg-card p-4">
              <h2 id="ap" className="flex items-center gap-2 font-semibold"><Icon name="shield" size={18} />Approval needed</h2>
              <p className="my-3 text-[15px]">{pending.purpose}</p>
              <Countdown from={pending.created_at} to={pending.expires_at} />
              {actErr && <p role="alert" className="mb-2 text-xs text-danger-fg">{actErr}</p>}
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={busy} onClick={() => act(pending.id, "approve")}><Icon name="check" size={16} />Approve</Button>
                <Button variant="secondary" disabled={busy} onClick={() => act(pending.id, "deny")}><Icon name="x" size={16} />Deny</Button>
              </div>
            </section>
          )}
          <section aria-labelledby="sm">
            <h2 id="sm" className={h2}>SMS inbox</h2>
            {sms.loading ? <Skeleton rows={2} /> : !sms.data?.length ? <Empty icon="inbox">No messages yet. Texts sent during a call appear here.</Empty> : (
              <ul className="space-y-2">
                {[...sms.data].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((m, i) => (
                  <li key={m.id} className="enter max-w-[88%]" style={stagger(i)}>
                    <p className="rounded-[18px] rounded-bl-md bg-card px-4 py-2.5 text-[15px] ring-1 ring-line">{m.body}</p>
                    <p className="num mt-1 pl-2 text-xs text-muted">{fmtTime(m.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="ra">
            <h2 id="ra" className={h2}>Recent activity</h2>
            {appr.loading ? <Skeleton rows={2} /> : !appr.data?.length ? <Empty icon="clock">No activity yet.</Empty> : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-card text-sm">
                {[...appr.data].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-3">
                    <span className="min-w-0">
                      <span className="block">{a.purpose}</span>
                      <span className="num text-xs text-muted">{fmtTime(a.created_at)}</span>
                    </span>
                    <Pill tone={statusTone[a.status as keyof typeof statusTone] ?? "neutral"} icon={statusIcon[a.status as keyof typeof statusIcon]}>{a.status}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
