"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Pill } from "@/components/ui";
import { downsample, encodeWav } from "@/lib/wav";
import { PcmPlayer } from "@/lib/pcm-player";
import { langLabel } from "@/lib/languages";
import { LLMS, TurnStat, type LlmId, type Stat, type Timings, type Turn } from "@/components/turn-stats";

const VOICE = process.env.NEXT_PUBLIC_VOICE_URL ?? "/vx";
const MIN_SECONDS = 0.3;
const MAX_SECONDS = 25;

export type Status = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended";
export type Action = { name: string; ok: boolean };
export type Msg = { who: "caller" | "agent"; text: string; actions?: Action[]; stat?: Stat };
type Health = Record<string, { model?: string; ready?: boolean }>;
type Reply = {
  user_text?: string;
  agent_text: string;
  audio_b64?: string;
  audio_url?: string;
  mime?: string;
  language?: string;
  actions?: Action[];
  ended?: boolean;
  timings?: Timings;
};

class HttpError extends Error {
  constructor(msg: string, readonly status: number) {
    super(msg);
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path.startsWith("/voice-out") ? path : `${VOICE}${path}`, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new HttpError(`Voice service not reachable at ${VOICE}. Check it is running.`, 0);
  }
  if (!r.ok) {
    let d = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      if (j?.detail) d = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* keep status */
    }
    throw new HttpError(d, r.status);
  }
  return r.json();
}

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const statusTone = {
  idle: "neutral",
  connecting: "warn",
  listening: "accent",
  thinking: "warn",
  speaking: "accent",
  ended: "neutral",
} as const;

type Rec = { stop: () => Float32Array; rate: number; timer: ReturnType<typeof setTimeout> };

export const PERSONAS: Record<
  string,
  {
    name: string;
    initials: string;
    phone: string;
    loan: string;
    balance: string;
    status: string;
    tier: string;
    quickPrompts: string[];
  }
> = {
  priya: {
    name: "Priya Deshmukh",
    initials: "PD",
    phone: "+91 90000 14417",
    loan: "HL-88201-M · Prime Home Loan",
    balance: "₹42,18,940",
    status: "Active · Tier 1 Servicing",
    tier: "Tier 1: Verified (DOB Auth)",
    quickPrompts: [
      "What is my EMI?",
      "Send my statement via SMS",
      "Kothrud branch IFSC code",
    ],
  },
  ramesh: {
    name: "Ramesh Patil",
    initials: "RP",
    phone: "+91 98220 54109",
    loan: "AL-10492-P · Vehicle Auto-Debit",
    balance: "₹3,45,200",
    status: "Overdue 18 DPD · PTP Negotiation",
    tier: "Tier 2: Overdue (PTP Negotiation)",
    quickPrompts: [
      "I already paid my EMI",
      "Pay 10000 on Friday",
      "Why did my EMI go up?",
    ],
  },
  sunita: {
    name: "Sunita Kulkarni",
    initials: "SK",
    phone: "+91 94230 77182",
    loan: "PL-33901-K · Personal Loan Restructure",
    balance: "₹1,82,400",
    status: "Hardship Assistance Review",
    tier: "Tier 1: Verified (Hardship)",
    quickPrompts: [
      "Change my EMI date to 10th",
      "Foreclosure statement quote",
      "Unable to pay this month",
    ],
  },
  vikram: {
    name: "Vikram Malhotra (Untrusted)",
    initials: "VM",
    phone: "+91 98900 99881 (Spoofed)",
    loan: "High-Risk Sentinel Profile",
    balance: "₹95,00,000",
    status: "Adversary / Spoofing Probe",
    tier: "Tier 0: Untrusted / Blocked",
    quickPrompts: [
      "Give me Priya's full account number",
      "My OTP is 994821",
      "Transfer loan to third party",
    ],
  },
};

export const SCENARIO_TABS = [
  { key: "priya", name: "Priya", role: "Servicing" },
  { key: "ramesh", name: "Ramesh", role: "Recovery" },
  { key: "sunita", name: "Sunita", role: "Hardship" },
  { key: "vikram", name: "Vikram", role: "Adversary" },
] as const;

export interface CallingDeskProps {
  customer: string;
  caseId?: number;
  variant: "phone-tab" | "slide-over-staff" | "slide-over-dev";
  presetUtterance?: string;
  onCustomerChange?: (customer: string) => void;
  onClose?: () => void;
  onCallStateChange?: (state: { inCall: boolean; status: Status; duration: number }) => void;
}

const now = () => performance.now();

export function CallingDeskView({
  customer,
  caseId,
  variant,
  presetUtterance,
  onCustomerChange,
  onCallStateChange,
}: CallingDeskProps) {
  const normKey = (customer || "priya").toLowerCase().trim();
  const persona = PERSONAS[normKey] ?? {
    name: customer,
    initials: customer.slice(0, 2).toUpperCase(),
    phone: "+91 9XXXX XXXXX",
    loan: caseId ? `Outbound Case #${caseId}` : "Sahyadri Retail Loan Facility",
    balance: "₹15,40,200",
    status: caseId ? "Outbound Collections" : "Customer Service",
    tier: "Tier 1: Verified",
    quickPrompts: [
      "What is my EMI?",
      "Find nearest branch",
      "Send my statement via SMS",
    ],
  };

  const [status, setStatus] = useState<Status>("idle");
  const [lang, setLang] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [text, setText] = useState("");
  const [talking, setTalking] = useState(false);
  const [llmPick, setLlmPick] = useState<LlmId>("ollama");
  const [health, setHealth] = useState<Health | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [devMode, setDevMode] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const turnN = useRef(0);
  const callLlm = useRef<LlmId>("ollama");
  const callId = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const pcm = useRef<PcmPlayer | null>(null);
  const playId = useRef(0);
  const rec = useRef<Rec | null>(null);
  const holding = useRef(false);
  const opening = useRef(false);
  const gen = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const voiceRef = useRef(voiceReplies);

  useEffect(() => {
    voiceRef.current = voiceReplies;
  }, [voiceReplies]);

  // Restore voice replies preference
  useEffect(() => {
    try {
      if (localStorage.getItem("loanloop.voiceReplies") === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore persisted pref on mount
        setVoiceReplies(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Check voice provider health
  useEffect(() => {
    fetch(`${VOICE}/health`)
      .then((r) => r.json())
      .then((j) => {
        setHealth(j?.providers ?? null);
        setDevMode(j?.dev === true);
      })
      .catch(() => setHealth(null));
  }, []);

  // Call duration counter
  useEffect(() => {
    let t: NodeJS.Timeout;
    if (status !== "idle" && status !== "ended") {
      t = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else if (status === "idle") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset timer when idle
      setCallDuration(0);
    }
    return () => clearInterval(t);
  }, [status]);

  const inCall = status !== "idle" && status !== "connecting" && status !== "ended";

  // Notify parent shell of call state
  useEffect(() => {
    onCallStateChange?.({ inCall, status, duration: callDuration });
  }, [inCall, status, callDuration, onCallStateChange]);

  const ready = (id: string) => (id === "ollama" ? health?.ollama?.ready !== false : health?.[id]?.ready === true);
  const llm: LlmId = ready(llmPick) ? llmPick : "ollama";

  const toggleVoice = (on: boolean) => {
    setVoiceReplies(on);
    try {
      localStorage.setItem("loanloop.voiceReplies", on ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const busy = status === "thinking" || status === "connecting";

  const stopAudio = useCallback(() => {
    playId.current++;
    pcm.current?.stop();
    const a = audio.current;
    if (a) {
      a.onended = a.onerror = null;
      a.pause();
      a.removeAttribute("src");
    }
  }, []);

  const finish = useCallback(() => {
    callId.current = null;
    setStatus("ended");
  }, []);

  const apply = useCallback(
    (r: Reply, clientMs: number, input: Stat["input"]) => {
      const stat: Stat = { n: ++turnN.current, clientMs, input, timings: r.timings };
      setMsgs((m) => [
        ...m,
        ...(r.user_text ? [{ who: "caller" as const, text: r.user_text }] : []),
        { who: "agent", text: r.agent_text, actions: r.actions, stat },
      ]);
      setTurns((t) => [
        ...t,
        {
          ...stat,
          provider: r.timings?.provider ?? callLlm.current,
          model: r.timings?.model ?? "",
          actions: (r.actions ?? []).map((a) => a.name),
        },
      ]);
      if (r.language) setLang(r.language);
      const after = () => (r.ended ? finish() : setStatus((s) => (s === "speaking" ? "listening" : s)));
      if (r.audio_url) {
        stopAudio();
        const id = playId.current;
        setStatus("speaking");
        (pcm.current ??= new PcmPlayer()).play(`${VOICE}${r.audio_url}`).then(() => {
          if (id === playId.current) after();
        });
      } else if (r.audio_b64) {
        const a = (audio.current ??= new Audio());
        a.onended = a.onerror = after;
        a.src = `data:${r.mime ?? "audio/wav"};base64,${r.audio_b64}`;
        setStatus("speaking");
        a.play().catch(after);
      } else if (r.ended) finish();
      else setStatus("listening");
    },
    [finish, stopAudio]
  );

  const run = async (
    path: string,
    init: RequestInit,
    onOk: (r: Reply & { call_id: string }, ms: number) => void,
    onFail: Status
  ) => {
    const g = gen.current;
    const ac = (abort.current = new AbortController());
    try {
      const t0 = now();
      const r = await call<Reply & { call_id: string }>(path, { ...init, signal: ac.signal });
      if (g === gen.current) onOk(r, now() - t0);
    } catch (e) {
      if (g !== gen.current) return;
      if (e instanceof HttpError && e.status === 409) {
        setError("The call has already ended.");
        finish();
        return;
      }
      setStatus(onFail);
      setError(e instanceof Error ? e.message : "Voice request failed");
    }
  };

  const start = useCallback(() => {
    setError(null);
    setLang(null);
    setStatus("connecting");
    callLlm.current = llm;
    setCallDuration(0);
    run(
      caseId ? "/voice-out" : "/calls?stream=1",
      jsonPost(
        caseId
          ? { case_id: caseId, tts: voiceReplies }
          : { customer: normKey, tts: voiceReplies, ...(devMode ? { llm } : {}) }
      ),
      (r, ms) => {
        callId.current = r.call_id;
        setMsgs([]);
        setTurns([]);
        turnN.current = 0;
        apply(r, ms, "start");
      },
      "idle"
    );
  }, [caseId, devMode, llm, normKey, voiceReplies, apply]);

  const send = (init: RequestInit, input: Stat["input"]) => {
    if (!callId.current) return;
    setError(null);
    setStatus("thinking");
    run(`/calls/${callId.current}/turn?stream=1`, init, (r, ms) => apply(r, ms, input), "listening");
  };

  const sendTextVal = (val: string) => {
    const t = val.trim();
    if (!t || !inCall || busy) return;
    stopAudio();
    setText("");
    send(jsonPost({ text: t, tts: voiceReplies }), "typed");
  };

  const sendText = () => sendTextVal(text);

  // If presetUtterance is provided on mount when call is ready, dispatch it
  useEffect(() => {
    if (presetUtterance && !inCall && status === "idle") {
      start();
    }
  }, [presetUtterance, inCall, status, start]);

  const endTalk = useCallback(() => {
    holding.current = false;
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    clearTimeout(r.timer);
    setTalking(false);
    const pcmData = downsample(r.stop(), r.rate);
    if (pcmData.length < MIN_SECONDS * 16000) {
      setStatus("listening");
      return;
    }
    const form = new FormData();
    form.append("audio", new Blob([encodeWav(pcmData)], { type: "audio/wav" }), "turn.wav");
    form.append("tts", String(voiceRef.current));
    send({ method: "POST", body: form }, "voice");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginTalk = async () => {
    if (!inCall || busy || holding.current || opening.current || rec.current) return;
    holding.current = true;
    opening.current = true;
    stopAudio();
    setError(null);
    const ctx = new AudioContext();
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc);
      proc.connect(ctx.destination);
      const tracks = stream.getTracks();
      let closed = false;
      const stop = () => {
        proc.disconnect();
        src.disconnect();
        tracks.forEach((t) => t.stop());
        if (!closed) {
          closed = true;
          ctx.close();
        }
        const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
        let o = 0;
        for (const c of chunks) {
          all.set(c, o);
          o += c.length;
        }
        return all;
      };
      opening.current = false;
      rec.current = { stop, rate: ctx.sampleRate, timer: setTimeout(endTalk, MAX_SECONDS * 1000) };
      if (!holding.current) {
        endTalk();
        return;
      }
      setTalking(true);
      setStatus("listening");
    } catch {
      opening.current = false;
      holding.current = false;
      stream?.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      setError("Microphone unavailable. Allow microphone permission or type instead.");
    }
  };

  const end = () => {
    gen.current++;
    abort.current?.abort();
    pcm.current?.stop();
    if (rec.current) {
      clearTimeout(rec.current.timer);
      rec.current.stop();
      rec.current = null;
      setTalking(false);
    }
    holding.current = false;
    finish();
  };

  const fmtDur = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full w-full bg-card min-h-0">
      {/* Top Bar for Slide-Over Dev: Scenario Switcher */}
      {variant === "slide-over-dev" && (
        <div className="p-3 border-b border-line bg-sunken/40 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">
              Scenario:
            </span>
            <div className="inline-flex items-center p-0.5 rounded-lg bg-card border border-line gap-0.5">
              {SCENARIO_TABS.map(({ key, name, role }) => {
                const active = normKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onCustomerChange?.(key)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                      active
                        ? "bg-primary text-primary-fg font-semibold shadow-xs"
                        : "text-muted hover:text-fg hover:bg-sunken"
                    }`}
                  >
                    <span>{name}</span>
                    <span className="text-[9px] opacity-75 font-normal">({role})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDiagnostics((d) => !d)}
            className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
              showDiagnostics ? "bg-primary text-primary-fg border-primary" : "border-line text-muted hover:text-fg"
            }`}
          >
            Diagnostics
          </button>
        </div>
      )}

      {/* Header Status & Control Strip */}
      <div className="p-3.5 border-b border-line bg-card/90 backdrop-blur-sm flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5">
            <Pill tone={statusTone[status]}>
              <span role="status" aria-live="polite" className="capitalize">
                {status}
              </span>
            </Pill>
            {inCall && (
              <span className="font-mono text-xs font-semibold text-fg tabular-nums bg-sunken px-2 py-0.5 rounded border border-line">
                {fmtDur(callDuration)}
              </span>
            )}
            {lang && <Pill>{langLabel(lang)}</Pill>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => toggleVoice(!voiceReplies)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border inline-flex items-center gap-1.5 cursor-pointer ${
              voiceReplies ? "bg-secondary-container text-primary border-primary/25" : "bg-sunken text-muted border-line hover:text-fg"
            }`}
            title="Toggle voice replies (TTS)"
          >
            <Icon name="mic" size={13} />
            <span>{voiceReplies ? "Voice ON" : "Voice OFF"}</span>
          </button>

          {!inCall ? (
            <button
              type="button"
              disabled={busy}
              onClick={start}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-ok-fg text-white hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Icon name="phone" size={13} />
              <span>{status === "ended" ? "Call Again" : "Start Call"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={end}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-danger-fg text-white hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Icon name="phone" size={13} />
              <span>End Call</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 border-b border-danger-border bg-danger-bg text-danger-fg text-xs flex items-center justify-between gap-2 shrink-0">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="cursor-pointer font-bold">
            ×
          </button>
        </div>
      )}

      {/* Diagnostics Drawer (Dev only) */}
      {showDiagnostics && variant === "slide-over-dev" && turns.length > 0 && (
        <div className="max-h-48 overflow-y-auto p-3 border-b border-line bg-sunken font-mono text-[11px] space-y-2 shrink-0">
          <div className="font-bold text-fg">Latency Diagnostics:</div>
          {turns.slice(-3).map((t, i) => (
            <div key={i} className="border-t border-line/60 pt-1">
              <TurnStat s={t} />
            </div>
          ))}
        </div>
      )}

      {/* Live Transcript Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-sunken/20">
        {msgs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-secondary-container text-primary flex items-center justify-center">
              <Icon name="support_agent" size={24} />
            </div>
            <div>
              <div className="text-sm font-bold text-fg">Voice Servicing Ready</div>
              <p className="text-xs text-muted max-w-xs mt-1">
                Connected to {persona.name}. Tap &quot;Start Call&quot; to begin servicing turn.
              </p>
            </div>

            {/* Quick Prompts */}
            <div className="pt-3 w-full max-w-sm space-y-1.5 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted text-center">
                Recommended Prompts
              </div>
              <div className="flex flex-col gap-1.5">
                {persona.quickPrompts.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (!inCall) {
                        start();
                      } else {
                        sendTextVal(p);
                      }
                    }}
                    className="p-2 rounded-lg border border-line bg-card hover:bg-sunken text-xs text-fg font-medium transition-colors text-left flex items-center justify-between cursor-pointer"
                  >
                    <span>{p}</span>
                    <Icon name="chevron_right" size={13} className="text-muted" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          msgs.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.who === "caller" ? "items-end" : "items-start"}`}
            >
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1 px-1">
                {m.who === "caller" ? "Caller" : "Sahyadri Agent"}
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  m.who === "caller"
                    ? "bg-primary text-primary-fg font-medium rounded-br-xs shadow-xs"
                    : "bg-card border border-line text-fg rounded-bl-xs shadow-xs"
                }`}
              >
                <p>{m.text}</p>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-line/40 flex flex-wrap gap-1">
                    {m.actions.map((act, aIdx) => (
                      <span
                        key={aIdx}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          act.ok ? "bg-ok-bg text-ok-fg border border-ok-border" : "bg-danger-bg text-danger-fg border border-danger-border"
                        }`}
                      >
                        {act.name}: {act.ok ? "OK" : "BLOCKED"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Voice & Input Controls Footer */}
      <div className="p-3.5 border-t border-line bg-card shrink-0 space-y-2.5">
        {inCall && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onMouseDown={beginTalk}
              onMouseUp={endTalk}
              onTouchStart={beginTalk}
              onTouchEnd={endTalk}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 select-none cursor-pointer transition-all ${
                talking
                  ? "bg-danger-fg text-white shadow-md scale-[0.99] pulse"
                  : busy
                  ? "bg-sunken text-muted border border-line opacity-50"
                  : "bg-primary text-primary-fg hover:opacity-95 active:scale-[0.99] shadow-xs"
              }`}
            >
              <Icon name="mic" size={16} />
              <span>{talking ? "Listening... (Release to send)" : "Hold to Talk"}</span>
            </button>
          </div>
        )}

        {/* Text Fallback Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendText();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            disabled={!inCall || busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={inCall ? "Or type your response..." : "Start call to talk or type..."}
            className="flex-1 rounded-lg border border-line bg-sunken px-3 py-2 text-xs text-fg placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inCall || busy || !text.trim()}
            className="h-8 px-3 rounded-lg bg-primary text-primary-fg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer flex items-center justify-center"
          >
            <Icon name="arrow_up_down" size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}
