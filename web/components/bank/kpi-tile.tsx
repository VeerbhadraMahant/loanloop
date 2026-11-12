import type { ReactNode } from "react";
import type { Tone } from "./status-badge";

const EDGE: Record<Tone, string> = {
  ok: "border-l-bank-ok-fg", warn: "border-l-bank-warn-fg", danger: "border-l-bank-danger-fg",
  info: "border-l-bank-accent", neutral: "border-l-bank-line-strong",
};

/** One figure with its label. `tone` colours the left edge only; `loading` shows a skeleton value. */
export function KpiTile({ label, value, hint, tone = "neutral", loading }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; loading?: boolean;
}) {
  return (
    <div className={`h-full rounded-lg border border-l-4 border-bank-line bg-bank-surface px-4 py-3 transition-colors duration-150 group-hover:border-bank-accent group-hover:bg-bank-sunken/60 group-focus-visible:border-bank-accent ${EDGE[tone]}`}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-bank-muted">
        <span>{label}</span>
        <span aria-hidden className="text-[11px] opacity-60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-bank-accent-ink group-hover:opacity-100">
          ↗
        </span>
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-8 w-24" aria-label="Loading" />
      ) : (
        <div className="b-title b-num mt-1 text-[30px] leading-9 text-bank-fg">{value}</div>
      )}
      {hint && <div className="mt-0.5 text-xs text-bank-muted">{hint}</div>}
    </div>
  );
}
