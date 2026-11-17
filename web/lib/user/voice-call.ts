const KEY = "ll_call_id"; // sessionStorage: lets /user/home -> /user/talk reuse the call (server memory is per call_id)

export class VoiceError extends Error {
  status: number;
  constructor(msg: string, status: number) { super(msg); this.status = status; }
}

/** 409 = call ended, 404 = unknown/expired call (TTL or voice restart): start a fresh call and retry the turn once. */
export const isDeadCall = (e: unknown) => e instanceof VoiceError && (e.status === 409 || e.status === 404);

export const storedCallId = (): string | null => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const MAX_TURNS = 50; // cap so sessionStorage can't grow unbounded
const turnsKey = (id: string) => `ll_turns_${id}`;
/** Persist the on-screen transcript for a call (last MAX_TURNS); null clears it. */
export const storeTurns = <T,>(id: string, turns: T[] | null) => {
  try {
    if (turns) sessionStorage.setItem(turnsKey(id), JSON.stringify(turns.slice(-MAX_TURNS)));
    else sessionStorage.removeItem(turnsKey(id));
  } catch { /* storage unavailable or full: transcript just won't restore */ }
};
export const loadTurns = <T,>(id: string): T[] => {
  try { const v = JSON.parse(sessionStorage.getItem(turnsKey(id)) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
export const storeCallId =(id: string | null) => {
  try { if (id) sessionStorage.setItem(KEY, id); else sessionStorage.removeItem(KEY); } catch { /* private mode: no reuse */ }
};
