"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CollectionsView } from "./collections-view";
import { OpsView } from "./ops-view";
import { SlideOver } from "@/components/calling-desk/slide-over";
import { CallingDeskView } from "@/components/calling-desk/calling-desk-view";
import { ThemeSelector } from "@/components/sidebar-nav";
import { getAuthAdapter } from "@/lib/auth/adapters";
import { DEMO_CONFIG } from "@/lib/auth/auth-config";

type StaffTab = "collections" | "ops";

export function StaffShell({
  initialTab = "collections",
  initialCallCustomer,
  initialCallCaseId,
}: {
  initialTab?: StaffTab;
  initialCallCustomer?: string;
  initialCallCaseId?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") as StaffTab | null;
  const [activeTab, setActiveTab] = useState<StaffTab>(tabParam || initialTab);

  // Slide-over Calling Desk state
  const [slideOverCustomer, setSlideOverCustomer] = useState<string | null>(initialCallCustomer || null);
  const [slideOverCaseId, setSlideOverCaseId] = useState<number | undefined>(initialCallCaseId);

  const handleSignOut = () => {
    getAuthAdapter("staff").signOut();
    router.push("/staff/login");
  };

  const openCallingDesk = (customer: string, caseId?: number) => {
    setSlideOverCustomer(customer);
    setSlideOverCaseId(caseId);
  };

  const closeCallingDesk = () => {
    setSlideOverCustomer(null);
    setSlideOverCaseId(undefined);
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-between selection:bg-primary/20">
      {/* Top Application Header */}
      <header className="border-b border-line bg-card/95 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-2.5 min-w-0 hover:opacity-85 transition-opacity" title="Return to Console Directory">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg font-extrabold text-xs shadow-xs">
                SFB
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs font-bold text-fg tracking-tight">Sahyadri Finance Bank</span>
                  <span className="hidden md:inline font-normal text-muted text-[11px]">| सह्याद्री फायनान्स बँक</span>
                </div>
                <div className="text-[10px] font-mono text-muted truncate">
                  Bank Staff Operations Desk · RBI Recovery Standard
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Operator Badge */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md border border-line bg-sunken text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
              <span className="font-semibold text-fg">{DEMO_CONFIG.staff.id}</span>
              <span className="text-muted">· Aaditya Joshi</span>
            </div>

            <div className="w-36 hidden lg:block">
              <ThemeSelector />
            </div>

            {/* Switch Console */}
            <Link
              href="/"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border border-line bg-card hover:bg-sunken text-fg transition-colors"
              title="Return to Console Directory"
            >
              <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>Switch Console</span>
            </Link>

            {/* Sign Out */}
            <button
              type="button"
              onClick={handleSignOut}
              className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-danger-border bg-danger-bg text-danger-fg hover:opacity-90 transition-opacity cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Console Top Tab Navigation */}
        <div className="border-t border-line/60 bg-sunken/40">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("collections")}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "collections"
                  ? "border-primary text-primary bg-card/60"
                  : "border-transparent text-muted hover:text-fg hover:bg-card/30"
              }`}
            >
              <span>Collections Desk</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-sunken border border-line text-muted">
                Queue &amp; PTPs
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("ops")}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "ops"
                  ? "border-primary text-primary bg-card/60"
                  : "border-transparent text-muted hover:text-fg hover:bg-card/30"
              }`}
            >
              <span>Live Operations</span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.2 rounded bg-ok-bg text-ok-fg border border-ok-border">
                <span className="w-1.5 h-1.5 rounded-full bg-ok-fg pulse" />
                <span>Live Feed</span>
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Tab Workspace */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {activeTab === "collections" && (
          <CollectionsView onLaunchCall={openCallingDesk} />
        )}

        {activeTab === "ops" && (
          <OpsView onLaunchCall={openCallingDesk} />
        )}
      </main>

      {/* Calling Desk Slide-Over Panel */}
      <SlideOver
        open={Boolean(slideOverCustomer)}
        onClose={closeCallingDesk}
        title={slideOverCaseId ? `Calling Desk · Case #${slideOverCaseId}` : `Calling Desk · ${slideOverCustomer?.toUpperCase()}`}
        sub="In-desk voice servicing session with ground truth & ledger updates"
        width="wide"
      >
        {slideOverCustomer && (
          <CallingDeskView
            customer={slideOverCustomer}
            caseId={slideOverCaseId}
            variant="slide-over-staff"
            onClose={closeCallingDesk}
          />
        )}
      </SlideOver>

      {/* Desk Footer */}
      <footer className="border-t border-line bg-card py-3">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-muted">
          <div className="font-mono text-[11px]">
            Demo · synthetic data · RBI Master Directions compliance window 08:00–19:00 IST
          </div>
          <div className="text-[11px]">
            Sahyadri Finance Bank Ltd
          </div>
        </div>
      </footer>
    </div>
  );
}
