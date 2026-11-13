"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { DevLabView } from "./dev-lab-view";
import { TestCasesView } from "./test-cases-view";
import { MetricsView } from "./metrics-view";
import { SlideOver } from "@/components/calling-desk/slide-over";
import { LiveCall } from "@/app/dev/live-call";
import type { Cfg } from "@/app/dev/api";
import { SidebarLayout } from "@/components/sidebar-nav";
import { Icon } from "@/components/ui";

type DevTab = "lab" | "test-cases" | "metrics";

// The slide-over reuses the Dev Lab's own live call (typed or voice turns, per-turn timings) with default model settings.
const DESK_CFG: Cfg = { name: "Calling Desk", llm: "ollama", model: "", settings: {} };

export function DevShell({ initialTab = "lab" }: { initialTab?: DevTab }) {
  const tabParam = useSearchParams().get("tab");
  const [activeTab, setActiveTab] = useState<DevTab>(tabParam === "lab" || tabParam === "test-cases" || tabParam === "metrics" ? tabParam : initialTab);
  const [deskOpen, setDeskOpen] = useState(false);
  const closeCallingDesk = () => setDeskOpen(false);

  return (
    <SidebarLayout title="Developer workspace" sub="Lab, test cases and metrics" status={
      <button type="button" onClick={() => setDeskOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-fg hover:opacity-90 transition-opacity cursor-pointer">
        <Icon name="support_agent" size={13} />
        <span>Open Calling Desk</span>
      </button>
    }>
    <div className="flex min-h-full flex-col justify-between selection:bg-primary/20">
      <div className="border-b border-line bg-card">
        {/* Console Top Tab Navigation */}
        <div className="border-t border-line/60 bg-sunken/40">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("lab")}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "lab"
                  ? "border-primary text-primary bg-card/60"
                  : "border-transparent text-muted hover:text-fg hover:bg-card/30"
              }`}
            >
              <span>Developer Lab</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-sunken border border-line text-muted">
                Model Parameters
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("test-cases")}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "test-cases"
                  ? "border-primary text-primary bg-card/60"
                  : "border-transparent text-muted hover:text-fg hover:bg-card/30"
              }`}
            >
              <span>Test Cases</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-sunken border border-line text-muted">
                TC-8801 … TC-8805
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("metrics")}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "metrics"
                  ? "border-primary text-primary bg-card/60"
                  : "border-transparent text-muted hover:text-fg hover:bg-card/30"
              }`}
            >
              <span>Metrics &amp; SLA</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-ok-bg text-ok-fg border border-ok-border">
                p95 &lt; 50ms
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Workspace */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {activeTab === "lab" && (
          <DevLabView />
        )}

        {activeTab === "test-cases" && (
          <TestCasesView />
        )}

        {activeTab === "metrics" && (
          <MetricsView />
        )}
      </main>

      <SlideOver
        open={deskOpen}
        onClose={closeCallingDesk}
        title="Calling Desk"
        sub="Voice pipeline inspector and per-turn latency"
        width="wide"
      >
        {deskOpen && (
          <div className="p-4">
            <LiveCall cfg={DESK_CFG} customer="priya" />
          </div>
        )}
      </SlideOver>

      {/* Desk Footer */}
      <footer className="border-t border-line bg-card py-3">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-muted">
          <div className="font-mono text-[11px]">
            Demo · synthetic data · Deterministic gateway telemetry (<span className="text-fg font-bold">50ms SLA</span>)
          </div>
          <div className="text-[11px]">
            Sahyadri Voice Systems Engineering
          </div>
        </div>
      </footer>
    </div>
    </SidebarLayout>
  );
}

