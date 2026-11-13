"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback } from "react";
import { UserShell } from "@/components/user/user-shell";
import { ApprovalCard } from "@/components/user/approval-sheet";
import { useI18n } from "@/lib/i18n";
import { fetchUserApprovals, fetchUserSms } from "@/lib/user/user-service";
import { Approval, Sms } from "@/lib/api";

export default function UserInboxPage() {
  const { t } = useI18n();

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [smsList, setSmsList] = useState<Sms[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [apprRes, smsRes] = await Promise.all([
        fetchUserApprovals(),
        fetchUserSms(),
      ]);
      setApprovals(Array.isArray(apprRes) ? apprRes : []);
      setSmsList(Array.isArray(smsRes) ? smsRes : []);
      setLoadError(null);
    } catch (err) {
      console.warn("loadData error:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  const pendingApprovals = (Array.isArray(approvals) ? approvals : []).filter((a) => a && a.status === "pending");
  const pastApprovals = (Array.isArray(approvals) ? approvals : []).filter((a) => a && a.status !== "pending");

  const copySms = (text: string, id: string | number) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <UserShell activeTab="inbox" title={t.inbox.title}>
      <div className="space-y-6">
        {loadError && (
          <div className="p-3 rounded-xl bg-danger-bg text-danger-fg text-xs border border-danger-line flex items-center justify-between">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={loadData}
              className="text-[11px] font-bold underline ml-2 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Approvals Section */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-warn-fg" />
              {t.inbox.pending_approvals}
            </h2>
            {pendingApprovals.length > 0 && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-warn-bg text-warn-fg border border-warn-border">
                {pendingApprovals.length} action required
              </span>
            )}
          </div>

          {loading && approvals.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted bg-card rounded-2xl border border-line">
              Loading requests...
            </div>
          ) : pendingApprovals.length > 0 ? (
            <div className="space-y-3">
              {pendingApprovals.map((appr) => (
                <ApprovalCard
                  key={appr.id}
                  approval={appr}
                  onResolved={loadData}
                />
              ))}
            </div>
          ) : (
            <div className="p-5 text-center bg-card rounded-2xl border border-line shadow-xs">
              <div className="w-10 h-10 rounded-full bg-surface-container mx-auto flex items-center justify-center text-muted mb-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                {t.inbox.no_approvals}
              </p>
            </div>
          )}
        </div>

        {/* Resolved Approvals (if any) */}
        {pastApprovals.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5 px-1">
              Resolved Approvals
            </h3>
            <div className="space-y-2">
              {pastApprovals.slice(0, 3).map((appr) => (
                <ApprovalCard
                  key={appr.id}
                  approval={appr}
                />
              ))}
            </div>
          </div>
        )}

        {/* Bank SMS Alerts History */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              {t.inbox.sms_heading}
            </h2>
            <span className="text-[10px] font-mono text-muted">VK-SAHYADRI</span>
          </div>

          {smsList.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted bg-card rounded-2xl border border-line">
              No recent SMS messages found.
            </div>
          ) : (
            <div className="space-y-2.5">
              {smsList.map((sms) => (
                <div
                  key={sms.id}
                  className="bg-card rounded-2xl p-4 border border-line shadow-xs relative group"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted mb-1.5">
                    <span className="font-bold text-fg">VK-SAHYADRI</span>
                    <span suppressHydrationWarning>
                      {sms.created_at ? new Date(sms.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : ""}
                    </span>
                  </div>

                  <p className="text-xs text-fg leading-relaxed font-sans select-text">
                    {sms.body}
                  </p>

                  <div className="flex items-center justify-end mt-2 pt-2 border-t border-line/60">
                    <button
                      type="button"
                      onClick={() => copySms(sms.body, sms.id)}
                      className="text-[10px] font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === sms.id ? (
                        <>
                          <svg className="w-3 h-3 text-ok-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy SMS
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </UserShell>
  );
}
