"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Pill } from "@/components/ui";
import { downsample, encodeWav } from "@/lib/wav";
import { PcmPlayer } from "@/lib/pcm-player";
import { LLMS, SessionSummary, TurnStat, type LlmId, type Stat, type Timings, type Turn } from "@/components/turn-stats";

const VOICE = process.env.NEXT_PUBLIC_VOICE_URL ?? "http://127.0.0.1:8100";
const MIN_SECONDS = 0.3;
const MAX_SECONDS = 25;

type Status = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended";
type Action = { name: string; ok: boolean };
type Msg = { who: "caller" | "agent"; text: string; actions?: Action[]; stat?: Stat };
type Health = Record<string, { model?: string; ready?: boolean }>;
type Reply = { user_text?: string; agent_text: string; audio_b64?: string; audio_url?: string; mime?: string; language?: string; actions?: Action[]; ended?: boolean; timings?: Timings };

class HttpError extends Error { constructor(msg: string, readonly status: number) { super(msg); } }

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(path.startsWith("/voice-out") ? path : `${VOICE}${path}`, init); // /voice-out: same-origin route that adds the ops token
  if (!r.ok) {
    let d = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.detail) d = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* keep status */ }
    throw new HttpError(d, r.status);
  }
  return r.json();
}
const jsonPost = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const statusTone = { idle: "neutral", connecting: "warn", listening: "accent", thinking: "warn", speaking: "accent", ended: "neutral" } as const;

type Rec = { stop: () => Float32Array; rate: number; timer: ReturnType<typeof setTimeout> };

export default function CallApp({ customer, caseId }: { customer: string; caseId?: number }) {
  const [status, setStatus] = useState<Status>("idle");
  const [lang, setLang] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(false); // off by default: saves Gnani TTS credits
  const [text, setText] = useState("");
  const [talking, setTalking] = useState(false);
  const [llmPick, setLlmPick] = useState<LlmId>("ollama");
  const [health, setHealth] = useState<Health | null>(null); // null = /health has no providers field (or failed): Local only
  const [turns, setTurns] = useState<Turn[]>([]);
  const [devMode, setDevMode] = useState(false); // LLM switch only when /health says dev
  const turnN = useRef(0);
  const callLlm = useRef<LlmId>("ollama"); // fallback provider tag when the server sends no timings
  const callId = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const pcm = useRef<PcmPlayer | null>(null);
  const playId = useRef(0);
  const rec = useRef<Rec | null>(null);
  const holding = useRef(false);   // talk control is currently pressed
  const opening = useRef(false);   // getUserMedia in flight
  const gen = useRef(0);           // bumped on end/unmount so late responses are ignored
  const abort = useRef<AbortController | null>(null);
  const voiceRef = useRef(voiceReplies);
  voiceRef.current = voiceReplies; // eslint-disable-line react-hooks/refs -- latest value for timer/handler closures
  useEffect(() => { // restore after mount (avoids a hydration mismatch)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage after mount
    try { if (localStorage.getItem("loanloop.voiceReplies") === "1") setVoiceReplies(true); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage after mount
    try { const v = localStorage.getItem("loanloop.llm"); if (LLMS.some((l) => l.id === v)) setLlmPick(v as LlmId); } catch { /* storage blocked */ }
    fetch(`${VOICE}/health`).then((r) => r.json()).then((j) => { setHealth(j?.providers ?? null); setDevMode(j?.dev === true); }).catch(() => setHealth(null));
  }, []);
  const ready = (id: string) => (id === "ollama" ? health?.ollama?.ready !== false : health?.[id]?.ready === true);
  const llm: LlmId = ready(llmPick) ? llmPick : "ollama";
  const pickLlm = (v: LlmId) => {
    setLlmPick(v);
    try { localStorage.setItem("loanloop.llm", v); } catch { /* storage blocked */ }
  };
  const toggleVoice = (on: boolean) => {
    setVoiceReplies(on);
    try { localStorage.setItem("loanloop.voiceReplies", on ? "1" : "0"); } catch { /* storage blocked */ }
  };
  const ended = status === "ended";
  const inCall = status !== "idle" && status !== "connecting" && !ended;
  const busy = status === "thinking" || status === "connecting";

  const stopAudio = useCallback(() => { playId.current++; pcm.current?.stop(); const a = audio.current; if (a) { a.onended = a.onerror = null; a.pause(); a.removeAttribute("src"); } }, []);

  const finish = useCallback(() => { callId.current = null; setStatus("ended"); }, []);

  const apply = useCallback((r: Reply, clientMs: number, input: Stat["input"]) => {
    const stat: Stat = { n: ++turnN.current, clientMs, input, timings: r.timings };
    setMsgs((m) => [
      ...m,
      ...(r.user_text ? [{ who: "caller" as const, text: r.user_text }] : []),
      { who: "agent", text: r.agent_text, actions: r.actions, stat },
    ]);
    setTurns((t) => [...t, { ...stat, provider: r.timings?.provider ?? callLlm.current, model: r.timings?.model ?? "", actions: (r.actions ?? []).map((a) => a.name) }]);
    if (r.language) setLang(r.language);
    const after = () => (r.ended ? finish() : setStatus((s) => (s === "speaking" ? "listening" : s)));
    if (r.audio_url) {
      stopAudio();
      const id = playId.current;
      setStatus("speaking");
      (pcm.current ??= new PcmPlayer()).play(`${VOICE}${r.audio_url}`).then(() => { if (id === playId.current) after(); });
    } else if (r.audio_b64) {
      const a = (audio.current ??= new Audio());
      a.onended = a.onerror = after;
      a.src = `data:${r.mime ?? "audio/wav"};base64,${r.audio_b64}`;
      setStatus("speaking");
      a.play().catch(after); // autoplay blocked: text is still shown
    } else if (r.ended) finish();
    else setStatus("listening");
  }, [finish, stopAudio]);

  // Runs a request; drops the result if the call was ended meanwhile.
  const run = async (path: string, init: RequestInit, onOk: (r: Reply & { call_id: string }, ms: number) => void, onFail: Status) => {
    const g = gen.current, ac = (abort.current = new AbortController());
    try {
      const t0 = performance.now(); // request sent (for audio: upload start)
      const r = await call<Reply & { call_id: string }>(path, { ...init, signal: ac.signal });
      if (g === gen.current) onOk(r, performance.now() - t0);
    } catch (e) {
      if (g !== gen.current) return;
      if (e instanceof HttpError && e.status === 409) { setError("The call has already ended."); finish(); return; }
      setStatus(onFail); setError(e instanceof Error ? e.message : "failed");
    }
  };

  const start = () => {
    setError(null); setStatus("connecting"); callLlm.current = llm;
    run(caseId ? "/voice-out" : "/calls?stream=1", jsonPost(caseId ? { case_id: caseId, tts: voiceReplies } : { customer, tts: voiceReplies, ...(devMode ? { llm } : {}) }), (r, ms) => { callId.current = r.call_id; setMsgs([]); setTurns([]); turnN.current = 0; apply(r, ms, "start"); }, "idle");
  };

  const send = (init: RequestInit, input: Stat["input"]) => {
    if (!callId.current) return;
    setError(null); setStatus("thinking");
    run(`/calls/${callId.current}/turn?stream=1`, init, (r, ms) => apply(r, ms, input), "listening");
  };

  const sendText = () => {
    const t = text.trim();
    if (!t || !inCall || busy) return;
    stopAudio(); setText("");
    send(jsonPost({ text: t, tts: voiceReplies }), "typed");
  };

  const endTalk = useCallback(() => {
    holding.current = false;
    const r = rec.current; if (!r) return;
    rec.current = null; clearTimeout(r.timer); setTalking(false);
    const pcm = downsample(r.stop(), r.rate);
    if (pcm.length < MIN_SECONDS * 16000) { setStatus("listening"); return; }
    const form = new FormData();
    form.append("audio", new Blob([encodeWav(pcm)], { type: "audio/wav" }), "turn.wav");
    form.append("tts", String(voiceRef.current));
    send({ method: "POST", body: form }, "voice");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send only touches refs and stable setters
  }, []);

  const beginTalk = async () => {
    if (!inCall || busy || holding.current || opening.current || rec.current) return;
    holding.current = true; opening.current = true; stopAudio(); setError(null);
    const ctx = new AudioContext(); // created inside the gesture so Safari lets it run
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1); // shortcut: deprecated but simplest; move to AudioWorklet if it is ever removed
      const chunks: Float32Array[] = [];
      proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc); proc.connect(ctx.destination);
      const tracks = stream.getTracks();
      let closed = false;
      const stop = () => {
        proc.disconnect(); src.disconnect(); tracks.forEach((t) => t.stop());
        if (!closed) { closed = true; ctx.close(); }
        const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
        let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
        return all;
      };
      opening.current = false;
      rec.current = { stop, rate: ctx.sampleRate, timer: setTimeout(endTalk, MAX_SECONDS * 1000) };
      if (!holding.current) { endTalk(); return; } // released while the mic was opening
      setTalking(true); setStatus("listening");
    } catch {
      opening.current = false; holding.current = false;
      stream?.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      setError("Microphone unavailable. Allow mic access, or type instead.");
    }
  };

  const end = () => {
    gen.current++; abort.current?.abort(); pcm.current?.stop();
    if (rec.current) { clearTimeout(rec.current.timer); rec.current.stop(); rec.current = null; setTalking(false); }
    holding.current = false;
    finish();
  };

  // Space = hold to talk anywhere except form controls; the talk button handles its own keys.
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(t.tagName);
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat && !typing(e.target)) { e.preventDefault(); beginTalk(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && holding.current && !typing(e.target)) { e.preventDefault(); endTalk(); } };
    const cancel = () => { if (holding.current) endTalk(); };
    const vis = () => { if (document.hidden) cancel(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    window.addEventListener("blur", cancel); document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up);
      window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", vis);
    };
  });
  useEffect(() => () => {
    gen.current++; abort.current?.abort();
    const a = audio.current; if (a) { a.onended = a.onerror = null; a.pause(); }
    const r = rec.current; if (r) { clearTimeout(r.timer); rec.current = null; r.stop(); }
  }, []);

  const voiceSwitch = (
    <label className="flex min-h-11 min-w-11 cursor-pointer items-center gap-3 text-sm text-muted">
      <input type="checkbox" role="switch" checked={voiceReplies} onChange={(e) => toggleVoice(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full border border-line bg-sunken transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)] after:absolute after:left-0.5 after:top-0.5 after:h-[18px] after:w-[18px] after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-5" />
      Voice replies
    </label>
  );
  const llmSelect = (
    <div className="space-y-1">
      <label className="flex items-center justify-between gap-3 text-sm text-muted">
        Language model
        <select value={llm} onChange={(e) => pickLlm(e.target.value as LlmId)} className="min-h-11 rounded-lg border border-line bg-bg px-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]">
          {LLMS.map((l) => <option key={l.id} value={l.id} disabled={!ready(l.id)} title={ready(l.id) ? undefined : "not configured"}>{l.label}{ready(l.id) ? "" : " (not configured)"}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted">Takes effect when you start the next call.</p>
    </div>
  );
  const listening = status === "listening" && talking;
  const keyHold = (down: boolean) => (e: React.KeyboardEvent) => {
    if (e.code !== "Space" && e.code !== "Enter") return;
    e.preventDefault();
    if (down) { if (!e.repeat) beginTalk(); } else endTalk();
  };
  const talkProps = {
    onMouseDown: beginTalk, onMouseUp: endTalk, onMouseLeave: () => holding.current && endTalk(),
    onTouchStart: beginTalk, onTouchEnd: endTalk, onTouchCancel: endTalk,
    onKeyDown: keyHold(true), onKeyUp: keyHold(false), onBlur: () => holding.current && endTalk(),
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sunken sm:p-6">
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-bg sm:h-[800px] sm:max-h-[calc(100dvh-48px)] sm:w-[390px] sm:rounded-[36px] sm:border-[6px] sm:border-bezel sm:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
        <header className="border-b border-line bg-card px-5 pb-4 pt-6">
          <p className="serif text-[26px] leading-tight">Call: {customer}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone={statusTone[status]}><span role="status" aria-live="polite">{status}</span></Pill>
            {lang && <Pill>{lang}</Pill>}
            {!!turns.length && <Pill>LLM: {turns[0].provider}</Pill>}
          </div>
        </header>
        <p className="border-b border-line bg-warn-bg px-5 py-1.5 text-xs text-warn-fg">{caseId ? "Outbound collections call · confirm date of birth · " : "Demo call · "}synthetic data</p>

        <div role="log" aria-live="polite" aria-label="Call transcript" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.length === 0 && <p className="text-sm text-muted">{status === "idle" ? "Press Start call to begin." : "Connecting…"}</p>}
          {msgs.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.who === "caller" ? "items-end" : "items-start"}`}>
              <p className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.who === "caller" ? "bg-primary text-primary-fg" : "border border-line bg-card"}`}>
                <span className="sr-only">{m.who === "caller" ? "You: " : "Agent: "}</span>{m.text}
              </p>
              {!!m.actions?.length && (
                <ul className="mt-1 flex flex-wrap gap-1" aria-label="Actions run">
                  {m.actions.map((a, j) => <li key={j}><Pill tone={a.ok ? "ok" : "danger"} icon={a.ok ? "check" : "x"}>{a.name}</Pill></li>)}
                </ul>
              )}
              {m.stat && <TurnStat s={m.stat} />}
            </div>
          ))}
          {ended && <p className="text-center text-sm font-medium text-muted">Call ended</p>}
        </div>

        {error && (
          <p role="alert" className="mx-4 mb-2 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            Something went wrong ({error}). Please try again.
          </p>
        )}

        <div className="max-h-[45%] space-y-3 overflow-y-auto border-t border-line bg-card px-4 pb-5 pt-3">
          <SessionSummary turns={turns} />
          {(status === "idle" || status === "connecting" || ended) ? (
            <>
              {devMode && llmSelect}
              {voiceSwitch}
              <Button className="w-full" onClick={start} disabled={status === "connecting"}>{ended ? "Start a new call" : "Start call"}</Button>
            </>
          ) : (
            <>
              <button type="button" {...talkProps} disabled={!inCall || busy}
                aria-pressed={listening}
                className={`btn mx-auto flex h-20 w-full select-none items-center justify-center rounded-full text-base font-medium touch-none ${listening ? "btn-primary ring-4 ring-accent" : "btn-secondary"} disabled:opacity-50`}>
                {listening ? "Listening… release to send" : busy ? "Thinking…" : "Hold to talk (or hold Space)"}
              </button>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); sendText(); }}>
                <input value={text} onChange={(e) => setText(e.target.value)} readOnly={busy} disabled={!inCall}
                  aria-label="Type instead of speaking" placeholder="Type instead of speaking"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]" />
                <Button type="submit" small disabled={!inCall || busy || !text.trim()}>Send</Button>
              </form>
              <div className="flex items-center justify-between">
                {voiceSwitch}
                <Button small variant="secondary" onClick={end}>End call</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
