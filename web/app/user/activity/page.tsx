"use client";

import React, { useState } from "react";
import { UserShell } from "@/components/user/user-shell";
import { useI18n } from "@/lib/i18n";

export default function UserActivityPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"requests" | "calls">("requests");

  const serviceRequests = [
    {
      id: "SR-8801",
      title: "EMI Date Modification",
      desc: "Requested change of auto-debit cycle from 5th to 10th",
      date: "Today, 10:45 AM",
      status: "Approved",
      statusTone: "ok",
    },
    {
      id: "SR-8742",
      title: "Account Statement Dispatch",
      desc: "Instant mini-statement sent via SMS",
      date: "Yesterday",
      status: "Delivered",
      statusTone: "ok",
    },
    {
      id: "SR-8610",
      title: "Interest Certificate Download",
      desc: "Provisional interest certificate for FY 2026-27",
      date: "04 Nov 2026",
      status: "Completed",
      statusTone: "ok",
    },
  ];

  const callHistory = [
    {
      id: "CALL-9912",
      duration: "1 min 42 sec",
      language: "Hinglish / हिंदी",
      date: "Today, 10:44 AM",
      outcome: "Task Completed",
      summary: "Customer inquired about next EMI due date and modified cycle date to 10th.",
    },
    {
      id: "CALL-9850",
      duration: "48 sec",
      language: "English",
      date: "04 Nov 2026",
      outcome: "Information Provided",
      summary: "Inquired about Kothrud branch hours and IFSC code.",
    },
  ];

  return (
    <UserShell activeTab="activity" title={t.activity.title}>
      <div className="space-y-4">
        {/* Segmented Tab Switcher */}
        <div className="flex items-center p-1 bg-surface-container rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setActiveTab("requests")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "requests"
                ? "bg-card text-primary shadow-xs border border-line"
                : "text-muted hover:text-fg"
            }`}
          >
            {t.activity.tab_requests}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("calls")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "calls"
                ? "bg-card text-primary shadow-xs border border-line"
                : "text-muted hover:text-fg"
            }`}
          >
            {t.activity.tab_calls}
          </button>
        </div>

        {/* Tab 1: Service Requests */}
        {activeTab === "requests" && (
          <div className="space-y-2.5">
            {serviceRequests.map((req) => (
              <div
                key={req.id}
                className="bg-card rounded-2xl p-4 border border-line shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-muted block">
                      {req.id}
                    </span>
                    <h3 className="text-xs font-bold text-fg">{req.title}</h3>
                  </div>

                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-ok-bg text-ok-fg border border-ok-border">
                    {req.status}
                  </span>
                </div>

                <p className="text-xs text-muted leading-relaxed mb-3">
                  {req.desc}
                </p>

                <div className="text-[10px] font-mono text-muted pt-2 border-t border-line/60 flex items-center justify-between">
                  <span>{req.date}</span>
                  <span className="text-primary font-medium">Sahyadri Voice Agent</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Call Records */}
        {activeTab === "calls" && (
          <div className="space-y-2.5">
            {callHistory.map((call) => (
              <div
                key={call.id}
                className="bg-card rounded-2xl p-4 border border-line shadow-xs"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-muted mb-2">
                  <span className="font-bold text-fg">{call.id}</span>
                  <span>{call.date}</span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-surface-container text-fg">
                    {call.duration}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-secondary-container text-on-secondary-fixed">
                    {call.language}
                  </span>
                </div>

                <p className="text-xs text-fg leading-relaxed mb-3">
                  {call.summary}
                </p>

                <div className="text-[10px] font-mono text-ok-fg pt-2 border-t border-line/60 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{call.outcome}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </UserShell>
  );
}
