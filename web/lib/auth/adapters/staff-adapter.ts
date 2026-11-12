import {
  ConsoleAuthAdapter,
  ConsoleSession,
  SignInCredentials,
  SignInResult,
} from "./types";
import {
  SESSION_COOKIE_NAMES,
  SESSION_STORAGE_KEYS,
  SESSION_TIMEOUTS_MS,
  DEMO_CONFIG,
  isDummyAuth,
} from "../auth-config";

export class DummyStaffAuthAdapter implements ConsoleAuthAdapter {
  role = "staff" as const;

  getSession(): ConsoleSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEYS.staff);
      if (!raw) return null;
      const session: ConsoleSession = JSON.parse(raw);
      if (session.role !== "staff") return null;
      if (session.expiresAt && session.expiresAt < Date.now()) {
        this.signOut();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  async signIn(credentials: SignInCredentials): Promise<SignInResult> {
    if (!isDummyAuth()) {
      return {
        success: false,
        error: "Real authentication adapter is not configured. (AUTH_MODE must be 'dummy')",
      };
    }

    const trimmedId = (credentials.identifier || "").trim().toUpperCase();
    const passcode = credentials.passcode || "";

    const expectedId = DEMO_CONFIG.staff.id.toUpperCase();
    const expectedPasscode = DEMO_CONFIG.staff.passcode;

    if (trimmedId !== expectedId) {
      return {
        success: false,
        error: `Staff ID not recognized. (Demo ID: ${DEMO_CONFIG.staff.id})`,
      };
    }

    if (passcode !== expectedPasscode) {
      return {
        success: false,
        error: "Incorrect passcode. Please check demo credentials.",
      };
    }

    const now = Date.now();
    const session: ConsoleSession = {
      role: "staff",
      identifier: trimmedId,
      name: DEMO_CONFIG.staff.name,
      createdAt: now,
      expiresAt: now + SESSION_TIMEOUTS_MS.staff,
    };

    if (typeof window !== "undefined") {
      const payload = encodeURIComponent(JSON.stringify(session));
      const maxAge = Math.floor(SESSION_TIMEOUTS_MS.staff / 1000);
      document.cookie = `${SESSION_COOKIE_NAMES.staff}=${payload}; path=/; max-age=${maxAge}; SameSite=Lax`;
      localStorage.setItem(SESSION_STORAGE_KEYS.staff, JSON.stringify(session));
    }

    return {
      success: true,
      session,
    };
  }

  signOut(): void {
    if (typeof window !== "undefined") {
      document.cookie = `${SESSION_COOKIE_NAMES.staff}=; path=/; max-age=0; SameSite=Lax`;
      localStorage.removeItem(SESSION_STORAGE_KEYS.staff);
    }
  }
}
