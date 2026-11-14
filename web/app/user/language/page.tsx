"use client";

import React from "react";
import Link from "next/link";
import { UserShell } from "@/components/user/user-shell";
import { LanguageSelector } from "@/components/user/language-selector";
import { useI18n } from "@/lib/i18n";

export default function LanguagePage() {
  const { t } = useI18n();

  return (
    <UserShell showNav={false} title="Language Selection">
      <div className="flex flex-col min-h-[calc(100vh-120px)] sm:min-h-[740px] justify-between py-4">
        {/* Header */}
        <div className="space-y-4">
          <Link
            href="/user/welcome"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>{t.common.back}</span>
          </Link>

          <div>
            <h1 className="text-xl sm:text-2xl font-normal tracking-[-0.0275em] text-fg">
              {t.language.title}
            </h1>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              {t.language.subtitle}
            </p>
          </div>

          <div className="pt-2">
            <LanguageSelector layout="cards" />
          </div>

          <p className="text-[11px] text-muted leading-relaxed px-1">
            {t.language.helper}
          </p>
        </div>

        {/* Continue Action */}
        <div className="pt-6">
          <Link
            href="/user/mobile"
            className="w-full min-h-12 py-3 px-4 rounded-xl font-medium text-base bg-primary text-primary-fg hover:bg-accent-hover motion-safe:active:scale-[0.99] transition-colors flex items-center justify-center gap-2"
          >
            <span>{t.common.continue}</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </UserShell>
  );
}

