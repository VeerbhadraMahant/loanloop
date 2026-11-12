// Next 16 "proxy" (ex-middleware): HTTP Basic auth + Multi-Console Route Guarding
import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAMES,
  getRouteAccess,
} from "./lib/auth/auth-config";

function safeEqual(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

export function proxy(req: NextRequest) {
  // 1. Basic auth check (if configured)
  const want = process.env.WEB_BASIC_AUTH;
  if (want) {
    const h = req.headers.get("authorization") ?? "";
    let got = "";
    if (h.startsWith("Basic ")) {
      try {
        got = atob(h.slice(6));
      } catch {}
    }
    if (!safeEqual(got, want)) {
      return new Response("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="LoanLoop"' },
      });
    }
  } else if (process.env.WEB_AUTH_DISABLED !== "1") {
    return new Response("WEB_BASIC_AUTH not set (set WEB_AUTH_DISABLED=1 for a localhost demo)", { status: 503 });
  }

  // 2. Multi-Console Route Guarding
  // Allow toggling off for local headless debugging
  if (process.env.AUTH_ENFORCE === "0") {
    return NextResponse.next();
  }

  const { pathname, search } = req.nextUrl;
  const access = getRouteAccess(pathname);

  // Static assets, public endpoints, and shared engineering tools
  if (access.type === "public" || access.type === "shared") {
    return NextResponse.next();
  }

  // Fail closed check for production mode
  const authMode = process.env.AUTH_MODE || "dummy";
  if (authMode !== "dummy") {
    return new Response(
      "Access Denied: Real authentication adapter not configured. (AUTH_MODE must be 'dummy')",
      { status: 403 }
    );
  }

  // Role-guarded route
  if (access.type === "role" && access.role) {
    const role = access.role;
    const cookieName = SESSION_COOKIE_NAMES[role];
    const cookie = req.cookies.get(cookieName);

    const fullPath = `${pathname}${search}`;
    const returnToQuery = `returnTo=${encodeURIComponent(fullPath)}`;

    const cookieVal = cookie?.value;

    if (!cookieVal) {
      // Check if user has an active session in another console to provide an explicit role mismatch error
      const otherRoles = (["user", "staff", "dev"] as const).filter((r) => r !== role);
      const hasOtherRoleSession = otherRoles.some((r) => Boolean(req.cookies.get(SESSION_COOKIE_NAMES[r])?.value));

      const errorQuery = hasOtherRoleSession ? "error=unauthorized&" : "";

      if (role === "staff") {
        return NextResponse.redirect(new URL(`/staff/login?${errorQuery}${returnToQuery}`, req.url));
      }
      if (role === "dev") {
        return NextResponse.redirect(new URL(`/dev/login?${errorQuery}${returnToQuery}`, req.url));
      }
      return NextResponse.redirect(new URL(`/user/welcome`, req.url));
    }

    try {
      const decoded = decodeURIComponent(cookieVal);
      const session = JSON.parse(decoded);

      // Session expiration check
      if (session.expiresAt && session.expiresAt < Date.now()) {
        const loginUrl = new URL(
          role === "staff" ? "/staff/login?error=expired" : role === "dev" ? "/dev/login?error=expired" : "/user/welcome",
          req.url
        );
        const res = NextResponse.redirect(loginUrl);
        res.cookies.delete(cookieName);
        return res;
      }

      if (session.role === role) {
        return NextResponse.next();
      }
    } catch {
      // Malformed cookie -> treat as unauthenticated
      if (role === "staff") {
        return NextResponse.redirect(new URL(`/staff/login?${returnToQuery}`, req.url));
      }
      if (role === "dev") {
        return NextResponse.redirect(new URL(`/dev/login?${returnToQuery}`, req.url));
      }
      return NextResponse.redirect(new URL(`/user/welcome`, req.url));
    }
  }

  return NextResponse.next();
}
