"use client";
import { useEffect, useState } from "react";
import { Approval, Sms, useEvents, useGet, post, GwEvent } from "@/lib/api";
import { Button, Empty, ErrorBox, Icon, Pill, Skeleton, fmtTime, stagger } from "@/components/ui";

export function CircularCountdown({ from, to }: { from: string; to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = new Date(to).getTime();
  const total = Math.max(1000, end - new Date(from).getTime());
  const ms = Math.max(0, end - now);
  const s = Math.floor(ms / 1000);
  const fraction = Math.max(0, Math.min(1, ms / total));
  const radius = 24;
  const circumference = 2 * Math.PI * radius; // ~150.8
  const offset = circumference * (1 - fraction);
  const isUrgent = s <= 10;

  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="relative w-14 h-14 flex items-center justify-center">
        <svg className="w-14 h-14 -rotate-90 transform" viewBox="0 0 56 56">
          <circle cx="28" cy="28" fill="none" r={radius} stroke="var(--warn-border)" strokeWidth="4" />
          <circle
            className="transition-all duration-1000 ease-linear"
            cx="28"
            cy="28"
            fill="none"
            r={radius}
            stroke={isUrgent ? "var(--danger-fg)" : "var(--warn-fg)"}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            strokeWidth="4"
          />
        </svg>
        <span
          className={`absolute font-mono text-xs font-bold tracking-tight ${
            isUrgent ? "text-danger-fg" : "text-warn-fg"
          }`}
        >
          {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
        </span>
      </div>
      <span className="font-mono text-[10px] text-warn-fg uppercase font-semibold mt-1">Expires</span>
    </div>
  );
}

const statusTone = { approved: "ok", denied: "danger", pending: "warn", expired: "neutral" } as const;
const statusIcon = { approved: "check", denied: "x", pending: "clock", expired: "clock" } as const;

export function PhoneHandset({ customer, isSidecar }: { customer: string; isSidecar?: boolean }) {
  const base = `/phone/${encodeURIComponent(customer)}`;
  const me = useGet<{ name: string; mobile_masked: string }>(base, 0);
  const sms = useGet<Sms[]>(`${base}/sms`, 3000);
  const appr = useGet<Approval[]>(`${base}/approvals`, 3000);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEvents((e: GwEvent) => {
    if (e.customer_key !== customer) return;
    if (e.type === "sms") sms.reload();
    if (e.type === "approval") appr.reload();
  });

  const pending = (appr.data ?? []).find((a) => a.status === "pending");
  const act = async (id: string, verb: "approve" | "deny") => {
    setBusy(true);
    setActErr(null);
    try {
      await post(`${base}/approvals/${encodeURIComponent(id)}/${verb}`);
      await appr.reload();
    } catch (e) {
      setActErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const copyText = (val: string, key: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const err = me.error ?? sms.error ?? appr.error;
  const h2 = "mb-2 text-xs font-semibold uppercase tracking-wider text-muted flex items-center justify-between";

  const chassis = (
    <div className="w-full max-w-[390px] mx-auto bg-card rounded-[2.5rem] shadow-xl p-3 border-4 border-surface-container">
      <div className="w-full bg-surface-bright rounded-[2rem] overflow-hidden flex flex-col min-h-[720px] shadow-inner relative border border-line">
        {/* Hardware Notch */}
        <div className="w-full pt-2 flex justify-center bg-card">
          <div className="w-24 h-4 bg-fg rounded-full flex items-center justify-end px-2">
            <span className="w-1.5 h-1.5 rounded-full bg-sunken"></span>
          </div>
        </div>

        {/* Status Bar */}
        <div className="w-full px-6 py-2 bg-card flex items-center justify-between text-fg font-mono text-xs">
          <span className="font-semibold">10:42</span>
          <div className="flex items-center gap-1.5 text-muted">
            <span className="text-[11px] font-mono">5G</span>
            <Icon name="phone" size={12} />
          </div>
        </div>

        {/* App Header */}
        <div className="px-5 py-3 bg-card border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary text-primary-fg flex items-center justify-center font-bold text-xs shadow-xs">
              S
            </div>
            <div>
              <h3 className="serif text-primary text-base leading-tight font-semibold">
                Sahyadri Mobile
              </h3>
              <p className="font-mono text-muted text-[11px]">
                {me.data ? `${me.data.name} · ${me.data.mobile_masked}` : customer}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-ok-bg text-ok-fg text-[11px] font-medium border border-ok-border">
            <span className="w-1.5 h-1.5 rounded-full bg-ok-fg animate-pulse"></span>
            <span>Synced</span>
          </div>
        </div>

        {/* Realtime Channel Link Strip */}
        <div className="bg-surface-container-low px-4 py-2 border-b border-line flex items-center justify-between text-xs text-muted">
          <span className="flex items-center gap-1.5 font-medium">
            <Icon name="sync" size={13} />
            Voice desk paired via secure SSE
          </span>
          <span className="font-mono text-[10px] text-primary font-semibold">Live Mode</span>
        </div>

        {/* Scrollable Main Area */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <ErrorBox error={err} />

          {/* PINNED IN-APP TIER 2 APPROVAL CARD */}
          {pending && (
            <section
              key={pending.id}
              aria-labelledby="ap"
              className="enter rounded-xl border border-warn-border bg-warn-bg p-4 shadow-sm relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-warn-border/60 text-warn-fg font-mono text-[11px] font-semibold">
                  <Icon name="shield" size={13} />
                  In-Call Authorization Needed
                </span>
              </div>

              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <h4 id="ap" className="serif text-base font-semibold text-fg leading-snug">
                    {pending.purpose}
                  </h4>
                  <p className="font-sans text-xs text-muted mt-1 leading-relaxed">
                    Requested by Voice Agent during your live call. Authorizes requested changes to your ledger.
                  </p>
                </div>
                <CircularCountdown from={pending.created_at} to={pending.expires_at} />
              </div>

              {actErr && (
                <p role="alert" className="mb-2 text-xs text-danger-fg">
                  {actErr}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  disabled={busy}
                  onClick={() => act(pending.id, "approve")}
                  className="w-full h-11 text-center justify-center font-semibold text-xs"
                >
                  <Icon name="check" size={14} />
                  Approve (Tap)
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act(pending.id, "deny")}
                  className="w-full h-11 text-center justify-center font-semibold text-xs border-danger-line text-danger-fg hover:bg-danger-bg"
                >
                  <Icon name="x" size={14} />
                  Deny
                </Button>
              </div>

              <div className="mt-3 pt-2 border-t border-warn-border/40 text-[11px] text-muted text-center italic">
                Zero Secrets Protocol: Sahyadri never asks you to tell OTP/PIN numbers to callers.
              </div>
            </section>
          )}

          {/* OFFICIAL SMS INBOX */}
          <section aria-labelledby="sm">
            <div className={h2}>
              <span className="flex items-center gap-1.5 text-fg">
                <Icon name="inbox" size={14} />
                Official Bank SMS Inbox
              </span>
              <span className="font-mono text-[10px] text-muted font-normal">Carrier: Bank Secure</span>
            </div>

            {sms.loading ? (
              <Skeleton rows={2} />
            ) : !sms.data?.length ? (
              <Empty icon="inbox">No messages yet. Texts sent during a call appear here.</Empty>
            ) : (
              <ul className="space-y-2.5">
                {[...sms.data]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((m, i) => (
                    <li
                      key={m.id}
                      className="enter rounded-xl border border-line bg-card p-3 shadow-xs"
                      style={stagger(i)}
                    >
                      <div className="flex items-center justify-between text-xs text-muted font-mono mb-1.5">
                        <span className="font-semibold text-primary">VK-SAHYADRI</span>
                        <span>{fmtTime(m.created_at)}</span>
                      </div>
                      <p className="text-xs text-fg leading-relaxed">{m.body}</p>
                      <button
                        onClick={() => copyText(m.body, m.id)}
                        className="mt-2 text-[11px] text-primary hover:text-accent-hover font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Icon name="phone" size={12} />
                        <span>{copiedId === m.id ? "Copied to clipboard!" : "Copy details"}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* RECENT ACTIVITY */}
          <section aria-labelledby="ra">
            <h2 id="ra" className={h2}>
              <span>Recent Activity</span>
            </h2>
            {appr.loading ? (
              <Skeleton rows={2} />
            ) : !appr.data?.length ? (
              <Empty icon="clock">No activity yet.</Empty>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-card text-xs shadow-xs">
                {[...appr.data]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block font-medium text-fg">{a.purpose}</span>
                        <span className="font-mono text-[11px] text-muted">{fmtTime(a.created_at)}</span>
                      </span>
                      <Pill
                        tone={statusTone[a.status as keyof typeof statusTone] ?? "neutral"}
                        icon={statusIcon[a.status as keyof typeof statusIcon]}
                      >
                        {a.status}
                      </Pill>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>

        {/* Mobile App Bottom Nav Bar */}
        <div className="bg-card px-6 py-2.5 border-t border-line flex items-center justify-between text-muted text-[10px]">
          <div className="flex flex-col items-center gap-0.5 text-primary font-semibold">
            <Icon name="lock" size={14} />
            <span>Home</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Icon name="shield" size={14} />
            <span>Loans</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Icon name="phone" size={14} />
            <span>Support</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Icon name="eye" size={14} />
            <span>Profile</span>
          </div>
        </div>

        {/* Home Indicator */}
        <div className="w-full pb-1 pt-1 bg-card flex justify-center">
          <div className="w-32 h-1 bg-outline-variant rounded-full"></div>
        </div>
      </div>
    </div>
  );

  if (isSidecar) {
    return chassis;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sunken p-4 sm:p-6">
      {chassis}
    </main>
  );
}

export default function PhoneApp({ customer }: { customer: string }) {
  return <PhoneHandset customer={customer} />;
}
