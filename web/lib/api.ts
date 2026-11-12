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

const DOWN = "Gateway not reachable — start the backend with start.ps1";

/** fetch that turns network failures and proxy 502/503/504 into one actionable message. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${GATEWAY}${path}`, init); }
  catch { throw new Error(DOWN); }
  if (r.status === 401 && typeof window !== "undefined") { // session expired: end cleanly at that door's sign-in page
    const p = window.location.pathname;
    const customerDoor = p === "/phone" || p === "/call";
    window.location.assign(customerDoor ? "/login" : "/staff/login");
    throw new Error("Session expired");
  }
  if (r.status === 502 || r.status === 503 || r.status === 504) throw new Error(DOWN);
  if (r.status === 403 && init?.method === "POST") throw new Error("Request blocked: this page's origin is not allowed (serve on port 3000 or set WEB_ALLOWED_ORIGINS)");
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export const get = <T,>(path: string) => call<T>(path, { cache: "no-store" });
export const post = <T,>(path: string) => call<T>(path, { method: "POST" });

/** Subscribe to the SSE stream. EventSource only auto-reconnects on network drops, not on an HTTP 502, so reopen by hand. */
export function useEvents(onEvent: (e: GwEvent) => void): boolean {
  const [live, setLive] = useState(false);
  const cb = useRef(onEvent);
  useEffect(() => { cb.current = onEvent; });
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const open = () => {
      es = new EventSource(`${GATEWAY}/events/stream`);
      es.onopen = () => setLive(true);
      es.onerror = () => {
        setLive(false);
        if (es?.readyState === EventSource.CLOSED && !stopped) { es.close(); retry = setTimeout(open, 3000); }
      };
      es.onmessage = (m) => {
        try { cb.current(JSON.parse(m.data) as GwEvent); } catch { /* ignore malformed frame */ }
      };
    };
    open();
    return () => { stopped = true; clearTimeout(retry); es?.close(); };
  }, []);
  return live;
}

/** Fetch `path` now, on demand via reload(), and every pollMs (0 = no polling). Data is keyed by path so a path change never shows the previous path's data. */
export function useGet<T>(path: string | null, pollMs = 0) {
  const [res, setRes] = useState<{ path: string; data: T | null; error: string | null } | null>(null);
  const latest = useRef(path);
  useEffect(() => { latest.current = path; }, [path]);
  const reload = useCallback(async () => {
    if (!path) return;
    try { const d = await get<T>(path); if (latest.current === path) setRes({ path, data: d, error: null }); }  // drop late responses for an old path
    catch (e) { if (latest.current === path) setRes((p) => ({ path, data: p?.path === path ? p.data : null, error: e instanceof Error ? e.message : "request failed" })); }
  }, [path]);
  useEffect(() => {
    if (!path) return;
    const first = setTimeout(reload, 0);
    const t = pollMs ? setInterval(reload, pollMs) : undefined;
    return () => { clearTimeout(first); if (t) clearInterval(t); };
  }, [path, pollMs, reload]);
  const cur = res && res.path === path ? res : null;
  return { data: cur?.data ?? null, error: cur?.error ?? null, loading: !!path && !cur, reload };
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

export type ReqType = "statement" | "interest_cert" | "nominee" | "address" | "emi_date_change" | "reconciliation" | "closure";
export type ReqStatus = "open" | "in_progress" | "done" | "rejected";
export interface ServiceRequestRow { id: number; created_at: string; type: ReqType; status: ReqStatus; customer_ref: string; summary: string }
export interface ServiceRequests { requests: ServiceRequestRow[]; counts: { by_status: Record<string, number>; by_type: Record<string, number> } }
