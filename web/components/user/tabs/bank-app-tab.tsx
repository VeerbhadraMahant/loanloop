"use client";

import React, { useState } from "react";
import { Approval, Sms, useEvents, useGet, post } from "@/lib/api";
import { CircularCountdown } from "@/app/phone/[customer]/phone-app";
import { Button, Empty, ErrorBox, Icon, Pill, Skeleton } from "@/components/ui";
import { useSession } from "@/lib/auth/auth-context";

export function BankAppTab() {
  const { user } = useSession();
  const customerRef = user?.customer_ref || "priya";
  const base = `/phone/${encodeURIComponent(customerRef)}`;

  const me = useGet<{ name: string; mobile_masked: string }>(base, 0);
  const sms = useGet<Sms[]>(`${base}/sms`, 3000);
  const appr = useGet<Approval[]>(`${base}/approvals`, 3000);

  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);

  useEvents((e) => {
    if (e.customer_key !== customerRef) return;
    if (e.type === "sms") sms.reload();
    if (e.type === "approval") appr.reload();
  });

  const pending = (appr.data ?? []).find((a) => a.status === "pending");

  const act = async (id: string | number, verb: "approve" | "deny") => {
    setBusy(true);
    setActErr(null);
    try {
      await post(`${base}/approvals/${encodeURIComponent(String(id))}/${verb}`);
      await appr.reload();
    } catch (e) {
      setActErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const copyText = (val: string, key: string | number) => {
    navigator.clipboard?.writeText(val);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const err = me.error ?? sms.error ?? appr.error ?? actErr;

  return (
    <div className="space-y-4 pb-4">
      {/* Bank App Header */}
      <div className="bg-card rounded-2xl p-3.5 border border-line shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-fg flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
            SFB
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-fg tracking-tight truncate">
              Inbox &amp; Approvals
            </h3>
            <p className="text-[10px] font-mono text-muted truncate">
              {me.data ? `${me.data.name} · ${me.data.mobile_masked}` : customerRef}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-ok-bg text-ok-fg text-[10px] font-mono font-medium border border-ok-border shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-ok-fg" />
          <span>Synced</span>
        </div>
      </div>

      <ErrorBox error={err} />

      {/* Pinned In-App Authorization Card (Tier 2 Action) */}
      {pending && (
        <section
          key={pending.id}
          className="rounded-2xl border border-warn-border bg-warn-bg/40 p-4 relative overflow-hidden shadow-xs ring-1 ring-warn-border/50"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn-border/60 text-warn-fg font-mono text-[10px] font-semibold">
              <Icon name="shield" size={11} />
              In-Call Authorization Needed
            </span>
            <span className="font-mono text-[10px] text-muted">ID: #{pending.id}</span>
          </div>

          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <h4 className="text-xs font-bold text-fg leading-snug">
                {pending.purpose}
              </h4>
              <p className="text-[11px] text-muted mt-1 leading-relaxed">
                Requested by Sahyadri Voice Assistant during your call. Authorizes changes to your loan ledger.
              </p>
            </div>
            {pending.created_at && (
              <CircularCountdown from={pending.created_at} to={pending.expires_at} />
            )}
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-warn-border/40">
            <Button
              small
              disabled={busy}
              onClick={() => act(pending.id, "approve")}
              className="flex-1 bg-ok-fg hover:bg-ok-fg/90 text-white font-bold text-xs"
            >
              <Icon name="check" size={13} />
              <span>{busy ? "Processing…" : "Approve Change"}</span>
            </Button>
            <Button
              small
              variant="secondary"
              disabled={busy}
              onClick={() => act(pending.id, "deny")}
              className="text-xs font-semibold"
            >
              Decline
            </Button>
          </div>
        </section>
      )}

      {/* Official SMS Inbox */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
            Official SMS Inbox
          </h3>
          <span className="font-mono text-[10px] text-muted">
            {sms.data ? `${sms.data.length} messages` : "Loading..."}
          </span>
        </div>

        {!sms.data ? (
          <Skeleton rows={3} />
        ) : sms.data.length === 0 ? (
          <Empty>No official SMS messages yet. Statements and alerts will appear here.</Empty>
        ) : (
          <div className="space-y-2.5">
            {sms.data.map((msg, idx) => (
              <div
                key={idx}
                className="bg-card rounded-xl p-3 border border-line shadow-xs space-y-2"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                  <span className="font-bold text-primary">SFB-BANK</span>
                  <span>
                    {msg.created_at
                      ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "Recent"}
                  </span>
                </div>
                <p className="text-xs text-fg leading-relaxed whitespace-pre-wrap font-sans">
                  {msg.body}
                </p>
                <div className="flex items-center justify-end pt-1 border-t border-line/50">
                  <button
                    type="button"
                    onClick={() => copyText(msg.body, idx)}
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-muted hover:text-fg cursor-pointer"
                  >
                    <Icon name={copiedId === idx ? "check" : "copy"} size={11} />
                    <span>{copiedId === idx ? "Copied" : "Copy Message"}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Loan Facility Details */}
      <section className="space-y-2 pt-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted px-1">
          Loan Account Details
        </h3>
        <div className="bg-card rounded-xl p-3.5 border border-line shadow-xs space-y-2 text-xs">
          <div className="flex justify-between items-center py-1 border-b border-line/60">
            <span className="text-muted">Borrower</span>
            <span className="font-semibold text-fg">{user?.name || "Priya Deshmukh"}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-line/60">
            <span className="text-muted">Account Number</span>
            <span className="font-mono text-fg">{user?.account_masked || "•••• 8201"}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-line/60">
            <span className="text-muted">Servicing Branch</span>
            <span className="text-fg">{user?.branch || "Kothrud, Pune"}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-line/60">
            <span className="text-muted">IFSC Code</span>
            <span className="font-mono text-fg">SFB0002104</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted">Security Verification</span>
            <Pill tone="ok">DOB Verified · Tier 1</Pill>
          </div>
        </div>
      </section>
    </div>
  );
}
