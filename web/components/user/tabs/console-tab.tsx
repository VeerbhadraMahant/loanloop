"use client";

import React, { useState } from "react";
import { VoiceCard } from "@/components/user/voice-card";
import { QuickActionsGrid } from "@/components/user/quick-actions-grid";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/auth/auth-context";
import { DEMO_PERSONAS } from "@/lib/auth/dummy-auth-provider";
import { Icon } from "@/components/ui";

interface ConsoleTabProps {
  onStartCall: (presetQuery?: string) => void;
}

export function ConsoleTab({ onStartCall }: ConsoleTabProps) {
  const { t } = useI18n();
  const { user } = useSession();
  const [currentDate] = useState(() =>
    typeof window !== "undefined"
      ? new Date().toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      : "Today"
  );

  const activeUser = user ?? DEMO_PERSONAS.priya;

  const emiAmount =
    activeUser.customer_ref === "priya"
      ? "₹34,890"
      : activeUser.customer_ref === "ramesh"
      ? "₹12,450"
      : "₹18,200";

  const outstanding =
    activeUser.customer_ref === "priya"
      ? "₹34,12,000"
      : activeUser.customer_ref === "ramesh"
      ? "₹4,18,000"
      : "₹6,40,000";

  return (
    <div className="space-y-4 pb-4">
      {/* Top Greeting & KYC Status */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
            {currentDate}
          </span>
          <h1 className="text-lg font-extrabold text-fg tracking-tight">
            {t.home.greeting}, {activeUser.name.split(" ")[0]}
          </h1>
        </div>

        <div className="text-right">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-ok-bg text-ok-fg border border-ok-border">
            <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
            {activeUser.tier_label.split(":")[0]}
          </span>
        </div>
      </div>

      {/* Loan Overview Hero Card */}
      <div className="bg-card rounded-2xl p-4 border border-line shadow-xs relative overflow-hidden">
        <div className="flex items-start justify-between mb-3">
          <div>
            <span className="text-[10px] font-mono font-medium text-muted uppercase tracking-wider block">
              {t.home.active_loan}
            </span>
            <h2 className="text-sm font-bold text-fg tracking-tight">
              {activeUser.loan_type}
            </h2>
            <span className="text-xs font-mono text-muted">
              {activeUser.loan_id_masked}
            </span>
          </div>

          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Icon name="home" size={15} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-line/70">
          <div>
            <span className="text-[10px] text-muted font-medium block">
              {t.home.emi_due}
            </span>
            <span className="text-base font-mono font-bold text-fg">
              {emiAmount}
            </span>
            <span className="text-[10px] text-muted block mt-0.5">
              Due on 10th of this month
            </span>
          </div>

          <div>
            <span className="text-[10px] text-muted font-medium block">
              {t.home.outstanding}
            </span>
            <span className="text-base font-mono font-bold text-fg">
              {outstanding}
            </span>
            <span className="text-[10px] text-ok-fg block mt-0.5 font-medium">
              Auto-debit active
            </span>
          </div>
        </div>

        {/* Start Voice Conversation Banner Button */}
        <div className="mt-3.5 pt-3 border-t border-line/60">
          <button
            type="button"
            onClick={() => onStartCall()}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-primary text-primary-fg hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <Icon name="mic" size={15} />
            <span>Voice Chat with Sahyadri Assistant</span>
          </button>
        </div>
      </div>

      {/* Dominant Voice Chat Card with Live Waveform & Microphone */}
      <VoiceCard onStartTalk={onStartCall} />

      {/* Quick Action Shortcuts Grid */}
      <div className="space-y-2">
        <QuickActionsGrid onSelectAction={(q) => onStartCall(q)} />
      </div>

      {/* Recent Activity Card */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
            Recent Activity
          </h3>
          <span className="text-[10px] text-muted font-mono">Real-time ledger</span>
        </div>

        <div className="space-y-2">
          <div className="bg-card rounded-xl p-3 border border-line shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-ok-bg text-ok-fg flex items-center justify-center shrink-0">
                <Icon name="check" size={13} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-fg truncate">EMI Auto-Debit Cycle Shift</div>
                <div className="text-[10px] text-muted truncate">Changed from 5th to 10th via In-App Approval</div>
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted shrink-0">Today</span>
          </div>

          <div className="bg-card rounded-xl p-3 border border-line shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-sunken text-fg flex items-center justify-center shrink-0">
                <Icon name="inbox" size={13} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-fg truncate">Statement Sent via SMS</div>
                <div className="text-[10px] text-muted truncate">Delivered to +91 90000 14417</div>
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted shrink-0">Yesterday</span>
          </div>
        </div>
      </div>
    </div>
  );
}
