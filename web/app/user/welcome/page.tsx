"use client";

import React from "react";
import Link from "next/link";
import { UserShell } from "@/components/user/user-shell";
import { useI18n } from "@/lib/i18n";

export default function WelcomePage() {
  const { t } = useI18n();

  return (
    <UserShell showNav={false} title="Sahyadri Finance Bank">
      <div className="flex flex-col min-h-[calc(100vh-120px)] sm:min-h-[740px] justify-between py-4">
        {/* Top brand hero */}
        <div className="space-y-6 pt-4">
          <div className="w-16 h-16 rounded-2xl bg-primary text-primary-fg flex items-center justify-center font-bold text-2xl shadow-lg shadow-primary/20 border-2 border-card">
            SFB
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-accent-soft text-primary mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Sahyadri Voice Banking
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-fg tracking-tight leading-tight">
              {t.welcome.hero_title}
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-2.5 leading-relaxed">
              {t.welcome.hero_desc}
            </p>
          </div>

          {/* Institutional Trust Badges */}
          <div className="space-y-2.5 pt-2">
            <div className="p-3.5 rounded-2xl bg-card border border-line flex items-center gap-3 shadow-xs">
              <div className="p-2 rounded-xl bg-ok-bg text-ok-fg shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold text-fg">Zero Secrets Guarantee</div>
                <div className="text-[11px] text-muted">Never ask for PIN, CVV, OTP or passwords</div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-card border border-line flex items-center gap-3 shadow-xs">
              <div className="p-2 rounded-xl bg-accent-soft text-primary shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold text-fg">Native Voice in 3 Languages</div>
                <div className="text-[11px] text-muted">Marathi, Hindi & Indian English support</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="space-y-3 pt-6">
          <Link
            href="/user/language"
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-primary text-primary-fg hover:bg-accent-hover active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2"
          >
            <span>{t.welcome.cta_start}</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <p className="text-[10px] text-muted text-center leading-relaxed px-4">
            {t.welcome.rbi_note}
          </p>
        </div>
      </div>
    </UserShell>
  );
}

