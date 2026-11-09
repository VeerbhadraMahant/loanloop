"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Browser only talks to its own origin; app/gw/[...path]/route.ts proxies to the gateway with the token.
export const GATEWAY = "/gw";

export type EventType = "call_start" | "call_end" | "action" | "security" | "sms" | "approval" | "handover";
export type Outcome = "ok" | "error" | "blocked";

export interface GwEvent {
  id: string;
  ts: string;
  type: EventType;
  call_id: string;
  action?: string;
  tier?: number;
  outcome?: Outcome;
  latency_ms?: number;
  error_code?: string;
  language?: string;
  customer_ref?: string;
  customer_key?: string;
  detail?: string;
}
export interface CallRow {
  call_id: string;
  customer_ref: string;
  language: string;
  tier: number;
  current_action: string | null;
  started_at: string;
  ended_at: string | null;
  outcome: string | null;
  blocked_count: number;
}
export interface Handover {
  id: string;
  call_id: string;
  customer_ref: string;
  reason: string;
  summary: string;
  requests_done: string[];
  requests_pending: string[];
  created_at: string;
}
export interface ActionMetric { action: string; count: number; p50: number; p95: number; p99: number; errors: number }
export interface Metrics {
  per_action: ActionMetric[];
  totals: { calls: number; task_completion_rate: number; handover_rate: number; secrets_detected: number; blocked: number };
  loadtest: Record<string, unknown> | null;
  stt_benchmark: { rows: { entity: string; with_keyterms: number; without_keyterms: number; n: number }[] } | null;
  e2e_latency: { p50: number; p95: number; n: number } | null;
}
export interface Sms { id: string; body: string; created_at: string }
export interface Approval { id: string; purpose: string; status: string; created_at: string; expires_at: string }

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${GATEWAY}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function post<T>(path: string): Promise<T> {
  const r = await fetch(`${GATEWAY}${path}`, { method: "POST" });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/** Subscribe to the SSE stream; EventSource reconnects on its own. Returns connection state. */
export function useEvents(onEvent: (e: GwEvent) => void): boolean {
  const [live, setLive] = useState(false);
  const cb = useRef(onEvent);
  useEffect(() => { cb.current = onEvent; });
  useEffect(() => {
    const es = new EventSource(`${GATEWAY}/events/stream`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (m) => {
      try { cb.current(JSON.parse(m.data) as GwEvent); } catch { /* ignore malformed frame */ }
    };
    return () => es.close();
  }, []);
  return live;
}

/** Fetch `path` now, on demand via reload(), and every pollMs (0 = no polling). */
export function useGet<T>(path: string | null, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!path) return;
    try { setData(await get<T>(path)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "request failed"); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => {
    if (!path) return;
    const first = setTimeout(reload, 0);
    const t = pollMs ? setInterval(reload, pollMs) : undefined;
    return () => { clearTimeout(first); if (t) clearInterval(t); };
  }, [path, pollMs, reload]);
  return { data, error, loading, reload };
}

export interface CollCase {
  id: number; customer: string; loan: string; overdue_amount: number; missed_emis: number; dpd: number; bucket: string;
  status: string; priority: number; attempts: number; last_call_at: string | null; next_action_at: string | null;
}
export interface CollPtp {
  id: number; case_id: number; customer: string; loan: string; direction: string; amount: number; promised_date: string;
  amount_tag: "full" | "partial"; status: "open" | "kept" | "broken" | "cancelled"; paid_amount: number | null; created_at: string;
}
export interface CollRtp {
  id: number; case_id: number; customer: string; loan: string; reason_code: string; note: string | null;
  overdue_amount: number; created_at: string; follow_up_at: string | null;
}
export interface JobRunRow { id: number; job: string; started_at: string; finished_at: string | null; stats: Record<string, unknown> | null }
export interface Collections { cases: CollCase[]; ptps: CollPtp[]; rtps: CollRtp[]; queue: CollCase[]; last_runs: JobRunRow[] }
