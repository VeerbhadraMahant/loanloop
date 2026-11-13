"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CollectionsView } from "./collections-view";
import { OpsView } from "./ops-view";
import { SlideOver } from "@/components/calling-desk/slide-over";
import CallApp from "@/app/call/call-app";
import { SidebarLayout } from "@/components/sidebar-nav";

type StaffTab = "collections" | "ops";

export function StaffShell({ initialTab = "collections" }: { initialTab?: StaffTab }) {
  const tabParam = useSearchParams().get("tab");
  const [activeTab, setActiveTab] = useState<StaffTab>(tabParam === "ops" || tabParam === "collections" ? tabParam : initialTab);
  // Staff calls go through the outbound case path (/voice-out), never "as" a customer picked by name.
  const [caseId, setCaseId] = useState<number | null>(null);
  const closeCallingDesk = () => setCaseId(null);

  return (
    <SidebarLayout title="Staff desk" sub="Collections and live operations">
    <div className="flex min-h-full flex-col justify-between selection:bg-primary/20">
      <div className="border-b border-line bg-card">
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
      </div>

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
    </SidebarLayout>
  );
}

