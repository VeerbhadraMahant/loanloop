"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DevLabView } from "./dev-lab-view";
import { TestCasesView } from "./test-cases-view";
import { MetricsView } from "./metrics-view";
import { SlideOver } from "@/components/calling-desk/slide-over";
import { CallingDeskView } from "@/components/calling-desk/calling-desk-view";
import { ThemeSelector } from "@/components/sidebar-nav";
import { Icon } from "@/components/ui";
import { getAuthAdapter } from "@/lib/auth/adapters";
import { DEMO_CONFIG } from "@/lib/auth/auth-config";

type DevTab = "lab" | "test-cases" | "metrics";

export function DevShell({
  initialTab = "lab",
  initialCallCustomer,
}: {
  initialTab?: DevTab;
  initialCallCustomer?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") as DevTab | null;
  const [activeTab, setActiveTab] = useState<DevTab>(tabParam || initialTab);

  // Calling Desk slide-over state
  const [slideOverCustomer, setSlideOverCustomer] = useState<string | null>(initialCallCustomer || null);

  const handleSignOut = () => {
    getAuthAdapter("dev").signOut();
    router.push("/dev/login");
  };

  const openCallingDesk = (customer: string = "priya") => {
    setSlideOverCustomer(customer);
  };

  const closeCallingDesk = () => {
    setSlideOverCustomer(null);
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-between selection:bg-primary/20">
      {/* Top Application Header */}
      <header className="border-b border-line bg-card/95 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-2.5 min-w-0 hover:opacity-85 transition-opacity" title="Return to Console Directory">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fg text-bg font-extrabold text-xs font-mono shadow-xs">
                DEV
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs font-bold text-fg tracking-tight">Sahyadri Voice Engine</span>
                  <span className="hidden md:inline font-normal text-muted text-[11px]">| Developer &amp; Telemetry Lab</span>
                </div>
                <div className="text-[10px] font-mono text-muted truncate">
                  Ollama qwen3:8b · Gateway :8000 · Voice :8100
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Open Calling Desk Shortcut */}
            <button
              type="button"
              onClick={() => openCallingDesk("priya")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-fg hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer"
            >
              <Icon name="support_agent" size={13} />
              <span>Open Calling Desk</span>
            </button>

            {/* Developer Identity Chip */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md border border-line bg-sunken text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
              <span className="font-semibold text-fg">{DEMO_CONFIG.dev.id}</span>
              <span className="text-muted">· Kavya Menon</span>
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
      </header>

      {/* Main Tab Workspace */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {activeTab === "lab" && (
          <DevLabView onLaunchCall={openCallingDesk} />
        )}

        {activeTab === "test-cases" && (
          <TestCasesView onStartTest={(customer) => openCallingDesk(customer)} />
        )}

        {activeTab === "metrics" && (
          <MetricsView />
        )}
      </main>

      {/* Calling Desk Slide-Over Panel (WITH Scenario Picker) */}
      <SlideOver
        open={Boolean(slideOverCustomer)}
        onClose={closeCallingDesk}
        title={`Calling Desk · ${slideOverCustomer?.toUpperCase()}`}
        sub="Voice pipeline inspector, live STT transcription & turn latency profiling"
        width="wide"
      >
        {slideOverCustomer && (
          <CallingDeskView
            customer={slideOverCustomer}
            variant="slide-over-dev"
            onCustomerChange={(newCust) => setSlideOverCustomer(newCust)}
            onClose={closeCallingDesk}
          />
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
  );
}

