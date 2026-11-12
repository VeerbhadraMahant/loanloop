// Next 16 "proxy" (ex-middleware). Two layers:
// 1. Optional outer gate: HTTP Basic auth over everything when WEB_BASIC_AUTH=user:pass is set.
// 2. Page gating by session: the cookie is checked against the gateway on every page request (fail closed: gateway down -> 503).
// /gw, /vx, /voice-out are not page-gated: their handlers forward the session headers and the backends decide.
import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_COOKIE, STAFF_COOKIE, landingOf, validate, type Session } from "./lib/server";

function safeEqual(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

const under = (p: string, base: string) => p === base || p.startsWith(base + "/");
const PUBLIC = ["/auth", "/gw", "/vx", "/voice-out", "/_next"]; // handlers behind them check the session themselves
const PUBLIC_FILES = new Set(["/favicon.ico", "/file.svg", "/globe.svg", "/next.svg", "/vercel.svg", "/window.svg"]); // web/public + app icon
const BANK = ["bank_manager", "admin"];
const DEV = ["engineer", "admin"];

/** Roles allowed on a staff page, or null when the path is not a staff page. */
function staffRoles(p: string): string[] | null {
  if (["/bank", "/ops", "/collections", "/call/outbound"].some((b) => under(p, b))) return BANK;
  if (["/dev", "/metrics", "/test-cases"].some((b) => under(p, b))) return DEV;
  return null;
}

export async function proxy(req: NextRequest) {
  const want = process.env.WEB_BASIC_AUTH;
  if (want) {
    const h = req.headers.get("authorization") ?? "";
    let got = "";
    if (h.startsWith("Basic ")) {
      try { got = atob(h.slice(6)); } catch {}
    }
    if (!safeEqual(got, want)) return new Response("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LoanLoop"' } });
  }

  // Normalise before any decision: decode %xx, collapse repeated slashes, drop a trailing slash. Gate on this form, never on the raw string.
  let p: string;
  try { p = decodeURIComponent(req.nextUrl.pathname).replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1"); } catch { return new Response("Not found", { status: 404 }); }
  const go = (to: string) => NextResponse.redirect(new URL(to, req.url));
  const notFound = () => NextResponse.rewrite(new URL("/_not-found-gate", req.url)); // a path that does not exist: a real 404, same as any unknown page
  const staffSid = req.cookies.get(STAFF_COOKIE)?.value ?? "";
  const custSid = req.cookies.get(CUSTOMER_COOKIE)?.value ?? "";

  const staffPage = staffRoles(p);
  const customerPage = p === "/phone" || p === "/call";
  const staffLogin = p === "/staff/login";
  const custLogin = p === "/login";
  if (!staffPage && !customerPage && !staffLogin && !custLogin && p !== "/") {
    // Deny by default: only these are public. Anything else (typos, .rsc / .txt variants, unknown paths) is a plain 404.
    return PUBLIC.some((b) => under(p, b)) || PUBLIC_FILES.has(p) ? NextResponse.next() : notFound();
  }

  // Only the cookies this path cares about are validated.
  let staff: Session | null = null;
  let cust: Session | null = null;
  try {
    if (p === "/" || staffPage || staffLogin) staff = await validate(staffSid);
    if (p === "/" || customerPage || custLogin) cust = await validate(custSid);
  } catch {
    if (staffLogin || custLogin) return NextResponse.next(); // the sign-in forms render without the gateway
    return new Response("Service unavailable", { status: 503 });
  }
  if (staff && staff.kind !== "staff") staff = null;
  if (cust && cust.kind !== "customer") cust = null;

  if (p === "/") return go(staff ? landingOf(staff.role) : cust ? "/phone" : "/login");
  if (staffLogin) return staff ? go(landingOf(staff.role)) : NextResponse.next();
  if (custLogin) return cust ? go("/phone") : NextResponse.next();
  if (customerPage) return cust ? NextResponse.next() : go("/login");
  // staff page
  if (staff) return staffPage!.includes(staff.role) ? NextResponse.next() : notFound();
  return custSid ? notFound() : go("/staff/login");
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
