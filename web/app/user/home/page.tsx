"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserShell } from "@/components/user/user-shell";
import { VoiceCard } from "@/components/user/voice-card";
import { QuickActionsGrid } from "@/components/user/quick-actions-grid";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/auth/auth-context";
import { DEMO_PERSONAS } from "@/lib/auth/dummy-auth-provider";

export default function UserHomePage() {
  const { t } = useI18n();
  const { user, isAuthenticated, switchDemoUser } = useSession();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState("Today");

  useEffect(() => {
    setCurrentDate(
      new Date().toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    );
  }, []);

  // If not authenticated, ensure fallback demo user or redirect
  useEffect(() => {
    if (!isAuthenticated && !user) {
      switchDemoUser("priya");
    }
  }, [isAuthenticated, user, switchDemoUser]);

  const activeUser = user ?? DEMO_PERSONAS.priya;

  return (
    <UserShell activeTab="home">
      <div className="space-y-5">
        {/* Borrower Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted tracking-tight">
              {currentDate}
            </span>
            <h1 className="text-xl font-extrabold text-fg tracking-tight">
              {t.home.greeting}, {activeUser.name.split(" ")[0]}
            </h1>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-ok-bg text-ok-fg border border-ok-border">
              {activeUser.status.split("·")[0].trim()}
            </span>
          </div>
        </div>

        {/* Loan Overview Hero Card */}
        <div className="bg-card rounded-3xl p-5 border border-line shadow-sm relative overflow-hidden">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-[10px] font-mono font-medium text-muted uppercase tracking-wider block">
                {t.home.active_loan}
              </span>
              <h2 className="text-base font-bold text-fg tracking-tight">
                {activeUser.loan_type}
              </h2>
              <span className="text-xs font-mono text-muted">
                {activeUser.loan_id_masked}
              </span>
            </div>

            <div className="w-8 h-8 rounded-xl bg-surface-container flex items-center justify-center text-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-line">
            <div>
              <span className="text-[10px] text-muted font-medium block">
                {t.home.emi_due}
              </span>
              <span className="text-lg font-mono font-bold text-fg">
                {activeUser.customer_ref === "priya"
                  ? "₹34,890"
                  : activeUser.customer_ref === "ramesh"
                  ? "₹12,450"
                  : "₹18,200"}
              </span>
              <span className="text-[10px] text-muted block mt-0.5">
                {t.home.due_on} 10th of this month
              </span>
            </div>

            <div>
              <span className="text-[10px] text-muted font-medium block">
                {t.home.outstanding}
              </span>
              <span className="text-lg font-mono font-bold text-fg">
                {activeUser.balance}
              </span>
              <span className="text-[10px] text-ok-fg font-medium block mt-0.5">
                Auto-debit active
              </span>
            </div>
          </div>
        </div>

        {/* Dominant Voice Card */}
        <VoiceCard onStartTalk={() => router.push("/user/talk")} />

        {/* 2x3 Quick Actions Grid */}
        <QuickActionsGrid onSelectAction={(q) => router.push(`/user/talk?q=${encodeURIComponent(q)}`)} />

        {/* Zero Secrets Guarantee Banner */}
        <div className="p-3.5 rounded-2xl bg-surface-container/60 border border-line/80 flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-ok-bg text-ok-fg shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-[11px] text-muted leading-tight">
            <strong className="text-fg font-semibold">Zero Secrets:</strong> Voice agents never ask for PIN, password or OTP.
          </p>
        </div>
      </div>
    </UserShell>
  );
}
