"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Approval, Sms, useGet, post } from "@/lib/api";
import { SignOut } from "@/components/auth";
import { Button, Empty, ErrorBox, Icon, Pill, Skeleton, fmtTime, stagger } from "@/components/ui";

export function CircularCountdown({ from, to }: { from: string; to?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = to ? new Date(to).getTime() : now;
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
            strokeDashoffset={isNaN(offset) ? 0 : offset}
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

export interface PhoneSimulationProps {
  inCall: boolean;
  status: string;
  ended: boolean;
  busy: boolean;
  listening: boolean;
  msgs: Array<{ who: "caller" | "agent"; text: string }>;
  callDuration: number;
  talkProps: Record<string, unknown>;
  start: () => void;
  end: () => void;
  sendTextVal: (q: string) => void;
  quickPrompts: string[];
  personaName: string;
  personaPhone: string;
  personaLoan: string;
  text?: string;
  setText?: (t: string) => void;
  sendText?: () => void;
}

const fmtDur = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export function PhoneHandset({
  isSidecar,
  simulationProps,
  noData,
}: {
  isSidecar?: boolean;
  simulationProps?: PhoneSimulationProps;
  /** staff outbound case: there is no signed-in customer, so do not poll /phone/me. */
  noData?: boolean;
}) {
  const base = "/phone/me"; // the gateway resolves "me" to the signed-in customer
  const me = useGet<{ name: string; mobile_masked: string }>(noData ? null : base, 0);
  const sms = useGet<Sms[]>(noData ? null : `${base}/sms`, 3000);
  const appr = useGet<Approval[]>(noData ? null : `${base}/approvals`, 3000);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState<"call" | "app">(() => (simulationProps ? "call" : "app"));
  const [showKeyboard, setShowKeyboard] = useState(false);

  useEffect(() => {
    if (simulationProps?.inCall) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync tab to external prop
      setActiveTab("call");
    }
  }, [simulationProps?.inCall]);

  const pending = (appr.data ?? []).find((a) => a.status === "pending");
  const act = async (id: string | number, verb: "approve" | "deny") => {
    setBusy(true);
    setActErr(null);
    try {
      await post(`${base}/approvals/${encodeURIComponent(String(id))}/${verb}`);
      await appr.reload();
    } catch (e) {
      setActErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const copyText = (val: string, key: string | number) => {
    navigator.clipboard?.writeText(val);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const err = me.error ?? sms.error ?? appr.error;
  const h2 = "mb-2 text-xs font-semibold uppercase tracking-wider text-muted flex items-center justify-between";

  const chassis = (
    <div
      className={`w-full mx-auto bg-card flex flex-col ${
        simulationProps
          ? "h-[700px] max-h-[calc(100vh-140px)] min-h-[560px] max-w-[390px] rounded-[2rem] p-2.5 border-2 border-line-strong shadow-md"
          : isSidecar
          ? "h-[600px] max-h-[calc(100vh-190px)] min-h-[480px] max-w-[350px] rounded-2xl p-2 border border-line-strong"
          : "max-w-[390px] min-h-[700px] rounded-[2rem] p-2.5 border-2 border-line-strong shadow-md"
      }`}
    >
      <div className="w-full bg-canvas rounded-[1.5rem] overflow-hidden flex flex-col relative border border-line h-full flex-1 min-h-0">
        {/* Hardware Notch */}
        <div className="w-full pt-2 flex justify-center bg-card shrink-0">
          <div className="w-20 h-3.5 bg-fg/90 rounded-full flex items-center justify-end px-2">
            <span className="w-1.5 h-1.5 rounded-full bg-sunken"></span>
          </div>
        </div>

        {/* Status Bar */}
        <div className="w-full px-5 py-1.5 bg-card flex items-center justify-between text-fg font-mono tabular-nums text-[11px] shrink-0 border-b border-line/50">
          <span className="font-semibold">10:42</span>
          <div className="flex items-center gap-1.5 text-muted">
            <span className="text-[10px]">5G</span>
            <Icon name="phone" size={11} />
          </div>
        </div>

        {/* Dual Mode Sub-Navigation when in Simulation */}
        {simulationProps && (
          <div className="px-3 py-1.5 bg-card border-b border-line flex items-center justify-between shrink-0">
            <div className="inline-flex items-center p-0.5 rounded-md bg-sunken border border-line w-full gap-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("call")}
                className={`flex-1 py-1 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activeTab === "call"
                    ? "bg-card text-fg font-semibold border border-line"
                    : "text-muted hover:text-fg border border-transparent"
                }`}
              >
                <Icon name="phone" size={12} />
                <span className="tabular-nums">Call {simulationProps.inCall && `(${fmtDur(simulationProps.callDuration)})`}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("app")}
                className={`flex-1 py-1 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activeTab === "app"
                    ? "bg-card text-fg font-semibold border border-line"
                    : "text-muted hover:text-fg border border-transparent"
                }`}
              >
                <Icon name="inbox" size={12} />
                <span>SMS &amp; Approvals</span>
                {(pending || (sms.data && sms.data.length > 0)) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-warn-fg"></span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* SIMULATION MODE: ACTIVE CALL SCREEN */}
        {simulationProps && activeTab === "call" ? (
          !simulationProps.inCall ? (
            /* Incoming / Call Idle State */
            <div className="flex-1 min-h-0 p-5 flex flex-col items-center justify-center text-center gap-3.5 bg-canvas">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-accent-soft text-primary flex items-center justify-center font-semibold text-xl ring-2 ring-primary/20">
                  S
                </div>
                <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-ok-fg border-2 border-card flex items-center justify-center text-[9px] text-white">
                  <Icon name="check" size={9} />
                </span>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-fg tracking-tight leading-tight">Sahyadri Voice Agent</h3>
                <p className="font-mono text-xs text-primary font-medium mt-1">1800-209-4000 · Verified Banking</p>
                <p className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-md bg-sunken border border-line font-mono text-[11px] text-fg">
                  <span>{simulationProps.personaName}</span>
                  <span className="text-muted">·</span>
                  <span className="text-muted">{simulationProps.personaPhone}</span>
                </p>
                <p className="text-xs text-muted mt-2 max-w-[260px] leading-relaxed">
                  Borrower phone view: voice call with synced SMS and out-of-band in-app approvals.
                </p>
              </div>

              <div className="pt-2 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={simulationProps.start}
                  disabled={simulationProps.status === "connecting"}
                  className="w-14 h-14 rounded-full bg-ok-fg hover:bg-ok-fg/90 text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer ring-2 ring-ok-border disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ok-fg"
                  title="Answer / Start Call"
                >
                  <Icon name="phone_in_talk" size={22} />
                </button>
                <span className="text-xs font-medium text-fg">
                  {simulationProps.status === "connecting"
                    ? "Connecting Call…"
                    : simulationProps.ended
                    ? "Tap to Start New Call"
                    : "Tap to Call Agent"}
                </span>
              </div>
            </div>
          ) : (
            /* Live Call In-Progress View */
            <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden bg-canvas">
              {/* Call Status Ribbon */}
              <div className="bg-sunken px-3.5 py-1.5 border-b border-line flex items-center justify-between text-[11px] shrink-0">
                <div className="flex items-center gap-1.5 text-fg font-medium">
                  <span className="w-2 h-2 rounded-full bg-ok-fg animate-pulse"></span>
                  <span className="font-mono tabular-nums">{fmtDur(simulationProps.callDuration)}</span>
                  <span className="text-muted">· HD Audio</span>
                </div>
                <span className="text-[10px] font-mono text-primary font-medium">Zero Secrets</span>
              </div>

              {/* Clean Transcript Area (NO TIMINGS OR TELEMETRY VISIBLE) */}
              <div className="flex-1 min-h-0 p-3 space-y-2.5 overflow-y-auto overscroll-contain">
                {simulationProps.msgs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted text-xs">
                    <p className="text-sm text-fg font-semibold mb-1">Call Connected</p>
                    <p className="max-w-[220px]">Hold the mic button below (or Spacebar) to speak with the banking assistant.</p>
                  </div>
                ) : (
                  simulationProps.msgs.map((m, i) => (
                    <div
                      key={i}
                      className={`flex flex-col gap-1 max-w-[88%] ${
                        m.who === "caller" ? "items-end self-end" : "items-start"
                      }`}
                    >
                      <span className="text-[10px] text-muted font-medium">
                        {m.who === "caller" ? simulationProps.personaName : "Sahyadri Agent"}
                      </span>
                      <div
                        className={`px-3 py-2 rounded-lg text-xs leading-[1.6] ${
                          m.who === "caller"
                            ? "bg-primary text-primary-fg"
                            : "bg-card border border-line text-fg"
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))
                )}

                {/* In-Call Pending Approval Card if any */}
                {pending && (
                  <div className="enter rounded-lg border border-warn-border bg-warn-bg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn-border/60 text-warn-fg font-mono text-[10px] font-semibold">
                        <Icon name="shield" size={11} />
                        In-Call Authorization Needed
                      </span>
                    </div>
                    <p className="text-xs font-medium text-fg leading-snug">{pending.purpose}</p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        small
                        disabled={busy}
                        onClick={() => act(pending.id, "approve")}
                        className="w-full text-center justify-center font-semibold text-xs"
                      >
                        Approve (Tap)
                      </Button>
                      <Button
                        small
                        variant="secondary"
                        disabled={busy}
                        onClick={() => act(pending.id, "deny")}
                        className="w-full text-center justify-center font-semibold text-xs border-danger-line text-danger-fg"
                      >
                        Deny
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Prompts Carousel */}
              <div className="px-3 pt-2 pb-1.5 border-t border-line bg-card flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
                <span className="text-[10px] text-muted font-medium shrink-0">Tap:</span>
                {simulationProps.quickPrompts.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={simulationProps.busy}
                    onClick={() => simulationProps.sendTextVal(q)}
                    className="shrink-0 px-2 py-1 rounded-md bg-sunken hover:bg-card text-fg text-[11px] border border-line cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* In-Call Controls Deck */}
              <div className="p-2.5 bg-card border-t border-line flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-center gap-5">
                  {/* Keyboard toggle */}
                  {simulationProps.setText && (
                    <button
                      type="button"
                      onClick={() => setShowKeyboard(!showKeyboard)}
                      aria-pressed={showKeyboard}
                      className={`p-2 rounded-full border ${
                        showKeyboard
                          ? "bg-primary text-primary-fg border-primary"
                          : "bg-sunken text-muted border-line hover:text-fg"
                      } transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                      title="Type Hinglish / English"
                    >
                      <Icon name="inbox" size={15} />
                    </button>
                  )}

                  {/* Circular Hold to Talk button */}
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      {...simulationProps.talkProps}
                      disabled={simulationProps.busy}
                      aria-pressed={simulationProps.listening}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        simulationProps.listening
                          ? "bg-primary text-primary-fg ring-4 ring-primary/30 scale-105"
                          : simulationProps.busy
                          ? "bg-sunken text-muted border border-line cursor-wait"
                          : "bg-primary hover:bg-accent-hover text-primary-fg ring-2 ring-primary/20 active:scale-95"
                      } disabled:opacity-50`}
                      title="Hold to talk (or hold Spacebar)"
                    >
                      <Icon name={simulationProps.listening ? "mic" : simulationProps.busy ? "speed" : "mic"} size={20} />
                    </button>
                    <span className="text-[10px] text-muted font-medium mt-1">
                      {simulationProps.listening ? "Release to Send" : simulationProps.busy ? "Thinking…" : "Hold to Talk"}
                    </span>
                  </div>

                  {/* End call circular button */}
                  <button
                    type="button"
                    onClick={simulationProps.end}
                    className="w-9 h-9 rounded-full bg-danger-bg hover:bg-danger-line/40 text-danger-fg border border-danger-line flex items-center justify-center cursor-pointer active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-fg"
                    title="End Call"
                  >
                    <Icon name="x" size={15} />
                  </button>
                </div>

                {/* Optional Keyboard bar */}
                {showKeyboard && simulationProps.setText && simulationProps.sendText && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      simulationProps.sendText?.();
                    }}
                    className="relative w-full flex items-center pt-1"
                  >
                    <input
                      type="text"
                      value={simulationProps.text ?? ""}
                      onChange={(e) => simulationProps.setText?.(e.target.value)}
                      placeholder="Type message..."
                      className="w-full pl-3 pr-16 py-1.5 rounded-md bg-sunken text-fg text-xs border border-line focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="submit"
                      disabled={!simulationProps.text?.trim()}
                      className="absolute right-1 px-2.5 py-1 rounded bg-card text-fg text-[11px] font-semibold border border-line disabled:opacity-40 cursor-pointer"
                    >
                      Send
                    </button>
                  </form>
                )}
              </div>
            </div>
          )
        ) : (
          /* STANDARD BANK APP VIEW: SMS INBOX & APPROVALS */
          <>
            {/* App Header */}
            <div className="px-4 py-2.5 bg-card border-b border-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-md bg-primary text-primary-fg flex items-center justify-center font-semibold text-xs shrink-0">
                  S
                </div>
                <div className="min-w-0">
                  <h3 className="text-fg text-sm leading-tight font-semibold tracking-tight truncate">
                    Sahyadri Mobile
                  </h3>
                  <p className="font-mono text-muted text-[10px] truncate">
                    {me.data ? `${me.data.name} · ${me.data.mobile_masked}` : "Sahyadri customer"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-ok-bg text-ok-fg text-[10px] font-mono font-medium border border-ok-border shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-ok-fg"></span>
                <span>Synced</span>
              </div>
            </div>

            {/* In-Call Active Floating Strip */}
            {simulationProps?.inCall && (
              <button
                type="button"
                onClick={() => setActiveTab("call")}
                className="w-full bg-ok-bg text-ok-fg px-4 py-1.5 border-b border-ok-border flex items-center justify-between text-xs font-semibold cursor-pointer shrink-0 hover:bg-ok-border/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-ok-fg animate-pulse"></span>
                  <span className="tabular-nums">Call in progress ({fmtDur(simulationProps.callDuration)})</span>
                </span>
                <span className="text-[11px] font-mono underline">Return to Call →</span>
              </button>
            )}

            {/* Realtime Channel Link Strip */}
            <div className="bg-sunken px-4 py-1.5 border-b border-line flex items-center justify-between text-[11px] text-muted shrink-0">
              <span className="flex items-center gap-1.5 font-medium">
                <Icon name="sync" size={12} />
                Voice desk paired, refreshes every 3 s
              </span>
              <span className="font-mono text-[10px] text-primary font-semibold">Polling</span>
            </div>

            {/* Scrollable Main Area */}
            <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-3.5 overscroll-contain bg-canvas">
              <ErrorBox error={err} />

              {/* PINNED IN-APP TIER 2 APPROVAL CARD */}
              {pending && (
                <section
                  key={pending.id}
                  aria-labelledby="ap"
                  className="enter rounded-lg border border-warn-border bg-warn-bg p-3 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn-border/60 text-warn-fg font-mono text-[10px] font-semibold">
                      <Icon name="shield" size={11} />
                      In-Call Authorization Needed
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex-1">
                      <h4 id="ap" className="text-sm font-semibold text-fg leading-snug">
                        {pending.purpose}
                      </h4>
                      <p className="text-[11px] text-muted mt-1 leading-relaxed">
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
                      className="w-full h-9 text-center justify-center font-semibold text-xs"
                    >
                      <Icon name="check" size={14} />
                      Approve (Tap)
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => act(pending.id, "deny")}
                      className="w-full h-9 text-center justify-center font-semibold text-xs border-danger-line text-danger-fg hover:bg-danger-bg"
                    >
                      <Icon name="x" size={14} />
                      Deny
                    </Button>
                  </div>

                  <div className="mt-2 pt-2 border-t border-warn-border/40 text-[10px] text-muted text-center">
                    Zero Secrets: Sahyadri never asks you to speak OTP or MPIN numbers aloud.
                  </div>
                </section>
              )}

              {/* OFFICIAL SMS INBOX */}
              <section aria-labelledby="sm">
                <div className={h2} id="sm">
                  <span className="flex items-center gap-1.5 text-fg">
                    <Icon name="inbox" size={13} />
                    Official Bank SMS Inbox
                  </span>
                  <span className="font-mono text-[10px] text-muted font-normal">Bank Secure</span>
                </div>

                {sms.loading ? (
                  <Skeleton rows={2} />
                ) : !sms.data?.length ? (
                  <Empty icon="inbox">No messages yet. Texts sent during a call appear here.</Empty>
                ) : (
                  <ul className="space-y-2">
                    {[...sms.data]
                      .sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((m, i) => (
                        <li
                          key={m.id}
                          className="enter rounded-lg border border-line bg-card p-3"
                          style={stagger(i)}
                        >
                          <div className="flex items-center justify-between text-xs text-muted font-mono tabular-nums mb-1">
                            <span className="font-semibold text-primary">VK-SAHYADRI</span>
                            <span className="text-[10px]">{fmtTime(m.created_at)}</span>
                          </div>
                          <p className="text-xs text-fg leading-[1.6]">{m.body}</p>
                          <button
                            type="button"
                            onClick={() => copyText(m.body, m.id)}
                            className="mt-2 text-[11px] text-primary hover:text-accent-hover font-medium inline-flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                          >
                            <Icon name="copy" size={11} />
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
                  <ul className="divide-y divide-line rounded-lg border border-line bg-card text-xs">
                    {[...appr.data]
                      .sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block font-medium text-fg">{a.purpose}</span>
                            <span className="font-mono tabular-nums text-[10px] text-muted">{fmtTime(a.created_at)}</span>
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
          </>
        )}

        {/* Mobile App Bottom Nav Bar (when not in call screen) */}
      {(!simulationProps || activeTab === "app") && (
        <div className="bg-card px-6 py-2 border-t border-line flex items-center justify-between text-muted text-[10px] shrink-0">
          <div className="flex flex-col items-center gap-0.5 text-primary font-semibold">
            <Icon name="home" size={14} />
            <span>Home</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Icon name="wallet" size={14} />
            <span>Loans</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Icon name="phone" size={14} />
            <span>Support</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Icon name="shield" size={14} />
            <span>Security</span>
          </div>
        </div>
      )}

        {/* Home Indicator */}
        <div className="w-full pb-1 pt-1 bg-card flex justify-center shrink-0">
          <div className="w-32 h-1 bg-outline-variant rounded-full"></div>
        </div>
      </div>
    </div>
  );

  // Embedded (sidecar or call-desk simulation) lives inside the desk's <main>: no nested main / full-height wrapper.
  if (isSidecar || simulationProps) {
    return chassis;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sunken p-4 sm:p-6">
      {chassis}
    </main>
  );
}

export default function PhoneApp() {
  return (
    <>
      <div className="fixed left-4 right-4 top-4 z-10 flex justify-between text-xs font-medium">
        <Link href="/call" className="rounded-lg border border-line bg-card px-3 py-1.5 text-fg">Call the voice desk</Link>
        <SignOut door="customer" className="rounded-lg border border-line bg-card px-3 py-1.5 text-fg" />
      </div>
      <PhoneHandset />
    </>
  );
}
