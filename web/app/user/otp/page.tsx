"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserShell } from "@/components/user/user-shell";
import { OtpPinInput } from "@/components/user/otp-pin-input";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/auth/auth-context";
import { DUMMY_OTP } from "@/lib/auth/dummy-auth-provider";

function OtpContent() {
  const { t } = useI18n();
  const { verifyOtp } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const mobile = searchParams.get("m") ?? "9000014417";
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async (codeToVerify?: string) => {
    const code = codeToVerify ?? otp;
    if (code.length < 6) return;

    setError(null);
    setLoading(true);
    const res = await verifyOtp(mobile, code);
    setLoading(false);
    if (res.success) {
      router.push("/user/home");
    } else {
      setError(res.error ?? "Invalid passcode");
    }
  };

  const handleAutoFillDemo = () => {
    setOtp(DUMMY_OTP);
    handleVerify(DUMMY_OTP);
  };

  return (
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

        {/* Demo Fast-Track Pill */}
        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={handleAutoFillDemo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-secondary-container text-on-secondary-fixed hover:bg-primary hover:text-primary-fg transition-colors active:scale-95 shadow-xs"
          >
            <span className="w-2 h-2 rounded-full bg-ok-fg" />
            <span>Auto-fill Demo Code ({DUMMY_OTP})</span>
          </button>
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

        <p className="text-[11px] text-muted text-center">
          Didn&apos;t receive code?{" "}
          <button
            type="button"
            onClick={handleAutoFillDemo}
            className="text-primary font-semibold hover:underline"
          >
            {t.otp.resend}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function OtpPage() {
  return (
    <UserShell showNav={false} showDemoSwitcher={false} title="Verification">
      <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Loading verification...</div>}>
        <OtpContent />
      </Suspense>
    </UserShell>
  );
}

