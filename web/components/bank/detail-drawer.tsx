"use client";
import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/** Right-side modal panel. Render it always; it returns null when `open` is false. Esc, scrim click or the close button call onClose. */
export function DetailDrawer({ open, onClose, title, subtitle, children }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; prev?.focus(); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="b-scrim absolute inset-0 bg-[var(--b-scrim)]" onClick={onClose} aria-hidden />
      <div
        ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className="b-drawer relative flex h-full w-full max-w-xl flex-col border-l border-bank-line bg-bank-surface text-bank-fg shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-bank-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="b-title text-xl leading-7">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-bank-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close panel" className="b-pressable -mr-2 grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-md text-bank-muted hover:bg-bank-sunken">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
