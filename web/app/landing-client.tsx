"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeSelector } from "@/components/sidebar-nav";
import { SESSION_STORAGE_KEYS } from "@/lib/auth/auth-config";

type ConsoleTab = "all" | "user" | "staff" | "dev";

interface ActiveSessions {
  user: string | null;
  staff: string | null;
  dev: string | null;
}

export function LandingClient() {
  const [tab, setTab] = useState<ConsoleTab>("all");
  const [sessions, setSessions] = useState<ActiveSessions>({
    user: null,
    staff: null,
    dev: null,
  });

  useEffect(() => {
    try {
      const userRaw = localStorage.getItem(SESSION_STORAGE_KEYS.user);
      const staffRaw = localStorage.getItem(SESSION_STORAGE_KEYS.staff);
      const devRaw = localStorage.getItem(SESSION_STORAGE_KEYS.dev);

      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate client sessions from storage on mount
      setSessions({
        user: userRaw ? JSON.parse(userRaw)?.customer_ref || "Active" : null,
        staff: staffRaw ? JSON.parse(staffRaw)?.identifier || "Active" : null,
        dev: devRaw ? JSON.parse(devRaw)?.identifier || "Active" : null,
      });
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-between selection:bg-primary/20">
      {/* Top Banner / Navbar */}
      <header className="border-b border-line bg-card/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg font-extrabold text-sm shadow-xs">
              SFB
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-fg tracking-tight">Sahyadri Finance Bank</span>
                <span className="hidden sm:inline-block text-xs text-muted font-normal">
                  | सह्याद्री फायनान्स बँक
                </span>
              </div>
              <div className="text-[11px] font-mono text-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
                <span>Voice Servicing &amp; Operations Portal</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="w-48 hidden sm:block">
              <ThemeSelector />
            </div>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 w-full space-y-8">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/20 bg-secondary-container/60 text-xs font-semibold text-on-secondary-fixed">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>Three Isolated Consoles · RBI Recovery &amp; Servicing</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-fg tracking-tight leading-tight">
            Select Console Access Point
          </h1>
          <p className="text-sm sm:text-base text-muted leading-relaxed">
            LoanLoop separates consumer borrowers, bank operations staff, and voice AI systems engineers into dedicated consoles with separate sessions and strict role isolation.
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 border-b border-line pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === "all"
                ? "bg-primary text-primary-fg shadow-xs"
                : "text-muted hover:text-fg hover:bg-sunken"
            }`}
          >
            All Consoles (3)
          </button>
          <button
            type="button"
            onClick={() => setTab("user")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              tab === "user"
                ? "bg-primary text-primary-fg shadow-xs"
                : "text-muted hover:text-fg hover:bg-sunken"
            }`}
          >
            <span>Borrower (Phone)</span>
            {sessions.user && (
              <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("staff")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              tab === "staff"
                ? "bg-primary text-primary-fg shadow-xs"
                : "text-muted hover:text-fg hover:bg-sunken"
            }`}
          >
            <span>Bank Staff (Laptop)</span>
            {sessions.staff && (
              <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("dev")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              tab === "dev"
                ? "bg-primary text-primary-fg shadow-xs"
                : "text-muted hover:text-fg hover:bg-sunken"
            }`}
          >
            <span>Developer (Lab)</span>
            {sessions.dev && (
              <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
            )}
          </button>
        </div>

        {/* Three Console Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Card 1: Borrower Console */}
          {(tab === "all" || tab === "user") && (
            <div className="group rounded-2xl border border-line bg-card p-6 flex flex-col justify-between hover:border-primary/50 transition-all shadow-xs relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-secondary-container text-on-secondary-fixed">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span>Phone-First</span>
                  </span>
                  {sessions.user ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ok-fg bg-ok-bg px-2 py-0.5 rounded border border-ok-border">
                      <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
                      Active: {sessions.user.toUpperCase()}
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-muted">Demo OTP</span>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold text-fg group-hover:text-primary transition-colors">
                    Borrower Console
                  </h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Designed for borrowers on smartphone. Voice turn assistant, SMS updates, and out-of-band Tier-2 approval sheet.
                  </p>
                </div>

                <div className="space-y-2 border-t border-line/70 pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Key Safeguards
                  </div>
                  <ul className="space-y-1.5 text-xs text-fg">
                    <li className="flex items-start gap-2">
                      <span className="text-ok-fg mt-0.5 font-bold">✓</span>
                      <span>Zero Secrets: Never takes PINs or OTPs</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-ok-fg mt-0.5 font-bold">✓</span>
                      <span>Multilingual: Marathi, Hindi &amp; English</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-ok-fg mt-0.5 font-bold">✓</span>
                      <span>Tier-2 In-App Approvals with countdown</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-6 mt-4 border-t border-line space-y-2">
                <Link
                  href={sessions.user ? "/user/home" : "/user/welcome"}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-primary text-primary-fg hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <span>{sessions.user ? "Continue as Borrower →" : "Launch Borrower Console →"}</span>
                </Link>
                <div className="text-center text-[10px] font-mono text-muted">
                  Demo Borrowers: Priya, Ramesh, Sunita
                </div>
              </div>
            </div>
          )}

          {/* Card 2: Staff Console */}
          {(tab === "all" || tab === "staff") && (
            <div className="group rounded-2xl border border-line bg-card p-6 flex flex-col justify-between hover:border-primary/50 transition-all shadow-xs relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-sunken text-fg border border-line">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Laptop / PC</span>
                  </span>
                  {sessions.staff ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ok-fg bg-ok-bg px-2 py-0.5 rounded border border-ok-border">
                      <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
                      Active: {sessions.staff}
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-muted">Staff ID Auth</span>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold text-fg group-hover:text-primary transition-colors">
                    Bank Staff Console
                  </h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Collections workflow, delinquency queues, real-time SSE operations desk, and supervisor handovers.
                  </p>
                </div>

                <div className="space-y-2 border-t border-line/70 pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Workspaces Included
                  </div>
                  <ul className="space-y-1.5 text-xs text-fg">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5 font-bold">▪</span>
                      <span>Collections: Overdue buckets &amp; PTPs</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5 font-bold">▪</span>
                      <span>Ops Console: Live timeline &amp; call stream</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5 font-bold">▪</span>
                      <span>Bank App: Servicing &amp; compliance desk</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-6 mt-4 border-t border-line space-y-2">
                <Link
                  href={sessions.staff ? "/staff/overview" : "/staff/login"}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-card border border-line hover:bg-sunken text-fg active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <span>{sessions.staff ? "Open Staff Overview →" : "Staff Sign In →"}</span>
                </Link>
                <div className="text-center text-[10px] font-mono text-muted">
                  Demo: STAFF-104 / sahyadri@staff
                </div>
              </div>
            </div>
          )}

          {/* Card 3: Developer Lab */}
          {(tab === "all" || tab === "dev") && (
            <div className="group rounded-2xl border border-line bg-card p-6 flex flex-col justify-between hover:border-primary/50 transition-all shadow-xs relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-sunken text-fg border border-line">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    <span>Laptop / PC</span>
                  </span>
                  {sessions.dev ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ok-fg bg-ok-bg px-2 py-0.5 rounded border border-ok-border">
                      <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
                      Active: {sessions.dev}
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-muted">Dev Passcode</span>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold text-fg group-hover:text-primary transition-colors">
                    Developer Lab
                  </h3>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Voice agent engine tuning, automated test suites (TC-8801 to TC-8805), and telemetry latency SLA benchmarks.
                  </p>
                </div>

                <div className="space-y-2 border-t border-line/70 pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Engineering Capabilities
                  </div>
                  <ul className="space-y-1.5 text-xs text-fg">
                    <li className="flex items-start gap-2">
                      <span className="text-fg mt-0.5 font-bold">▪</span>
                      <span>Ollama LLM loop &amp; STT model inspection</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-fg mt-0.5 font-bold">▪</span>
                      <span>5 Deterministic scenario test suites</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-fg mt-0.5 font-bold">▪</span>
                      <span>Latency telemetry: p50/p95/p99 &lt; 50 ms</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-6 mt-4 border-t border-line space-y-2">
                <Link
                  href={sessions.dev ? "/dev" : "/dev/login"}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-card border border-line hover:bg-sunken text-fg active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <span>{sessions.dev ? "Enter Developer Lab →" : "Developer Sign In →"}</span>
                </Link>
                <div className="text-center text-[10px] font-mono text-muted">
                  Demo: DEV-202 / sahyadri@dev
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Shared Engineering & Testing Tools Strip */}
        <div className="rounded-xl border border-line bg-sunken/40 p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Shared Engine Testing Tools
              </h4>
              <p className="text-xs text-muted mt-0.5">
                Direct links used by test harnesses, collections dialers, and simulation benchmarks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/call/priya"
                className="px-3 py-1.5 rounded-lg border border-line bg-card hover:bg-sunken text-xs font-semibold text-fg flex items-center gap-1.5 transition-colors"
              >
                <span>Calling Desk (Priya)</span>
              </Link>
              <Link
                href="/phone/priya"
                className="px-3 py-1.5 rounded-lg border border-line bg-card hover:bg-sunken text-xs font-mono text-muted hover:text-fg transition-colors"
              >
                Priya&apos;s Phone
              </Link>
              <Link
                href="/phone/ramesh"
                className="px-3 py-1.5 rounded-lg border border-line bg-card hover:bg-sunken text-xs font-mono text-muted hover:text-fg transition-colors"
              >
                Ramesh&apos;s Phone
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-card py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
          <div>
            Sahyadri Finance Bank Ltd · Voice Servicing Operations
          </div>
          <div className="font-mono text-[11px] text-center sm:text-right">
            Synthetic environment · No real customer data processed
          </div>
        </div>
      </footer>
    </div>
  );
}
