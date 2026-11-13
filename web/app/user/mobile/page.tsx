"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserShell } from "@/components/user/user-shell";
import { useI18n } from "@/lib/i18n";

export default function MobileInputPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [mobile, setMobile] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    try { sessionStorage.setItem("loanloop.signin_mobile", mobile); } catch {} // handed to the passcode step; kept out of the URL
    router.push("/user/otp");
  };

  return (
    <UserShell showNav={false} title="Sign In">
      <div className="flex flex-col min-h-[calc(100vh-120px)] sm:min-h-[740px] justify-between py-4">
        {/* Top form */}
        <div className="space-y-4">
          <Link
            href="/user/language"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>{t.common.back}</span>
          </Link>

          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-fg tracking-tight">
              {t.mobile.title}
            </h1>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              {t.mobile.subtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-fg mb-1.5">
                {t.mobile.input_label}
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-semibold text-muted select-none">
                  +91
                </span>
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder={t.mobile.placeholder}
                  className="w-full pl-12 pr-4 py-3 text-base font-mono font-semibold rounded-xl border border-line bg-card text-fg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-xs"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={mobile.length < 10}
              className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-primary text-primary-fg hover:bg-accent-hover active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{t.mobile.cta_send}</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </form>

        </div>

        {/* Security badge */}
        <div className="pt-4 text-center">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
            <svg className="w-3.5 h-3.5 text-ok-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            {t.common.secure_badge}
          </span>
        </div>
      </div>
    </UserShell>
  );
}

