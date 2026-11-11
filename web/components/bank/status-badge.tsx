import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "bg-bank-ok-bg text-bank-ok-fg",
  warn: "bg-bank-warn-bg text-bank-warn-fg",
  danger: "bg-bank-danger-bg text-bank-danger-fg",
  info: "bg-bank-info-bg text-bank-info-fg",
  neutral: "bg-bank-sunken text-bank-muted",
};
// Shape, not just colour, so tone survives colour blindness.
const MARK: Record<Tone, string> = { ok: "●", warn: "▲", danger: "◆", info: "■", neutral: "○" };

export function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      <span aria-hidden className="text-[8px] leading-none">{MARK[tone]}</span>
      {children}
    </span>
  );
}
