"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Pill } from "@/components/ui";
import { downsample, encodeWav } from "@/lib/wav";

const VOICE = process.env.NEXT_PUBLIC_VOICE_URL ?? "http://127.0.0.1:8100";
const MIN_SECONDS = 0.3;
const MAX_SECONDS = 25;

type Status = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended";
type Action = { name: string; ok: boolean };
type Msg = { who: "caller" | "agent"; text: string; actions?: Action[] };
type Reply = { user_text?: string; agent_text: string; audio_b64?: string; mime?: string; language?: string; actions?: Action[]; ended?: boolean };

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(`${VOICE}${path}`, init);
  if (!r.ok) {
    let d = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.detail) d = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* keep status */ }
    throw new Error(d);
  }
  return r.json();
}
const jsonPost = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const statusTone = { idle: "neutral", connecting: "warn", listening: "accent", thinking: "warn", speaking: "accent", ended: "neutral" } as const;

export default function CallApp({ customer }: { customer: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [lang, setLang] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [text, setText] = useState("");
  const callId = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const rec = useRef<{ stop: () => Float32Array; rate: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const holding = useRef(false);
  const [talking, setTalking] = useState(false);
  const ended = status === "ended";
  const inCall = status !== "idle" && status !== "connecting" && !ended;
  const busy = status === "thinking" || status === "connecting";

  const stopAudio = useCallback(() => { const a = audio.current; if (a) { a.pause(); a.src = ""; } }, []);

  const apply = useCallback((r: Reply) => {
    setMsgs((m) => [
      ...m,
      ...(r.user_text ? [{ who: "caller" as const, text: r.user_text }] : []),
      { who: "agent", text: r.agent_text, actions: r.actions },
    ]);
    if (r.language) setLang(r.language);
    if (r.ended) { setStatus("ended"); return; }
    if (r.audio_b64) {
      const a = (audio.current ??= new Audio());
      a.onended = a.onerror = () => setStatus((s) => (s === "speaking" ? "listening" : s));
      a.src = `data:${r.mime};base64,${r.audio_b64}`;
      setStatus("speaking");
      a.play().catch(() => setStatus("listening")); // autoplay blocked: text is still shown
    } else setStatus("listening");
  }, []);

  const start = async () => {
    setError(null); setStatus("connecting");
    try {
      const r = await call<Reply & { call_id: string }>("/calls", jsonPost({ customer, tts: voiceReplies }));
      callId.current = r.call_id; setMsgs([]); apply(r);
    } catch (e) { setStatus("idle"); setError(e instanceof Error ? e.message : "failed"); }
  };

  const send = async (init: RequestInit) => {
    if (!callId.current) return;
    setError(null); setStatus("thinking");
    try { apply(await call<Reply>(`/calls/${callId.current}/turn`, init)); }
    catch (e) { setStatus("listening"); setError(e instanceof Error ? e.message : "failed"); }
  };

  const sendText = () => {
    const t = text.trim();
    if (!t || !inCall || busy) return;
    stopAudio(); setText("");
    send(jsonPost({ text: t, tts: voiceReplies }));
  };

  const beginTalk = async () => {
    if (!inCall || busy || holding.current || rec.current) return;
    holding.current = true; stopAudio(); setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1); // shortcut: deprecated but simplest; move to AudioWorklet if it is ever removed
      const chunks: Float32Array[] = [];
      proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc); proc.connect(ctx.destination);
      const stop = () => {
        proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close();
        const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
        let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
        return all;
      };
      rec.current = { stop, rate: ctx.sampleRate, timer: setTimeout(endTalk, MAX_SECONDS * 1000) };
      if (!holding.current) { endTalk(); return; } // released while the mic was opening
      setTalking(true);
      setStatus("listening");
    } catch {
      holding.current = false;
      setError("Microphone unavailable. Allow mic access, or type instead.");
    }
  };

  const endTalk = () => {
    holding.current = false;
    const r = rec.current; if (!r) return;
    rec.current = null; clearTimeout(r.timer); setTalking(false);
    const pcm = downsample(r.stop(), r.rate);
    if (pcm.length < MIN_SECONDS * 16000) { setStatus("listening"); return; }
    const form = new FormData();
    form.append("audio", new Blob([encodeWav(pcm)], { type: "audio/wav" }), "turn.wav");
    form.append("tts", String(voiceReplies));
    send({ method: "POST", body: form });
  };

  const end = async () => {
    stopAudio(); setStatus("ended");
    if (rec.current) { clearTimeout(rec.current.timer); rec.current.stop(); rec.current = null; setTalking(false); }
  };

  // Space = hold to talk (not while typing in a field).
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|BUTTON)$/.test(t.tagName);
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat && !typing(e.target)) { e.preventDefault(); beginTalk(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && holding.current) { e.preventDefault(); endTalk(); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });
  useEffect(() => () => { audio.current?.pause(); rec.current?.stop(); }, []);

  const listening = status === "listening" && talking;
  const talkProps = {
    onMouseDown: beginTalk, onMouseUp: endTalk, onMouseLeave: () => holding.current && endTalk(),
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); beginTalk(); }, onTouchEnd: endTalk,
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sunken sm:p-6">
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-bg sm:h-[800px] sm:max-h-[calc(100dvh-48px)] sm:w-[390px] sm:rounded-[36px] sm:border-[6px] sm:border-bezel sm:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
        <header className="border-b border-line bg-card px-5 pb-4 pt-6">
          <p className="serif text-[26px] leading-tight">Call: {customer}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone={statusTone[status]}><span role="status" aria-live="polite">{status}</span></Pill>
            {lang && <Pill>{lang}</Pill>}
          </div>
        </header>
        <p className="border-b border-line bg-warn-bg px-5 py-1.5 text-xs text-warn-fg">Demo call · synthetic data</p>

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
            </div>
          ))}
          {ended && <p className="text-center text-sm font-medium text-muted">Call ended</p>}
        </div>

        {error && (
          <p role="alert" className="mx-4 mb-2 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            Something went wrong ({error}). Please try again.
          </p>
        )}

        <div className="space-y-3 border-t border-line bg-card px-4 pb-5 pt-3">
          {(status === "idle" || status === "connecting" || ended) ? (
            <Button className="w-full" onClick={start} disabled={status === "connecting"}>{ended ? "Start a new call" : "Start call"}</Button>
          ) : (
            <>
              <button type="button" {...talkProps} disabled={!inCall || busy}
                aria-label="Hold to talk" aria-pressed={listening}
                className={`btn mx-auto flex h-20 w-full select-none items-center justify-center rounded-full text-base font-medium touch-none ${listening ? "btn-primary ring-4 ring-accent" : "btn-secondary"} disabled:opacity-50`}>
                {listening ? "Listening… release to send" : busy ? "Thinking…" : "Hold to talk (or hold Space)"}
              </button>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); sendText(); }}>
                <input value={text} onChange={(e) => setText(e.target.value)} disabled={!inCall || busy}
                  aria-label="Type instead of speaking" placeholder="Type instead of speaking"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]" />
                <Button type="submit" small disabled={!inCall || busy || !text.trim()}>Send</Button>
              </form>
              <div className="flex items-center justify-between">
                <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
                  <input type="checkbox" checked={voiceReplies} onChange={(e) => setVoiceReplies(e.target.checked)} className="h-4 w-4" />
                  Voice replies
                </label>
                <Button small variant="secondary" onClick={end}>End call</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
