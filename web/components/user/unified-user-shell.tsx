"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth/auth-context";
import { fetchUserApprovals } from "@/lib/user/user-service";
import { useEvents } from "@/lib/api";
import { ConsoleTab } from "./tabs/console-tab";
import { CallingDeskTab } from "./tabs/calling-desk-tab";
import { BankAppTab } from "./tabs/bank-app-tab";
import { AccountTab } from "./tabs/account-tab";
import { Icon } from "@/components/ui";
import type { Status } from "@/components/calling-desk/calling-desk-view";

export type UserShellTab = "console" | "calling-desk" | "bank-app" | "account";

export function UnifiedUserShell({
  initialTab = "console",
  initialUtterance,
}: {
  initialTab?: UserShellTab;
  initialUtterance?: string;
}) {
  const { user } = useSession();
  const customerRef = user?.customer_ref || "priya";

  const [activeTab, setActiveTab] = useState<UserShellTab>(initialTab);
  const [presetUtterance, setPresetUtterance] = useState<string | undefined>(initialUtterance);
  const [autoStartCall, setAutoStartCall] = useState<boolean>(Boolean(initialUtterance));
  const [callState, setCallState] = useState<{
    inCall: boolean;
    status: Status;
    duration: number;
  }>({
    inCall: false,
    status: "idle",
    duration: 0,
  });

  const [pendingApprovalCount, setPendingApprovalCount] = useState<number>(0);

  // Sync pending approvals count for tab badge
  const refreshApprovals = async () => {
    try {
      const list = await fetchUserApprovals(customerRef);
      const count = list.filter((a) => a.status === "pending").length;
      setPendingApprovalCount(count);
    } catch {
      setPendingApprovalCount(0);
    }
  };

  useEffect(() => {
    refreshApprovals();
    const interval = setInterval(refreshApprovals, 3000);
    return () => clearInterval(interval);
  }, [customerRef]);

  useEvents((e) => {
    if (e.customer_key === customerRef && (e.type === "approval" || e.type === "action")) {
      refreshApprovals();
    }
  });

  const handleStartCall = (utterance?: string) => {
    setPresetUtterance(utterance);
    setAutoStartCall(true);
    setActiveTab("calling-desk");
  };

  const fmtDur = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-sunken/40 py-0 sm:py-6 flex items-center justify-center font-sans antialiased text-fg selection:bg-primary/20">
      {/* Phone chassis: 390x844 on laptop/desktop, 100vw/vh on real mobile */}
      <div className="w-full sm:w-[390px] h-[100dvh] sm:h-[844px] bg-bg sm:rounded-[44px] sm:border sm:border-line sm:shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* Dynamic Island / Hardware Notch */}
        <div className="w-full pt-2 flex justify-center bg-bg shrink-0 select-none">
          <div className="w-24 h-4 bg-fg/90 rounded-full flex items-center justify-between px-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sunken/60" />
            <span className="w-2 h-2 rounded-full bg-sunken/40" />
          </div>
        </div>

        {/* Mobile Status Bar */}
        <div className="w-full px-6 py-1 bg-bg flex items-center justify-between text-fg font-mono tabular-nums text-[11px] shrink-0 select-none">
          <span className="font-semibold">10:42</span>
          <div className="flex items-center gap-2 text-muted">
            <span className="text-[10px]">5G</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        {/* Console Header Bar */}
        <header className="bg-bg/95 backdrop-blur-md border-b border-line px-4 py-2 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary text-primary-fg flex items-center justify-center font-bold text-xs tracking-tight shadow-xs shrink-0">
              SFB
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold tracking-tight text-fg flex items-center gap-1.5 truncate">
                <span>Sahyadri Finance Bank</span>
              </div>
              <p className="text-[10px] text-muted font-medium truncate">
                {user ? `${user.name.split(" ")[0]} · ${user.account_masked}` : "Voice Servicing"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Switch Console Link */}
            <Link
              href="/"
              className="p-1.5 rounded-lg border border-line bg-card hover:bg-sunken text-muted hover:text-fg transition-colors"
              title="Switch console"
              aria-label="Switch console"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </Link>
          </div>
        </header>

        {/* Sticky Mini-Call Bar (when active call and not on calling-desk tab) */}
        {callState.inCall && activeTab !== "calling-desk" && (
          <button
            type="button"
            onClick={() => setActiveTab("calling-desk")}
            className="w-full bg-ok-bg text-ok-fg px-4 py-1.5 border-b border-ok-border flex items-center justify-between text-xs font-semibold cursor-pointer shrink-0 hover:bg-ok-border/30 transition-colors animate-fade-in"
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-ok-fg animate-pulse" />
              <span className="tabular-nums">Call in progress ({fmtDur(callState.duration)})</span>
            </span>
            <span className="text-[11px] font-mono underline">Return to Call →</span>
          </button>
        )}

        {/* Sticky Authorization Needed Bar (when pending approval and not on bank-app tab) */}
        {pendingApprovalCount > 0 && activeTab !== "bank-app" && (
          <button
            type="button"
            onClick={() => setActiveTab("bank-app")}
            className="w-full bg-warn-bg text-warn-fg px-4 py-1.5 border-b border-warn-border flex items-center justify-between text-xs font-semibold cursor-pointer shrink-0 hover:bg-warn-border/30 transition-colors animate-fade-in"
          >
            <span className="flex items-center gap-1.5">
              <Icon name="shield" size={13} />
              <span>Authorization Needed ({pendingApprovalCount})</span>
            </span>
            <span className="text-[11px] font-mono underline">Review in Bank App →</span>
          </button>
        )}

        {/* Tab Viewport: CallingDesk stays mounted to avoid dropping mid-call voice connection! */}
        <main className="flex-1 overflow-hidden relative">
          {/* Tab 1: Console */}
          <div
            className={`h-full overflow-y-auto px-4 py-3 pb-20 ${
              activeTab === "console" ? "block" : "hidden"
            }`}
          >
            <ConsoleTab onStartCall={handleStartCall} />
          </div>

          {/* Tab 2: Calling Desk (Persistent DOM to preserve WebAudio / stream / TTS) */}
          <div
            className={`h-full flex flex-col pb-16 ${
              activeTab === "calling-desk" ? "block" : "hidden"
            }`}
          >
            <CallingDeskTab
              presetUtterance={presetUtterance}
              autoStart={autoStartCall}
              onCallStateChange={setCallState}
              onGoToBankApp={() => setActiveTab("bank-app")}
            />
          </div>

          {/* Tab 3: Bank App */}
          <div
            className={`h-full overflow-y-auto px-4 py-3 pb-20 ${
              activeTab === "bank-app" ? "block" : "hidden"
            }`}
          >
            <BankAppTab />
          </div>

          {/* Tab 4: Account */}
          <div
            className={`h-full overflow-y-auto px-4 py-3 pb-20 ${
              activeTab === "account" ? "block" : "hidden"
            }`}
          >
            <AccountTab />
          </div>
        </main>

        {/* Fixed 4-Tab Bottom Navigation Bar */}
        <nav className="absolute bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-lg border-t border-line px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.04)] select-none">
          <div className="grid grid-cols-4 max-w-sm mx-auto">
            {/* Tab 1: Console */}
            <button
              type="button"
              onClick={() => setActiveTab("console")}
              className={`flex flex-col items-center py-1 transition-colors cursor-pointer ${
                activeTab === "console" ? "text-primary font-bold" : "text-muted hover:text-fg font-medium"
              }`}
            >
              <div className="relative">
                <Icon name="home" size={18} />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">Console</span>
            </button>

            {/* Tab 2: Voice Chat / Calling Desk */}
            <button
              type="button"
              onClick={() => {
                if (!callState.inCall) {
                  handleStartCall();
                } else {
                  setActiveTab("calling-desk");
                }
              }}
              className="relative -top-2.5 flex flex-col items-center cursor-pointer group select-none"
              aria-label="Voice Chat"
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-all duration-150 ${
                  activeTab === "calling-desk"
                    ? "bg-primary text-primary-fg ring-4 ring-primary/20 scale-105 shadow-primary/30"
                    : callState.inCall
                    ? "bg-ok-fg text-white ring-4 ring-ok-fg/30 animate-pulse"
                    : "bg-primary text-primary-fg hover:scale-105 shadow-primary/20"
                }`}
              >
                <Icon name="mic" size={20} />
              </div>
              <span
                className={`text-[10px] mt-0.5 tracking-tight font-bold ${
                  activeTab === "calling-desk" ? "text-primary" : "text-fg group-hover:text-primary"
                }`}
              >
                Voice Chat
              </span>
            </button>

            {/* Tab 3: Bank App */}
            <button
              type="button"
              onClick={() => setActiveTab("bank-app")}
              className={`flex flex-col items-center py-1 transition-colors cursor-pointer ${
                activeTab === "bank-app" ? "text-primary font-bold" : "text-muted hover:text-fg font-medium"
              }`}
            >
              <div className="relative">
                <Icon name="inbox" size={18} />
                {pendingApprovalCount > 0 && (
                  <span className="absolute -top-1 -right-2 px-1 rounded-full bg-warn-fg text-white text-[9px] font-bold font-mono">
                    {pendingApprovalCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">Bank App</span>
            </button>

            {/* Tab 4: Account */}
            <button
              type="button"
              onClick={() => setActiveTab("account")}
              className={`flex flex-col items-center py-1 transition-colors cursor-pointer ${
                activeTab === "account" ? "text-primary font-bold" : "text-muted hover:text-fg font-medium"
              }`}
            >
              <div className="relative">
                <Icon name="sliders" size={18} />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">Account</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
