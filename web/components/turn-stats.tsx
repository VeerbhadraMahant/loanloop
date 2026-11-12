"use client";
import { useState } from "react";
import { Button } from "@/components/ui";

export type Timings = {
  provider: string; model: string; stt_ms: number; llm_ms: number; llm_calls: number;
  gateway_ms: number; gateway_calls: number; tts_ms: number; other_ms: number; total_ms: number;
};
export type Stat = { n: number; clientMs: number; input: "start" | "typed" | "voice"; timings?: Timings };
export type Turn = Stat & { provider: string; model: string; actions: string[] };

export const LLMS = [
  { id: "ollama", label: "Local (qwen3:8b)" },
  { id: "gemini", label: "Google Gemini" },
  { id: "sarvam", label: "Sarvam" },
] as const;
export type LlmId = (typeof LLMS)[number]["id"];

/** Segment colours shared by the per-turn bar and the lab's comparison bars. */
export const SEG = {
  stt: { k: "STT", c: "bg-sky-500" }, llm: { k: "LLM", c: "bg-violet-500" }, gateway: { k: "Gateway", c: "bg-emerald-500" },
  tts: { k: "TTS", c: "bg-amber-500" }, other: { k: "Server other", c: "bg-slate-400" }, net: { k: "Network/browser", c: "bg-rose-400" },
} as const;

const sec = (ms: number) => (ms / 1000).toFixed(2);
const n = (c: number) => `${c} call${c === 1 ? "" : "s"}`;

function parts(s: Stat) {
  const t = s.timings; if (!t) return [];
  return [
    { k: SEG.stt.k, ms: t.stt_ms, c: SEG.stt.c },
    { k: `LLM (${n(t.llm_calls)})`, ms: t.llm_ms, c: SEG.llm.c },
    { k: `Gateway (${n(t.gateway_calls)})`, ms: t.gateway_ms, c: SEG.gateway.c },
    { k: SEG.tts.k, ms: t.tts_ms, c: SEG.tts.c },
    { k: SEG.other.k, ms: t.other_ms, c: SEG.other.c },
    { k: SEG.net.k, ms: Math.max(0, s.clientMs - t.total_ms), c: SEG.net.c },
  ];
}

export function TurnStat({ s }: { s: Stat }) {
  const p = parts(s);
  return (
    <div className="mt-1 w-full max-w-[85%] text-[11px] text-muted tabular-nums">
      <p><span className="font-mono font-medium text-fg">Response {sec(s.clientMs)} s</span>
        {s.timings && <> · <span className="font-mono">{s.timings.provider} / {s.timings.model}</span></>}</p>
      {p.length > 0 && (
        <>
          <div aria-hidden className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-sunken">
            {p.filter((x) => x.ms > 0).map((x) => <div key={x.k} className={x.c} style={{ flex: `${x.ms} 1 0` }} />)}
          </div>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono" aria-label="Where the time went">
            {p.map((x) => (
              <li key={x.k} className="flex items-center gap-1">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${x.c}`} />{x.k} {sec(x.ms)} s
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function SessionSummary({ turns }: { turns: Turn[] }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  if (!turns.length) return null;
  const byProv = new Map<string, Turn[]>();
  for (const t of turns) byProv.set(t.provider, [...(byProv.get(t.provider) ?? []), t]);
  const copy = async () => {
    const rows = turns.map(({ n, provider, model, input, clientMs, timings, actions }) => {
      const rest: Partial<Timings> = { ...timings };
      delete rest.provider; delete rest.model;
      return { turn: n, provider, model, input_type: input, client_ms: Math.round(clientMs), ...rest, actions };
    });
    try { await navigator.clipboard.writeText(JSON.stringify(rows, null, 2)); setCopied("ok"); } catch { setCopied("fail"); }
  };
  return (
    <details className="rounded-md border border-line bg-sunken/50 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-fg">Session stats ({turns.length} turn{turns.length === 1 ? "" : "s"})</summary>
      <table className="mt-2 w-full text-left font-mono tabular-nums">
        <thead className="text-[11px] text-muted border-b border-line"><tr><th className="py-1 font-medium">Provider</th><th className="py-1 font-medium">Turns</th><th className="py-1 font-medium">Median</th><th className="py-1 font-medium">Max</th></tr></thead>
        <tbody className="divide-y divide-line">
          {[...byProv].map(([p, ts]) => {
            const ms = ts.map((t) => t.clientMs);
            return <tr key={p}><td className="py-1 text-fg">{p}</td><td className="py-1">{ts.length}</td><td className="py-1">{sec(median(ms))} s</td><td className="py-1">{sec(Math.max(...ms))} s</td></tr>;
          })}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2">
        <Button small variant="secondary" onClick={copy}>Copy results</Button>
        <span role="status" className="text-muted">{copied === "ok" ? "Copied (JSON, no caller text or audio)" : copied === "fail" ? "Copy blocked by the browser" : ""}</span>
      </div>
    </details>
  );
}
