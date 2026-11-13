"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CollectionsView } from "./collections-view";
import { OpsView } from "./ops-view";
import { SlideOver } from "@/components/calling-desk/slide-over";
import CallApp from "@/app/call/call-app";
import { ThemeSelector } from "@/components/sidebar-nav";
import { SignOut, useMe } from "@/components/auth";

type StaffTab = "collections" | "ops";

export function StaffShell({ initialTab = "collections" }: { initialTab?: StaffTab }) {
  const me = useMe("staff");
  const tabParam = useSearchParams().get("tab");
  const [activeTab, setActiveTab] = useState<StaffTab>(tabParam === "ops" || tabParam === "collections" ? tabParam : initialTab);
  // Staff calls go through the outbound case path (/voice-out), never "as" a customer picked by name.
  const [caseId, setCaseId] = useState<number | null>(null);
  const closeCallingDesk = () => setCaseId(null);

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-between selection:bg-primary/20">
      {/* Top Application Header */}
      <header className="border-b border-line bg-card/95 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
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
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Operator Badge */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md border border-line bg-sunken text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
              <span className="font-semibold text-fg">{me?.name ?? "…"}</span>
              {me && <span className="text-muted">· {me.role.replace("_", " ")}</span>}
            </div>

            <div className="w-36 hidden lg:block">
              <ThemeSelector />
            </div>

            <Link href="/bank" className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-line bg-card hover:bg-sunken text-fg transition-colors">
              Bank app
            </Link>
            <SignOut
              door="staff"
              className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-danger-border bg-danger-bg text-danger-fg hover:opacity-90 transition-opacity"
            />
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
          <CollectionsView onLaunchCall={setCaseId} />
        )}

        {activeTab === "ops" && (
          <OpsView />
        )}
      </main>

      {/* Calling Desk Slide-Over Panel */}
      <SlideOver
        open={caseId !== null}
        onClose={closeCallingDesk}
        title={`Calling Desk · Case #${caseId}`}
        sub="Outbound collections call, ledger-grounded"
        width="wide"
      >
        {caseId !== null && <CallApp key={caseId} embedded customer={`Outbound case ${caseId}`} caseId={caseId} />}
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

