import type { ConsoleRole } from "./adapters/types";

export const SESSION_COOKIE_NAMES: Record<ConsoleRole, string> = {
  user: "loanloop_session_user",
  staff: "loanloop_session_staff",
  dev: "loanloop_session_dev",
};

export const SESSION_STORAGE_KEYS: Record<ConsoleRole, string> = {
  user: "loanloop.user_session",
  staff: "loanloop.staff_session",
  dev: "loanloop.dev_session",
};

export const SESSION_TIMEOUTS_MS: Record<ConsoleRole, number> = {
  user: 30 * 60 * 1000, // 30 minutes
  staff: 60 * 60 * 1000, // 60 minutes
  dev: 4 * 60 * 60 * 1000, // 4 hours
};

export const DEMO_CONFIG = {
  mode: process.env.AUTH_MODE || "dummy",
  enforce: process.env.AUTH_ENFORCE !== "0",
  hintsVisible: process.env.DEMO_HINTS_VISIBLE !== "0",
  staff: {
    id: process.env.DEMO_STAFF_ID || "STAFF-104",
    name: "Aaditya Joshi (Senior Collections Officer)",
    passcode: process.env.DEMO_STAFF_PASSCODE || "sahyadri@staff",
  },
  dev: {
    id: process.env.DEMO_DEV_ID || "DEV-202",
    name: "Kavya Menon (Voice AI Core Eng)",
    passcode: process.env.DEMO_DEV_PASSCODE || "sahyadri@dev",
  },
  user: {
    otp: "123456",
    allowedBorrowers: ["priya", "ramesh", "sunita"],
  },
};

export function isAuthEnforced(): boolean {
  if (process.env.AUTH_ENFORCE === "0") return false;
  return true;
}

export function isDummyAuth(): boolean {
  return (process.env.AUTH_MODE || "dummy") === "dummy";
}

/**
 * Maps a URL path to its required access policy.
 */
export function getRouteAccess(pathname: string): {
  type: "public" | "shared" | "role";
  role?: ConsoleRole;
} {
  // Public static assets & backend proxies
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/gw") ||
    pathname.startsWith("/vx") ||
    pathname.startsWith("/voice-out") ||
    pathname.startsWith("/api")
  ) {
    return { type: "public" };
  }

  // Public Landing and Auth Entry Points
  if (
    pathname === "/" ||
    pathname === "/staff/login" ||
    pathname === "/dev/login" ||
    pathname === "/user/welcome" ||
    pathname === "/user/language" ||
    pathname === "/user/mobile" ||
    pathname === "/user/otp"
  ) {
    return { type: "public" };
  }

  // Shared engineering tools (Collections/Ops/Test Cases cross-console links)
  // Reachable by both staff and dev
  if (
    pathname.startsWith("/call") ||
    pathname.startsWith("/phone") ||
    /^\/user\/(priya|ramesh|sunita|vikram)(\/|$)/.test(pathname)
  ) {
    return { type: "shared" };
  }

  // Staff Console Routes
  if (
    pathname.startsWith("/staff") ||
    pathname.startsWith("/collections") ||
    pathname.startsWith("/ops") ||
    pathname.startsWith("/bank")
  ) {
    return { type: "role", role: "staff" };
  }

  // Developer Lab Routes
  if (
    pathname.startsWith("/dev") ||
    pathname.startsWith("/test-cases") ||
    pathname.startsWith("/metrics")
  ) {
    return { type: "role", role: "dev" };
  }

  // Phone-first User Routes
  if (pathname.startsWith("/user")) {
    return { type: "role", role: "user" };
  }

  return { type: "public" };
}
