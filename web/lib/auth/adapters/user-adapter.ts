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
  isDummyAuth,
} from "../auth-config";
import { DEMO_PERSONAS, DUMMY_OTP, resolvePersonaByMobile } from "../dummy-auth-provider";

export class DummyUserAuthAdapter implements ConsoleAuthAdapter {
  role = "user" as const;

  getSession(): ConsoleSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEYS.user);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const customerRef = parsed.customer_ref || parsed.customerId || "priya";
      const persona = DEMO_PERSONAS[customerRef as "priya" | "ramesh" | "sunita"];
      if (!persona) return null;

      const session: ConsoleSession = {
        role: "user",
        identifier: persona.mobile,
        name: persona.name,
        customerId: customerRef,
        createdAt: parsed.createdAt || Date.now(),
        expiresAt: parsed.expiresAt || Date.now() + SESSION_TIMEOUTS_MS.user,
      };

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

    const otp = (credentials.otp || "").trim();
    if (otp !== DUMMY_OTP && otp !== "000000") {
      return {
        success: false,
        error: `Invalid OTP. For demo use ${DUMMY_OTP}`,
      };
    }

    const persona = credentials.customerId && DEMO_PERSONAS[credentials.customerId as "priya" | "ramesh" | "sunita"]
      ? DEMO_PERSONAS[credentials.customerId as "priya" | "ramesh" | "sunita"]
      : resolvePersonaByMobile(credentials.identifier);

    const now = Date.now();
    const session: ConsoleSession = {
      role: "user",
      identifier: persona.mobile,
      name: persona.name,
      customerId: persona.customer_ref,
      createdAt: now,
      expiresAt: now + SESSION_TIMEOUTS_MS.user,
    };

    if (typeof window !== "undefined") {
      const payload = encodeURIComponent(JSON.stringify(session));
      const maxAge = Math.floor(SESSION_TIMEOUTS_MS.user / 1000);
      document.cookie = `${SESSION_COOKIE_NAMES.user}=${payload}; path=/; max-age=${maxAge}; SameSite=Lax`;
      localStorage.setItem(
        SESSION_STORAGE_KEYS.user,
        JSON.stringify({
          customer_ref: persona.customer_ref,
          createdAt: now,
          expiresAt: session.expiresAt,
        })
      );
    }

    return {
      success: true,
      session,
    };
  }

  signOut(): void {
    if (typeof window !== "undefined") {
      document.cookie = `${SESSION_COOKIE_NAMES.user}=; path=/; max-age=0; SameSite=Lax`;
      localStorage.removeItem(SESSION_STORAGE_KEYS.user);
    }
  }
}
