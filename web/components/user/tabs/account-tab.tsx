"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSelector } from "@/components/user/language-selector";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/auth/auth-context";
import { DEMO_PERSONAS } from "@/lib/auth/dummy-auth-provider";
import { Icon, Pill } from "@/components/ui";

export function AccountTab() {
  const { t } = useI18n();
  const { user, micMode, setMicMode, switchDemoUser, signOut } = useSession();
  const router = useRouter();

  const [currentTheme, setCurrentTheme] = useState<"bright" | "classic" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("loanloop.theme") as "bright" | "classic" | "dark" | null;
      if (stored) return stored;
    }
    return "bright";
  });

  const handleThemeChange = (theme: "bright" | "classic" | "dark") => {
    setCurrentTheme(theme);
    try {
      localStorage.setItem("loanloop.theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } catch {}
  };

  const handleSignOut = () => {
    signOut();
    router.push("/user/welcome");
  };

  const activeUser = user ?? DEMO_PERSONAS.priya;

  return (
    <div className="space-y-4 pb-4">
      {/* Borrower Profile Card */}
      <div className="bg-card rounded-2xl p-4 border border-line shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary text-primary-fg font-extrabold text-base flex items-center justify-center shrink-0 shadow-xs">
            {activeUser.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-fg truncate">{activeUser.name}</h2>
            <p className="text-xs font-mono text-muted truncate">{activeUser.mobile_masked}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Pill tone="ok">KYC Verified · Tier 1</Pill>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-line/60 text-[11px] font-mono">
          <div>
            <span className="text-muted block">Loan Account</span>
            <span className="font-semibold text-fg">{activeUser.loan_id_masked}</span>
          </div>
          <div>
            <span className="text-muted block">Branch</span>
            <span className="font-semibold text-fg">{activeUser.branch}</span>
          </div>
        </div>
      </div>

      {/* Zero Secrets Policy Guarantee */}
      <div className="bg-ok-bg/30 rounded-2xl p-4 border border-ok-border">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="p-1 rounded-md bg-ok-fg text-white">
            <Icon name="shield" size={13} />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-ok-fg">
            {t.help.zero_secrets_title}
          </h3>
        </div>
        <p className="text-xs text-fg leading-relaxed">
          {t.help.zero_secrets_body}
        </p>
      </div>

      {/* Language Preference */}
      <div className="bg-card rounded-2xl p-4 border border-line shadow-xs space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
          {t.language.title}
        </h3>
        <LanguageSelector />
      </div>

      {/* Microphone Audio Mode */}
      <div className="bg-card rounded-2xl p-4 border border-line shadow-xs space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
          {t.help.mic_mode_title}
        </h3>
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setMicMode("hold")}
            className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
              micMode === "hold"
                ? "bg-primary/10 border-primary text-primary font-semibold"
                : "border-line text-fg hover:bg-sunken"
            }`}
          >
            <div>
              <div className="text-xs font-bold">Hold-to-Talk (Default)</div>
              <div className="text-[10px] text-muted">Best for noisy markets &amp; public transport</div>
            </div>
            {micMode === "hold" && <span className="w-2 h-2 rounded-full bg-primary" />}
          </button>

          <button
            type="button"
            onClick={() => setMicMode("tap")}
            className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
              micMode === "tap"
                ? "bg-primary/10 border-primary text-primary font-semibold"
                : "border-line text-fg hover:bg-sunken"
            }`}
          >
            <div>
              <div className="text-xs font-bold">Tap-to-Talk (Hands-free)</div>
              <div className="text-[10px] text-muted">Tap once to speak, tap again to finish</div>
            </div>
            {micMode === "tap" && <span className="w-2 h-2 rounded-full bg-primary" />}
          </button>
        </div>
      </div>

      {/* Theme Selection */}
      <div className="bg-card rounded-2xl p-4 border border-line shadow-xs space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
          {t.help.app_theme}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {(["bright", "classic", "dark"] as const).map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => handleThemeChange(th)}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all cursor-pointer ${
                currentTheme === th
                  ? "bg-primary text-primary-fg border-primary shadow-xs"
                  : "border-line bg-sunken text-muted hover:text-fg"
              }`}
            >
              {th}
            </button>
          ))}
        </div>
      </div>

      {/* Demo Persona Switcher */}
      <div className="bg-card rounded-2xl p-4 border border-line shadow-xs space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
          Demo Borrower Profiles
        </h3>
        <div className="space-y-1.5">
          {Object.values(DEMO_PERSONAS).map((p) => {
            const isSelected = activeUser.customer_ref === p.customer_ref;
            return (
              <button
                key={p.customer_ref}
                type="button"
                onClick={() => switchDemoUser(p.customer_ref as "priya" | "ramesh" | "sunita")}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  isSelected
                    ? "bg-primary/10 border-primary font-bold text-fg"
                    : "border-line text-fg hover:bg-sunken"
                }`}
              >
                <div>
                  <div className="text-xs font-bold">{p.name}</div>
                  <div className="text-[10px] text-muted font-mono">{p.loan_type} · {p.account_masked}</div>
                </div>
                {isSelected && <Pill tone="accent">Active</Pill>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Switch Console Directory Link */}
      <div className="pt-1">
        <Link
          href="/"
          className="w-full py-2.5 px-4 rounded-xl border border-line bg-card hover:bg-sunken text-xs font-semibold text-fg flex items-center justify-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span>Switch to Staff or Dev Console</span>
        </Link>
      </div>

      {/* Sign Out */}
      <div>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full py-2.5 px-4 rounded-xl border border-danger-border bg-danger-bg hover:opacity-90 text-danger-fg text-xs font-bold transition-opacity cursor-pointer"
        >
          Sign Out of Borrower Session
        </button>
      </div>
    </div>
  );
}
