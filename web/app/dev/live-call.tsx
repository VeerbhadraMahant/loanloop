"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Pill } from "@/components/ui";
import { SessionSummary, TurnStat, type Stat, type Turn } from "@/components/turn-stats";
import { useHoldToTalk } from "@/lib/use-hold-to-talk";
import { PcmPlayer } from "@/lib/pcm-player";
import { api, VOICE, type Cfg, type Reply, type Settings } from "./api";

type Msg = { who: "caller" | "agent"; text: string; stat?: Stat };
type Status = "idle" | "connecting" | "live" | "thinking" | "ended";

export function LiveCall({ cfg, customer }: { cfg: Cfg; customer: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [tts, setTts] = useState(false);
  const [eff, setEff] = useState<Settings | null>(null);
  const callId = useRef<string | null>(null);
  const gen = useRef(0);
  const pcm = useRef<PcmPlayer | null>(null);
  const count = useRef(0);
  useEffect(() => () => { gen.current++; pcm.current?.stop(); }, []);

  const request = async (path: string, init: RequestInit, input: Stat["input"]) => {
    const g = gen.current;
    setError(null); setStatus(path === "/calls" ? "connecting" : "thinking");
    try {
      const t0 = performance.now();
      const r = await api<Reply>(path + (path.includes("?") ? "&" : "?") + "stream=1", init);
      const ms = performance.now() - t0;
      if (g !== gen.current) return;
      if (path === "/calls") { callId.current = r.call_id; count.current = 0; setMsgs([]); setTurns([]); }
      const stat: Stat = { n: ++count.current, clientMs: ms, input, timings: r.timings };
      setMsgs((m) => [...m, ...(r.user_text ? [{ who: "caller" as const, text: r.user_text }] : []), { who: "agent", text: r.agent_text, stat }]);
      setTurns((t) => [...t, { ...stat, provider: r.timings?.provider ?? cfg.llm, model: r.timings?.model ?? cfg.model, actions: (r.actions ?? []).map((a) => a.name) }]);
      if (r.settings) setEff(r.settings);
      pcm.current?.stop();
      if (r.audio_url) (pcm.current ??= new PcmPlayer()).play(`${VOICE}${r.audio_url}`);
      else if (r.audio_b64) new Audio(`data:${r.mime ?? "audio/wav"};base64,${r.audio_b64}`).play().catch(() => {});
      if (r.ended) { callId.current = null; setStatus("ended"); } else setStatus("live");
    } catch (e) {
      if (g !== gen.current) return;
      setError(e instanceof Error ? e.message : "failed");
      setStatus(callId.current ? "live" : "idle");
    }
  };

  const start = () => request("/calls", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer, tts, llm: cfg.llm, ...(cfg.model ? { model: cfg.model } : {}), settings: cfg.settings }),
  }, "start");
  const turn = (init: RequestInit, input: Stat["input"], query = "") => { if (callId.current) request(`/calls/${callId.current}/turn${query}`, init, input); };
  const sendText = () => {
    const t = text.trim(); if (!t || status !== "live") return;
    setText("");
    turn({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, tts }) }, "typed");
  };
  const { talking, props } = useHoldToTalk(status === "live", (wav) => {
    const form = new FormData();
    form.append("audio", wav, "turn.wav"); form.append("tts", String(tts));
    turn({ method: "POST", body: form }, "voice", `?tts=${tts}`);
  }, setError);
  const end = () => { gen.current++; callId.current = null; setStatus("ended"); };
  const inCall = status === "live" || status === "thinking";

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="serif text-2xl">Live call</h2>
        <Pill tone={inCall ? "accent" : "neutral"}><span role="status">{status}</span></Pill>
        <span className="text-sm text-muted">Uses the config above ({cfg.llm}{cfg.model ? ` / ${cfg.model}` : ""}) as {customer}.</span>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} disabled={inCall} className="h-5 w-5" />
        Voice replies (spends Gnani TTS credits)
      </label>
      {!inCall && <Button onClick={start} disabled={status === "connecting"}>{status === "ended" ? "Start a new call" : "Start call with this config"}</Button>}
      {inCall && (
        <>
          <button type="button" {...props} disabled={status !== "live"} aria-pressed={talking}
            className={`btn flex h-16 w-full select-none items-center justify-center rounded-full text-base font-medium touch-none ${talking ? "btn-primary ring-4 ring-accent" : "btn-secondary"} disabled:opacity-50`}>
            {talking ? "Listening… release to send" : status === "thinking" ? "Thinking…" : "Hold to talk"}
          </button>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); sendText(); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Type instead of speaking" placeholder="Type instead of speaking"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]" />
            <Button type="submit" small disabled={status !== "live" || !text.trim()}>Send</Button>
          </form>
          <Button small variant="secondary" onClick={end}>End call</Button>
        </>
      )}
      {error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger-fg">Something went wrong ({error}).</p>}
      {eff && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Effective settings</summary>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-sunken p-2">{JSON.stringify(eff, null, 2)}</pre>
        </details>
      )}
      <div role="log" aria-live="polite" aria-label="Call transcript" className="max-h-96 space-y-3 overflow-y-auto">
        {msgs.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.who === "caller" ? "items-end" : "items-start"}`}>
            <p className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.who === "caller" ? "bg-primary text-primary-fg" : "border border-line bg-card"}`}>
              <span className="sr-only">{m.who === "caller" ? "You: " : "Agent: "}</span>{m.text}
            </p>
            {m.stat && <TurnStat s={m.stat} />}
          </div>
        ))}
      </div>
      <SessionSummary turns={turns} />
    </Card>
  );
}
