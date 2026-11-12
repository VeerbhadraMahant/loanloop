"use client";

import React, { createContext, useContext, useState } from "react";
import { AuthContextValue, AuthUser, Session, SupportedLang } from "./auth-types";
import { DEMO_PERSONAS, DUMMY_OTP, resolvePersonaByMobile } from "./dummy-auth-provider";

const STORAGE_KEY = "loanloop.user_session";
const LANG_KEY = "loanloop.user_lang";
const MIC_MODE_KEY = "loanloop.user_mic_mode";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.customer_ref && DEMO_PERSONAS[parsed.customer_ref as "priya" | "ramesh" | "sunita"]) {
          return DEMO_PERSONAS[parsed.customer_ref as "priya" | "ramesh" | "sunita"];
        }
      }
    } catch {}
    return null;
  });

  const [language, setLanguageState] = useState<SupportedLang>(() => {
    if (typeof window === "undefined") return "en";
    try {
      const stored = localStorage.getItem(LANG_KEY) as SupportedLang | null;
      if (stored && (stored === "en" || stored === "hi" || stored === "mr")) {
        return stored;
      }
    } catch {}
    return "en";
  });

  const [micMode, setMicModeState] = useState<"hold" | "tap">(() => {
    if (typeof window === "undefined") return "hold";
    try {
      const stored = localStorage.getItem(MIC_MODE_KEY) as "hold" | "tap" | null;
      if (stored === "hold" || stored === "tap") {
        return stored;
      }
    } catch {}
    return "hold";
  });

  const setLanguage = (lang: SupportedLang) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
  };

  const setMicMode = (mode: "hold" | "tap") => {
    setMicModeState(mode);
    try {
      localStorage.setItem(MIC_MODE_KEY, mode);
    } catch {}
  };

  const sendOtp = async (mobile: string): Promise<{ success: boolean; error?: string }> => {
    const clean = mobile.replace(/\D/g, "");
    if (clean.length < 10) {
      return { success: false, error: "Please enter a valid 10-digit mobile number" };
    }
    await new Promise((res) => setTimeout(res, 250));
    return { success: true };
  };

  const verifyOtp = async (
    mobile: string,
    otp: string
  ): Promise<{ success: boolean; error?: string }> => {
    await new Promise((res) => setTimeout(res, 200));
    const cleanOtp = otp.trim();
    if (cleanOtp !== DUMMY_OTP && cleanOtp !== "000000") {
      return { success: false, error: `Invalid OTP. For demo use ${DUMMY_OTP}` };
    }
    const resolvedUser = resolvePersonaByMobile(mobile);
    setUser(resolvedUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ customer_ref: resolvedUser.customer_ref }));
    } catch {}
    return { success: true };
  };

  const switchDemoUser = (customerRef: "priya" | "ramesh" | "sunita") => {
    const target = DEMO_PERSONAS[customerRef];
    if (target) {
      setUser(target);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ customer_ref: target.customer_ref }));
      } catch {}
    }
  };

  const signOut = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const session: Session = {
    user,
    role: "user",
    language,
    micMode,
    isAuthenticated: Boolean(user),
  };

  const value: AuthContextValue = {
    ...session,
    setLanguage,
    setMicMode,
    sendOtp,
    verifyOtp,
    switchDemoUser,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useSession must be used within an AuthProvider");
  }
  return ctx;
}
