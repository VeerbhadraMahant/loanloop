"use client";

import React, { useState } from "react";
import { Approval } from "@/lib/api";
import { CircularCountdown } from "@/app/phone/phone-app";
import { respondToApproval } from "@/lib/user/user-service";
import { useI18n } from "@/lib/i18n";

interface ApprovalCardProps {
  approval: Approval;
  onResolved?: () => void;
}

export function ApprovalCard({ approval, onResolved }: ApprovalCardProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecision = async (verb: "approve" | "deny") => {
    setBusy(true);
    setError(null);
    const res = await respondToApproval(approval.id, verb);
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
      className={`rounded-xl p-4 transition-colors ${
        isPending
          ? "bg-warn-bg ring-1 ring-warn-border"
          : "bg-surface-container ring-1 ring-fg/[0.04]"
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
                : "bg-warn-fg motion-safe:animate-pulse"
            }`}
          />
          <span className="text-sm font-medium uppercase tracking-wider text-fg">
            {isPending ? t.inbox.pending_approvals : `Status: ${approval.status}`}
          </span>
        </div>

        {isPending && approval.created_at && approval.expires_at && (
          <CircularCountdown from={approval.created_at} to={approval.expires_at} />
        )}
      </div>

      <p className="text-sm font-medium text-fg mb-1 leading-snug">
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
        <div className="text-sm text-danger-fg bg-danger-bg p-2 rounded-lg mb-3">
          {error}
        </div>
      )}

      {isPending ? (
        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleDecision("approve")}
            className="flex-1 min-h-11 py-2.5 px-4 rounded-xl font-medium text-base bg-primary text-primary-fg hover:bg-accent-hover motion-safe:active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
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
            className="min-h-11 py-2.5 px-4 rounded-xl font-medium text-base bg-transparent hover:bg-danger-bg hover:text-danger-fg text-fg border border-outline-variant motion-safe:active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            {t.inbox.decline}
          </button>
        </div>
      ) : (
        <div className="text-sm font-medium text-muted">
          This request was marked as <span className="font-medium text-fg capitalize">{approval.status}</span>.
        </div>
      )}
    </div>
  );
}
