"use client";

import React, { useEffect, useRef } from "react";
import { Icon } from "@/components/ui";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  badge?: React.ReactNode;
  width?: "normal" | "wide";
  children: React.ReactNode;
}

export function SlideOver({
  open,
  onClose,
  title,
  sub,
  badge,
  width = "normal",
  children,
}: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc key closes panel
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Prevent background scroll when slideover is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const widthClass = width === "wide" ? "max-w-2xl" : "max-w-xl";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex justify-end overflow-hidden"
    >
      {/* Backdrop Scrim */}
      <div
        className="fixed inset-0 bg-fg/30 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className={`relative z-50 flex h-full w-full ${widthClass} flex-col border-l border-line bg-card shadow-2xl transition-transform animate-in slide-in-from-right duration-250 ease-out`}
      >
        {/* Slide-over Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5 bg-card/95 backdrop-blur-sm select-none">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-fg font-bold text-xs">
              <Icon name="support_agent" size={14} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 truncate">
                <span className="text-sm font-bold text-fg truncate">{title}</span>
                {badge}
              </div>
              {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline font-mono text-[10px] text-muted">Esc to close</span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-sunken text-muted hover:text-fg hover:bg-card transition-colors cursor-pointer"
              aria-label="Close slide-over panel"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        {/* Panel Content Area */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
