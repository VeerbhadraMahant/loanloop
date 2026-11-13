// Server-only helpers shared by the proxies, the /auth handlers and proxy.ts. Never import from client code.
export const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8000";

export const STAFF_COOKIE = "ll_staff";
export const CUSTOMER_COOKIE = "ll_cust";
export type Door = "staff" | "customer";
export const COOKIE = { staff: STAFF_COOKIE, customer: CUSTOMER_COOKIE } as const;
export const LOGIN = { staff: "/staff/login", customer: "/login" } as const;
export type Session = { kind: Door; role: string; name: string; customer_id?: number; customer_key?: string };

// Fixed allowlist, never derived from Host (a DNS-rebinding page would control Host and Origin alike).
// WEB_ALLOWED_ORIGINS (comma-separated) adds origins when the app is served elsewhere.
const ORIGIN_ALLOW = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.WEB_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
]);

/** Fail closed: a POST must carry an allowlisted Origin. */
export function originOk(req: Request) {
  const origin = req.headers.get("origin");
  return !!origin && ORIGIN_ALLOW.has(origin);
}

export function cookieOf(req: Request, name: string): string {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

/** The session headers the backends expect, from the browser's cookies. Empty when it has neither. */
export function sessionHeaders(req: Request): Record<string, string> {
  const h: Record<string, string> = {};
  const staff = cookieOf(req, STAFF_COOKIE);
  const cust = cookieOf(req, CUSTOMER_COOKIE);
  if (staff) h["X-LL-Staff-Session"] = staff;
  if (cust) h["X-LL-Customer-Session"] = cust;
  return h;
}

export const landingOf = (role: string) => (role === "engineer" ? "/dev" : role === "customer" ? "/user/home" : "/bank");

/** Ask the gateway about a session id. null = no such session; throws when the gateway is unreachable. */
export async function validate(sid: string): Promise<Session | null> {
  if (!sid) return null;
  const r = await fetch(`${GATEWAY}/auth/session`, { headers: { "X-LL-Session": sid }, cache: "no-store" });
  return r.ok ? ((await r.json()) as Session) : null;
}
