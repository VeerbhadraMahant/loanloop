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

export class DummyDevAuthAdapter implements ConsoleAuthAdapter {
  role = "dev" as const;

  getSession(): ConsoleSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEYS.dev);
      if (!raw) return null;
      const session: ConsoleSession = JSON.parse(raw);
      if (session.role !== "dev") return null;
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

    const expectedId = DEMO_CONFIG.dev.id.toUpperCase();
    const expectedPasscode = DEMO_CONFIG.dev.passcode;

    if (trimmedId !== expectedId) {
      return {
        success: false,
        error: `Developer ID not recognized. (Demo ID: ${DEMO_CONFIG.dev.id})`,
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
      role: "dev",
      identifier: trimmedId,
      name: DEMO_CONFIG.dev.name,
      createdAt: now,
      expiresAt: now + SESSION_TIMEOUTS_MS.dev,
    };

    if (typeof window !== "undefined") {
      const payload = encodeURIComponent(JSON.stringify(session));
      const maxAge = Math.floor(SESSION_TIMEOUTS_MS.dev / 1000);
      document.cookie = `${SESSION_COOKIE_NAMES.dev}=${payload}; path=/; max-age=${maxAge}; SameSite=Lax`;
      localStorage.setItem(SESSION_STORAGE_KEYS.dev, JSON.stringify(session));
    }

    return {
      success: true,
      session,
    };
  }

  signOut(): void {
    if (typeof window !== "undefined") {
      document.cookie = `${SESSION_COOKIE_NAMES.dev}=; path=/; max-age=0; SameSite=Lax`;
      localStorage.removeItem(SESSION_STORAGE_KEYS.dev);
    }
  }
}
