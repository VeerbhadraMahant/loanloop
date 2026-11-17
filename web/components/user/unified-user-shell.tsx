"use client";

import React, { useState } from "react";
import { useSession } from "@/lib/user/session";
import { ConsoleTab } from "./tabs/console-tab";
import { CallingDeskTab } from "./tabs/calling-desk-tab";
import { BankAppTab } from "./tabs/bank-app-tab";
import { AccountTab } from "./tabs/account-tab";
import { Icon } from "@/components/ui";

export type UserShellTab = "console" | "calling-desk" | "bank-app" | "account";

export function UnifiedUserShell({ initialTab = "console", initialUtterance }: { initialTab?: UserShellTab; initialUtterance?: string }) {
  const { user } = useSession();
  const [activeTab, setActiveTab] = useState<UserShellTab>(initialTab);
  // n bumps on every tap so repeating a quick action is not deduped away.
  const [utterance, setUtterance] = useState({ q: initialUtterance, n: initialUtterance ? 1 : 0 });
  // The voice session starts when the tab first opens (it opens a call), then stays mounted so a call survives tab switches.
  const [callOpened, setCallOpened] = useState(initialTab === "calling-desk");
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  const openCall = (q?: string) => {
    if (q) setUtterance((u) => ({ q, n: u.n + 1 }));
    setCallOpened(true);
    setActiveTab("calling-desk");
  };

  return (
    <div className="min-h-screen bg-sunken py-0 sm:py-6 flex items-center justify-center font-sans antialiased text-fg selection:bg-primary/20">
      {/* Phone chassis: 390x844 on laptop/desktop, 100vw/vh on real mobile */}
      <div className="w-full sm:w-[390px] h-[100dvh] sm:h-[844px] bg-bg sm:rounded-[44px] sm:border sm:border-line flex flex-col relative overflow-hidden">
        
        {/* Dynamic Island / Hardware Notch */}
        <div className="w-full pt-2 flex justify-center bg-bg shrink-0 select-none">
          <div className="w-24 h-4 bg-fg/90 rounded-full flex items-center justify-between px-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sunken/60" />
            <span className="w-2 h-2 rounded-full bg-sunken/40" />
          </div>
        </div>

        {/* Mobile Status Bar */}
        <div className="w-full px-6 py-1 bg-bg flex items-center justify-between text-fg font-mono tabular-nums text-[11px] shrink-0 select-none">
          <span className="font-medium">10:42</span>
          <div className="flex items-center gap-2 text-muted">
            <span className="text-[11px]">5G</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        {/* Console Header Bar */}
        <header className="bg-bg/95 backdrop-blur-md border-b border-line px-4 py-2 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary text-primary-fg flex items-center justify-center font-medium text-sm tracking-tight shrink-0">
              SFB
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium tracking-tight text-fg flex items-center gap-1.5 truncate">
                <span>Sahyadri Finance Bank</span>
              </div>
              <p className="text-[11px] text-muted font-medium truncate">
                {user ? [user.name, user.mobileMasked].filter(Boolean).join(" · ") : "Voice Servicing"}
              </p>
            </div>
          </div>

        </header>

        {/* Sticky Authorization Needed Bar (when pending approval and not on bank-app tab) */}
        {pendingApprovalCount > 0 && activeTab !== "bank-app" && (
          <button
            type="button"
            onClick={() => setActiveTab("bank-app")}
            className="w-full bg-warn-bg text-warn-fg px-4 py-1.5 border-b border-warn-border flex items-center justify-between text-sm font-medium cursor-pointer shrink-0 hover:bg-warn-border/30 transition-colors animate-fade-in"
          >
            <span className="flex items-center gap-1.5">
              <Icon name="shield" size={13} />
              <span>Authorization Needed ({pendingApprovalCount})</span>
            </span>
            <span className="text-[11px] font-mono underline">Review in Inbox & Approvals →</span>
          </button>
        )}

        {/* Tab Viewport: CallingDesk stays mounted to avoid dropping mid-call voice connection! */}
        <main className="flex-1 overflow-hidden relative">
          <div className={`h-full overflow-y-auto px-4 py-3 pb-20 ${activeTab === "console" ? "block" : "hidden"}`}>
            <ConsoleTab onStartCall={openCall} />
          </div>

          <div className={`h-full flex-col px-4 pt-3 pb-20 ${activeTab === "calling-desk" ? "flex" : "hidden"}`}>
            {callOpened && <CallingDeskTab initialQuery={utterance.q} queryNonce={utterance.n} />}
          </div>

          <div className={`h-full overflow-y-auto px-4 py-3 pb-20 ${activeTab === "bank-app" ? "block" : "hidden"}`}>
            <BankAppTab onPending={setPendingApprovalCount} />
          </div>

          <div className={`h-full overflow-y-auto px-4 py-3 pb-20 ${activeTab === "account" ? "block" : "hidden"}`}>
            <AccountTab />
          </div>
        </main>

        {/* Fixed 4-Tab Bottom Navigation Bar */}
        <nav className="absolute bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-lg border-t border-line px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] select-none">
          <div className="grid grid-cols-4 max-w-sm mx-auto">
            {/* Tab 1: Console */}
            <button
              type="button"
              onClick={() => setActiveTab("console")}
              className={`flex flex-col items-center justify-center min-h-11 py-1 transition-colors cursor-pointer ${
                activeTab === "console" ? "text-primary font-medium" : "text-muted hover:text-fg font-medium"
              }`}
            >
              <div className="relative">
                <Icon name="home" size={18} />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Console</span>
            </button>

            {/* Tab 2: Voice Chat / Calling Desk */}
            <button
              type="button"
              onClick={() => openCall()}
              className="relative -top-2.5 flex flex-col items-center cursor-pointer group select-none"
              aria-label="Voice Chat"
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 ${
                  activeTab === "calling-desk"
                    ? "bg-primary text-primary-fg ring-4 ring-primary/20"
                    : "bg-primary text-primary-fg"
                }`}
              >
                <Icon name="mic" size={20} />
              </div>
              <span
                className={`text-[11px] mt-0.5 tracking-tight font-medium ${
                  activeTab === "calling-desk" ? "text-primary" : "text-fg group-hover:text-primary"
                }`}
              >
                Voice Chat
              </span>
            </button>

            {/* Tab 3: Inbox & Approvals */}
            <button
              type="button"
              onClick={() => setActiveTab("bank-app")}
              className={`flex flex-col items-center justify-center min-h-11 py-1 transition-colors cursor-pointer ${
                activeTab === "bank-app" ? "text-primary font-medium" : "text-muted hover:text-fg font-medium"
              }`}
            >
              <div className="relative">
                <Icon name="inbox" size={18} />
                {pendingApprovalCount > 0 && (
                  <span className="absolute -top-1 -right-2 px-1 rounded-full bg-warn-fg text-white text-[9px] font-medium font-mono">
                    {pendingApprovalCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight font-medium">Inbox</span>
            </button>

            {/* Tab 4: Account */}
            <button
              type="button"
              onClick={() => setActiveTab("account")}
              className={`flex flex-col items-center justify-center min-h-11 py-1 transition-colors cursor-pointer ${
                activeTab === "account" ? "text-primary font-medium" : "text-muted hover:text-fg font-medium"
              }`}
            >
              <div className="relative">
                <Icon name="sliders" size={18} />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Account</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
