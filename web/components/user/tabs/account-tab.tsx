"use client";

import React, { useState } from "react";
import { LanguageSelector } from "@/components/user/language-selector";
import { SignOut } from "@/components/auth";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/user/session";

export function AccountTab() {
  const { t } = useI18n();
  const { micMode, setMicMode } = useSession();

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

  return (
          <div className="space-y-5">
        {/* Zero Secrets Guarantee Card */}
        <div className="bg-ok-bg/30 rounded-2xl p-4 border border-ok-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-ok-fg text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ok-fg">
              {t.help.zero_secrets_title}
            </h3>
          </div>
          <p className="text-xs text-fg leading-relaxed">
            {t.help.zero_secrets_body}
          </p>
        </div>

        {/* Microphone Mode Setting */}
        <div className="bg-card rounded-2xl p-4 border border-line shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">
            {t.help.mic_mode_title}
          </h4>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setMicMode("hold")}
              className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                micMode === "hold"
                  ? "bg-accent-soft border-primary text-accent-ink font-semibold"
                  : "hover:bg-surface-container border-line text-fg"
              }`}
            >
              <div>
                <div className="text-xs font-bold">Hold-to-Talk (Recommended)</div>
                <div className="text-[10px] text-muted">Best for noisy markets, traffic & public transport</div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  micMode === "hold" ? "border-primary bg-primary text-white" : "border-line"
                }`}
              >
                {micMode === "hold" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMicMode("tap")}
              className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                micMode === "tap"
                  ? "bg-accent-soft border-primary text-accent-ink font-semibold"
                  : "hover:bg-surface-container border-line text-fg"
              }`}
            >
              <div>
                <div className="text-xs font-bold">Tap-to-Talk (Toggle)</div>
                <div className="text-[10px] text-muted">Tap once to speak, tap again to finish (single hand)</div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  micMode === "tap" ? "border-primary bg-primary text-white" : "border-line"
                }`}
              >
                {micMode === "tap" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </button>
          </div>
        </div>

        {/* Language Selection */}
        <div className="bg-card rounded-2xl p-4 border border-line shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
            Voice & App Language
          </h4>
          <LanguageSelector layout="segmented" />
        </div>

        {/* Display Theme */}
        <div className="bg-card rounded-2xl p-4 border border-line shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
            {t.help.app_theme}
          </h4>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "bright", label: "Bright" },
              { id: "classic", label: "Classic" },
              { id: "dark", label: "Dark" },
            ].map((th) => (
              <button
                key={th.id}
                type="button"
                onClick={() => handleThemeChange(th.id as "bright" | "classic" | "dark")}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                  currentTheme === th.id
                    ? "bg-primary text-primary-fg border-primary shadow-xs"
                    : "bg-surface-container text-muted hover:text-fg border-line"
                }`}
              >
                {th.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <SignOut door="customer" className="w-full py-3 px-4 rounded-xl text-xs font-bold text-danger-fg bg-danger-bg hover:bg-danger-bg/80 border border-danger-line transition-all" />
        </div>
      </div>
  );
}
