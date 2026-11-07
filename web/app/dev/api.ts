import type { Timings } from "@/components/turn-stats";

export const VOICE = process.env.NEXT_PUBLIC_VOICE_URL ?? "http://127.0.0.1:8100";

export class ApiError extends Error { constructor(msg: string, readonly status: number) { super(msg); } }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${VOICE}${path}`, init);
  if (!r.ok) {
    let d = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.detail) d = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* keep status */ }
    throw new ApiError(d, r.status);
  }
  return r.json();
}
export const postJson = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export type Settings = Record<string, unknown>;
export type Knob = {
  key: string; label: string; type: string; default?: unknown; options?: string[];
  min?: number; max?: number; step?: number; group?: string; help?: string;
};
export type Preset = { name: string; llm: string; model?: string; settings?: Settings };
export type DevConfig = {
  knobs: Knob[];
  providers: Record<string, { ready: boolean; models?: string[]; default_model?: string }>;
  presets: Preset[];
  scripts: { name: string; lines: string[] }[];
};
export type Cfg = { name: string; llm: string; model: string; settings: Settings };

export type Reply = {
  call_id: string; user_text?: string; agent_text: string; audio_b64?: string; mime?: string;
  actions?: { name: string; ok: boolean }[]; ended?: boolean; timings?: Timings; settings?: Settings;
};

export type BenchTurn = { rep: number; index: number; actions: string[]; ok: boolean; error?: string; timings?: Timings };
export type BenchRun = {
  name: string; llm: string; model: string; settings: Settings; turns: BenchTurn[];
  summary: {
    turns: number; errors: number; median_total_ms: number; p95_total_ms: number; max_total_ms: number;
    avg: { stt_ms: number; llm_ms: number; llm_calls: number; gateway_ms: number; tts_ms: number; other_ms: number };
  };
};
export type BenchJob = { status: "running" | "done" | "error"; done_turns: number; total_turns: number; error?: string; runs?: BenchRun[] };
