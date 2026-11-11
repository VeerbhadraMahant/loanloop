import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-bank-line-strong bg-bank-surface px-6 py-12 text-center">
      <div aria-hidden className="mb-3 h-10 w-10 rounded-full bg-bank-accent-soft" />
      <p className="b-title text-lg text-bank-fg">{title}</p>
      {description && <p className="mt-1 max-w-md text-bank-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** `message` is the Error.message from the api helpers (already actionable). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bank-danger-fg/40 bg-bank-danger-bg px-4 py-3 text-bank-danger-fg">
      <div>
        <p className="font-medium">Could not load this data</p>
        <p className="text-sm">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="b-pressable min-h-9 rounded-md border border-current px-3 text-sm font-medium cursor-pointer">
          Try again
        </button>
      )}
    </div>
  );
}
