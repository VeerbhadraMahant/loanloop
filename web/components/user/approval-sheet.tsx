"use client";

import React, { useState } from "react";
import { Approval } from "@/lib/api";
import { CircularCountdown } from "@/app/phone/phone-app";
import { respondToApproval } from "@/lib/user/user-service";
import { useI18n } from "@/lib/i18n";

interface ApprovalCardProps {
  approval: Approval;
  customerRef: string;
  onResolved?: () => void;
}

export function ApprovalCard({ approval, customerRef, onResolved }: ApprovalCardProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecision = async (verb: "approve" | "deny") => {
    setBusy(true);
    setError(null);
    const res = await respondToApproval(customerRef, approval.id, verb);
    setBusy(false);
    if (res.success) {
      onResolved?.();
    } else {
      setError(res.error ?? "Failed to update approval");
    }
  };

  const isPending = approval.status === "pending";

  return (
    <div
      className={`rounded-2xl p-4 border transition-all ${
        isPending
          ? "bg-warn-bg/25 border-warn-border/80 shadow-md ring-1 ring-warn-border/40"
          : "bg-card border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              approval.status === "approved"
                ? "bg-ok-fg"
                : approval.status === "denied"
                ? "bg-danger-fg"
                : "bg-warn-fg animate-pulse"
            }`}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-fg">
            {isPending ? t.inbox.pending_approvals : `Status: ${approval.status}`}
          </span>
        </div>

        {isPending && approval.created_at && approval.expires_at && (
          <CircularCountdown from={approval.created_at} to={approval.expires_at} />
        )}
      </div>

      <p className="text-sm font-semibold text-fg mb-1 leading-snug">
        {approval.purpose}
      </p>

      <div className="text-[11px] font-mono text-muted mb-4 flex items-center gap-2">
        <span>ID: #{String(approval.id)}</span>
        <span>·</span>
        <span suppressHydrationWarning>
          {approval.created_at
            ? new Date(approval.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "Recent"}
        </span>
      </div>

      {error && (
        <div className="text-xs text-danger-fg bg-danger-bg p-2 rounded-lg mb-3">
          {error}
        </div>
      )}

      {isPending ? (
        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleDecision("approve")}
            className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs bg-ok-fg text-white hover:bg-ok-fg/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {t.inbox.approve}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => handleDecision("deny")}
            className="py-2.5 px-4 rounded-xl font-bold text-xs bg-surface-container hover:bg-danger-bg hover:text-danger-fg text-fg border border-line active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            {t.inbox.decline}
          </button>
        </div>
      ) : (
        <div className="text-xs font-medium text-muted">
          This request was marked as <span className="font-bold text-fg capitalize">{approval.status}</span>.
        </div>
      )}
    </div>
  );
}
