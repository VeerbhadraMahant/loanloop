"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from "react";
import { CallingDeskView, type Status } from "@/components/calling-desk/calling-desk-view";
import { useSession } from "@/lib/auth/auth-context";
import { fetchUserApprovals, respondToApproval } from "@/lib/user/user-service";
import { Approval, useEvents } from "@/lib/api";
import { Icon } from "@/components/ui";
import { CircularCountdown } from "@/app/phone/[customer]/phone-app";

interface CallingDeskTabProps {
  presetUtterance?: string;
  onCallStateChange?: (state: { inCall: boolean; status: Status; duration: number }) => void;
  onGoToBankApp?: () => void;
}

export function CallingDeskTab({
  presetUtterance,
  onCallStateChange,
  onGoToBankApp,
}: CallingDeskTabProps) {
  const { user } = useSession();
  const customerRef = user?.customer_ref || "priya";

  const [pendingApproval, setPendingApproval] = useState<Approval | null>(null);
  const [busyApproval, setBusyApproval] = useState(false);

  const loadApprovals = async () => {
    try {
      const list = await fetchUserApprovals(customerRef);
      const pending = list.find((a) => a.status === "pending") || null;
      setPendingApproval(pending);
    } catch {
      setPendingApproval(null);
    }
  };

  useEffect(() => {
    loadApprovals();
    const interval = setInterval(loadApprovals, 3000);
    return () => clearInterval(interval);
  }, [customerRef]);

  useEvents((e) => {
    if (e.customer_key === customerRef && (e.type === "approval" || e.type === "action")) {
      loadApprovals();
    }
  });

  const handleQuickDecision = async (verb: "approve" | "deny") => {
    if (!pendingApproval) return;
    setBusyApproval(true);
    await respondToApproval(customerRef, pendingApproval.id, verb);
    setBusyApproval(false);
    loadApprovals();
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Pending In-Call Approval Floating Notification Banner */}
      {pendingApproval && (
        <div className="p-3 mx-2 my-2 rounded-xl bg-warn-bg border border-warn-border shadow-sm flex flex-col gap-2 shrink-0 animate-fade-in z-20">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-warn-fg animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-warn-fg">
                Authorization Needed
              </span>
            </div>
            {pendingApproval.created_at && (
              <CircularCountdown from={pendingApproval.created_at} to={pendingApproval.expires_at} />
            )}
          </div>

          <p className="text-xs font-semibold text-fg leading-snug">
            {pendingApproval.purpose}
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busyApproval}
              onClick={() => handleQuickDecision("approve")}
              className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-ok-fg text-white hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <Icon name="check" size={13} />
              <span>Approve</span>
            </button>
            <button
              type="button"
              disabled={busyApproval}
              onClick={() => handleQuickDecision("deny")}
              className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-sunken text-muted hover:text-fg border border-line cursor-pointer"
            >
              Decline
            </button>
            {onGoToBankApp && (
              <button
                type="button"
                onClick={onGoToBankApp}
                className="py-1.5 px-2 text-[10px] text-muted hover:text-primary font-mono underline cursor-pointer"
              >
                Bank Details →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Calling Desk View */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CallingDeskView
          customer={customerRef}
          variant="phone-tab"
          presetUtterance={presetUtterance}
          onCallStateChange={onCallStateChange}
        />
      </div>
    </div>
  );
}
