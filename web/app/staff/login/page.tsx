"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuthAdapter } from "@/lib/auth/adapters";
import { DEMO_CONFIG } from "@/lib/auth/auth-config";

function StaffLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/staff/overview";
  const errorParam = searchParams.get("error");

  const [staffId, setStaffId] = useState(DEMO_CONFIG.staff.id);
  const [passcode, setPasscode] = useState(DEMO_CONFIG.staff.passcode);
  const [error, setError] = useState<string | null>(() => {
    if (errorParam === "unauthorized") return "This area is restricted to bank staff. Please sign in with staff credentials.";
    if (errorParam === "expired") return "Your staff session has ended due to inactivity. Please sign in again.";
    return null;
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const adapter = getAuthAdapter("staff");
      const res = await adapter.signIn({
        identifier: staffId,
        passcode,
      });

      if (res.success) {
        router.push(returnTo);
      } else {
        setError(res.error || "Authentication failed. Check your Staff ID and passcode.");
      }
    } catch {
      setError("An unexpected error occurred during sign-in.");
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setStaffId(DEMO_CONFIG.staff.id);
    setPasscode(DEMO_CONFIG.staff.passcode);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-fg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span>Console Directory</span>
        </Link>
        <span className="font-mono text-[11px] text-muted">Bank Staff Portal</span>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md mx-auto my-auto">
        <div className="rounded-xl border border-line bg-card p-6 sm:p-8 shadow-sm">
          {/* Brand & Title */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary text-primary-fg font-bold text-xs">
                SFB
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Sahyadri Finance Bank
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-fg">Staff Sign In</h1>
            <p className="text-xs text-muted leading-relaxed">
              Collections, Live Operations &amp; RBI Window Compliance Desk.
            </p>
          </div>

          {/* Demo Hint Banner */}
          {DEMO_CONFIG.hintsVisible && (
            <div className="mb-5 rounded-lg border border-primary/20 bg-secondary-container/40 p-3 flex items-start justify-between gap-3 text-xs">
              <div>
                <div className="font-semibold text-on-secondary-fixed">Demo Mode Active</div>
                <div className="text-[11px] text-muted font-mono mt-0.5">
                  ID: <span className="font-bold text-fg">{DEMO_CONFIG.staff.id}</span> · Passcode:{" "}
                  <span className="font-bold text-fg">{DEMO_CONFIG.staff.passcode}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleFillDemo}
                className="shrink-0 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
              >
                Auto-fill
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="staffId" className="block text-xs font-semibold text-fg mb-1.5">
                Staff ID
              </label>
              <input
                id="staffId"
                type="text"
                required
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                placeholder="e.g. STAFF-104"
                className="w-full rounded-lg border border-line bg-sunken px-3.5 py-2 text-xs font-mono text-fg placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>

            <div>
              <label htmlFor="passcode" className="block text-xs font-semibold text-fg mb-1.5">
                Access Passcode
              </label>
              <input
                id="passcode"
                type="password"
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-lg border border-line bg-sunken px-3.5 py-2 text-xs font-mono text-fg placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>

            {error && (
              <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-fg font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-lg font-semibold text-xs bg-primary text-primary-fg hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? "Authenticating..." : "Access Staff Console"}</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>

          {/* Compliance note */}
          <div className="mt-6 pt-4 border-t border-line text-[11px] text-muted space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-fg">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
              <span>RBI Voice Recovery Compliant</span>
            </div>
            <p className="leading-snug">
              Session logs are timestamped and retained under 1 Jan 2027 servicing standards.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] font-mono text-muted py-2">
        Sahyadri Finance Bank Ltd · Synthetic environment
      </div>
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Loading staff login...</div>}>
      <StaffLoginContent />
    </Suspense>
  );
}
