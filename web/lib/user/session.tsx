"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/components/auth";
import { get } from "@/lib/api";

export type SupportedLang = "en" | "hi" | "mr";
export type MicMode = "hold" | "tap";

/** The signed-in customer, from the real session (/auth/me) and the gateway's own profile (/gw/phone/me). */
export interface UserProfile {
  name: string;
  customerKey: string;
  mobileMasked?: string;
}

// Signed-out onboarding screens: no session is expected there, so skip /auth/me.
const PUBLIC_PAGES = ["/user/welcome", "/user/language", "/user/mobile", "/user/otp"];

const LANG_KEY = "loanloop.user_lang";
const MIC_MODE_KEY = "loanloop.user_mic_mode";

function stored<T extends string>(key: string, ok: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && ok.includes(v)) return v;
  } catch {}
  return fallback;
}

interface Ctx {
  user: UserProfile | null;
  sessionFailed: boolean; // /auth/me answered "not signed in" or could not be reached
  language: SupportedLang;
  micMode: MicMode;
  setLanguage: (l: SupportedLang) => void;
  setMicMode: (m: MicMode) => void;
}

const SessionContext = createContext<Ctx | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = useMe("customer", !PUBLIC_PAGES.includes(pathname));
  const [mobileMasked, setMobileMasked] = useState<string>();
  // Language and mic mode are per-device preferences, so they live in localStorage; read after mount to keep SSR markup identical.
  const [language, setLang] = useState<SupportedLang>("en");
  const [micMode, setMic] = useState<MicMode>("hold");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of device preferences
    setLang(stored<SupportedLang>(LANG_KEY, ["en", "hi", "mr"], "en"));
    setMic(stored<MicMode>(MIC_MODE_KEY, ["hold", "tap"], "hold"));
  }, []);

  const key = me?.customer_key;
  useEffect(() => {
    if (!key) return;
    get<{ mobile_masked: string }>("/phone/me").then((p) => setMobileMasked(p.mobile_masked), () => {});
  }, [key]);

  const save = (k: string, v: string) => {
    try { localStorage.setItem(k, v); } catch {}
  };
  const value: Ctx = {
    user: me?.customer_key ? { name: me.name, customerKey: me.customer_key, mobileMasked } : null,
    sessionFailed: me === null,
    language,
    micMode,
    setLanguage: (l) => { setLang(l); save(LANG_KEY, l); },
    setMicMode: (m) => { setMic(m); save(MIC_MODE_KEY, m); },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a UserProvider");
  return ctx;
}
