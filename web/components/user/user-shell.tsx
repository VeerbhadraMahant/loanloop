"use client";

import React from "react";
import { BottomNav } from "./bottom-nav";
import { DemoUserChip } from "./demo-user-chip";
import { useSession } from "@/lib/auth/auth-context";

interface UserShellProps {
  children: React.ReactNode;
  showNav?: boolean;
  activeTab?: "home" | "inbox" | "talk" | "activity" | "help";
  title?: string;
  showDemoSwitcher?: boolean;
}

export function UserShell({
  children,
  showNav = true,
  activeTab = "home",
  title,
  showDemoSwitcher = true,
}: UserShellProps) {
  const { user } = useSession();

  return (
    <div className="min-h-screen bg-sunken/40 py-0 sm:py-6 flex items-center justify-center font-sans antialiased text-fg">
      {/* Phone chassis */}
      <div className="w-full sm:max-w-[420px] min-h-screen sm:min-h-[852px] sm:max-h-[920px] bg-bg sm:rounded-[36px] sm:border sm:border-line sm:shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* Top Header / App Bar */}
        <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur-md border-b border-line px-4 pt-3 pb-2.5 flex items-center justify-between select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary text-primary-fg flex items-center justify-center font-bold text-xs tracking-tight shadow-sm">
              SFB
            </div>
            <div>
              <div className="text-xs font-bold tracking-tight text-fg flex items-center gap-1.5">
                <span>{title ?? "Sahyadri Finance Bank"}</span>
                {user && (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-ok-bg text-ok-fg border border-ok-border">
                    {user.tier_label.split(":")[0]}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted font-medium">
                {user ? `${user.branch} · ${user.account_masked}` : "Voice Servicing & Mobile Desk"}
              </p>
            </div>
          </div>

          {showDemoSwitcher && <DemoUserChip />}
        </header>

        {/* Scrollable Viewport Content */}
        <main
          className={`flex-1 overflow-y-auto px-4 py-4 ${
            showNav ? "pb-[calc(84px+env(safe-area-inset-bottom))]" : "pb-6"
          }`}
        >
          {children}
        </main>

        {/* Fixed Ergonomic Bottom Navigation */}
        {showNav && <BottomNav activeTab={activeTab} />}
      </div>
    </div>
  );
}
