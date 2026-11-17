const KEY = "ll_call_id"; // sessionStorage: lets /user/home -> /user/talk reuse the call (server memory is per call_id)

export class VoiceError extends Error {
  status: number;
  constructor(msg: string, status: number) { super(msg); this.status = status; }
}

/** 409 = call ended, 404 = unknown/expired call (TTL or voice restart): start a fresh call and retry the turn once. */
export const isDeadCall = (e: unknown) => e instanceof VoiceError && (e.status === 409 || e.status === 404);

export const storedCallId = (): string | null => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
export const storeCallId = (id: string | null) => {
  try { if (id) sessionStorage.setItem(KEY, id); else sessionStorage.removeItem(KEY); } catch { /* private mode: no reuse */ }
};
