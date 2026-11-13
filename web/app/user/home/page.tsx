"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserShell } from "@/components/user/user-shell";
import { VoiceCard } from "@/components/user/voice-card";
import { QuickActionsGrid } from "@/components/user/quick-actions-grid";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/user/session";

export default function UserHomePage() {
  const { t } = useI18n();
  const { user } = useSession();
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
              {t.home.greeting}{user ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
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
