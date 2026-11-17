// Next 16 "proxy" (ex-middleware). Two layers (sign-in is replaced by open demo panels via /auth/demo):
// 1. Optional outer gate: HTTP Basic auth over everything when WEB_BASIC_AUTH=user:pass is set.
// 2. Page gating by session: the cookie is checked against the gateway on every page request (fail closed: gateway down -> 503).
// /gw, /vx, /voice-out are not page-gated: their handlers forward the session headers and the backends decide.
import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_COOKIE, STAFF_COOKIE, validate, type Session } from "./lib/server";

function safeEqual(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

const under = (p: string, base: string) => p === base || p.startsWith(base + "/");
const PUBLIC = ["/auth", "/gw", "/vx", "/voice-out", "/_next"]; // handlers behind them check the session themselves
const PUBLIC_FILES = new Set(["/favicon.ico", "/file.svg", "/globe.svg", "/next.svg", "/vercel.svg", "/window.svg"]); // web/public + app icon
const ONBOARDING = ["/user/welcome", "/user/language"]; // public intro screens of the borrower app
const USER_PAGES = ["/user", "/user/home", "/user/inbox", "/user/talk", "/user/help"]; // the borrower app, signed in
const BANK = ["bank_manager", "admin"];
const DEV = ["engineer", "admin"];

/** Roles allowed on a staff page, or null when the path is not a staff page. */
function staffRoles(p: string): string[] | null {
  if (["/bank", "/ops", "/collections", "/call/outbound"].some((b) => under(p, b)) || under(p, "/staff")) return BANK; // /staff = the unified desk
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
  const onboarding = ONBOARDING.includes(p);
  const customerPage = p === "/phone" || p === "/call" || USER_PAGES.includes(p);
  const oldLogin = p === "/staff/login" || p === "/login"; // sign-in is gone (open demo panels): back to the panel picker
  if (oldLogin) return go("/");
  if (!staffPage && !customerPage && !onboarding && p !== "/") {
    // Deny by default: only these are public. Anything else (typos, .rsc / .txt variants, unknown paths) is a plain 404.
    return PUBLIC.some((b) => under(p, b)) || PUBLIC_FILES.has(p) ? NextResponse.next() : notFound();
  }
  if (p === "/" || onboarding) return NextResponse.next(); // landing and intro screens: always reachable, no session needed

  // Open demo panels: a missing or wrong-role session is replaced by a demo session for the panel this path belongs to.
  const demo = (as: string) => go(`/auth/demo?as=${as}&next=${encodeURIComponent(p)}`);
  let staff: Session | null = null;
  let cust: Session | null = null;
  try {
    if (staffPage) staff = await validate(staffSid);
    else cust = await validate(custSid);
  } catch {
    return new Response("Service unavailable", { status: 503 });
  }
  if (staff && staff.kind !== "staff") staff = null;
  if (cust && cust.kind !== "customer") cust = null;

  if (customerPage) return cust ? NextResponse.next() : demo("customer");
  if (staff && staffPage!.includes(staff.role)) return NextResponse.next();
  return demo(staffPage === DEV ? "engineer" : "bank");
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
