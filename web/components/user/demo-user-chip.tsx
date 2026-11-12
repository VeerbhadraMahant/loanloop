"use client";

import React, { useState } from "react";
import { useSession } from "@/lib/auth/auth-context";
import { DEMO_PERSONAS } from "@/lib/auth/dummy-auth-provider";

export function DemoUserChip() {
  const { user, switchDemoUser } = useSession();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-secondary-container/80 hover:bg-secondary-container text-on-secondary-fixed border border-line transition-colors active:scale-95"
      >
        <span className="w-4 h-4 rounded-full bg-primary text-primary-fg font-bold text-[9px] flex items-center justify-center">
          {user.initials}
        </span>
        <span className="truncate max-w-[80px]">{user.name.split(" ")[0]}</span>
        <svg
          className={`w-3 h-3 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-64 bg-card rounded-2xl border border-line shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2.5 py-1.5 mb-1 border-b border-line">
              <div className="text-[11px] font-bold text-fg">Switch Demo Borrower</div>
              <p className="text-[10px] text-muted">Test borrower workflows across risk tiers</p>
            </div>

            {(["priya", "ramesh", "sunita"] as const).map((key) => {
              const p = DEMO_PERSONAS[key];
              const isSelected = user.customer_ref === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    switchDemoUser(key);
                    setOpen(false);
                  }}
                  className={`w-full text-left p-2 rounded-xl flex items-start gap-2.5 transition-colors ${
                    isSelected
                      ? "bg-accent-soft text-accent-ink font-medium"
                      : "hover:bg-surface-container text-fg"
                  }`}
                >
                  <span className="w-6 h-6 rounded-lg bg-surface-container-high text-fg font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    {p.initials}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold flex items-center justify-between">
                      <span className="truncate">{p.name}</span>
                      <span className="text-[9px] font-mono text-muted">{p.tier_label.split(":")[0]}</span>
                    </div>
                    <div className="text-[10px] text-muted truncate">{p.loan_type}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
