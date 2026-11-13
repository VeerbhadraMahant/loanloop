"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { UserShell } from "@/components/user/user-shell";
import { OtpPinInput } from "@/components/user/otp-pin-input";
import { useI18n } from "@/lib/i18n";

export default function OtpPage() {
  const { t } = useI18n();
  const [mobile, setMobile] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the number typed on the previous screen
    try { setMobile(sessionStorage.getItem("loanloop.signin_mobile") ?? ""); } catch {}
  }, []);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async (codeToVerify?: string) => {
    const code = codeToVerify ?? otp;
    if (code.length < 6) return;

    setError(null);
    setLoading(true);
    // The real customer sign-in (same endpoint as /login): the server sets the HttpOnly ll_cust cookie.
    try {
      const r = await fetch("/auth/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, passcode: code }),
      });
      if (r.ok) {
        try { sessionStorage.removeItem("loanloop.signin_mobile"); } catch {}
        window.location.assign((await r.json()).landing);
        return;
      }
      setError(r.status === 429 ? "Too many attempts. Try again in 15 minutes." : r.status === 401 ? "Wrong details. Try again." : "Sign-in is unavailable right now. Try again shortly.");
    } catch {
      setError("Sign-in is unavailable right now. Try again shortly.");
    }
    setOtp("");
    setLoading(false);
  };

  return (
    <UserShell showNav={false} title="Verification">
    <div className="flex flex-col min-h-[calc(100vh-120px)] sm:min-h-[740px] justify-between py-4">
      {/* Top Section */}
      <div className="space-y-4">
        <Link
          href="/user/mobile"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span>{t.otp.edit_mobile}</span>
        </Link>

        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-fg tracking-tight">
            {t.otp.title}
          </h1>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            {t.otp.subtitle}{" "}
            <span className="font-mono font-bold text-fg">+91 {mobile}</span>
          </p>
        </div>

        {/* OTP Input Fields */}
        <div className="pt-4">
          <OtpPinInput
            value={otp}
            onChange={setOtp}
            onComplete={handleVerify}
            hasError={Boolean(error)}
            disabled={loading}
          />
          {error && <p className="text-xs text-danger-fg mt-2 text-center font-medium">{error}</p>}
        </div>

      </div>

      {/* Bottom CTA */}
      <div className="space-y-3 pt-6">
        <button
          type="button"
          disabled={loading || otp.length < 6}
          onClick={() => handleVerify()}
          className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-primary text-primary-fg hover:bg-accent-hover active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <span>{loading ? t.common.loading : t.otp.cta_verify}</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
    </UserShell>
  );
}
