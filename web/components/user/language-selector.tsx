"use client";

import React from "react";
import { useSession } from "@/lib/user/session";
import { SupportedLang } from "@/lib/user/session";

interface LanguageSelectorProps {
  layout?: "segmented" | "cards";
  onSelect?: (lang: SupportedLang) => void;
}

export function LanguageSelector({ layout = "segmented", onSelect }: LanguageSelectorProps) {
  const { language, setLanguage } = useSession();

  const options: Array<{ code: SupportedLang; label: string; native: string; desc: string }> = [
    { code: "en", label: "English", native: "English", desc: "Default language" },
    { code: "hi", label: "Hindi", native: "हिंदी", desc: "बातचीत हिंदी में करें" },
    { code: "mr", label: "Marathi", native: "मराठी", desc: "संभाषण मराठीत करा" },
  ];

  const handleSelect = (code: SupportedLang) => {
    setLanguage(code);
    onSelect?.(code);
  };

  if (layout === "cards") {
    return (
      <div className="grid grid-cols-1 gap-2.5">
        {options.map((opt) => {
          const isSelected = language === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => handleSelect(opt.code)}
              className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all duration-150 active:scale-[0.99] ${
                isSelected
                  ? "bg-accent-soft border-primary ring-1 ring-primary shadow-sm"
                  : "bg-card border-line hover:border-outline-variant hover:bg-surface-container/50"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-fg tracking-tight">{opt.native}</span>
                  <span className="text-xs text-muted font-medium">({opt.label})</span>
                </div>
                <p className="text-xs text-muted mt-0.5">{opt.desc}</p>
              </div>

              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  isSelected ? "border-primary bg-primary text-primary-fg" : "border-line"
                }`}
              >
                {isSelected && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center p-1 bg-surface-container rounded-xl border border-line">
      {options.map((opt) => {
        const isSelected = language === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => handleSelect(opt.code)}
            className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-all duration-150 ${
              isSelected
                ? "bg-card text-primary shadow-xs border border-line"
                : "text-muted hover:text-fg"
            }`}
          >
            {opt.native}
          </button>
        );
      })}
    </div>
  );
}

