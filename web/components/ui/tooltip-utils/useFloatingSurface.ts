"use client";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Align, Placement } from "@/components/ui/tooltip-utils/types";

const MARGIN = 8;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeCoords(
  anchor: DOMRect,
  panel: DOMRect,
  preferred: Placement,
  align: Align,
  offset: number,
): { top: number; left: number; placement: Placement } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let placement = preferred;
  if (preferred === "top" && anchor.top - panel.height - offset < MARGIN && anchor.bottom + panel.height + offset <= vh - MARGIN) {
    placement = "bottom";
  } else if (preferred === "bottom" && anchor.bottom + panel.height + offset > vh - MARGIN && anchor.top - panel.height - offset >= MARGIN) {
    placement = "top";
  } else if (preferred === "left" && anchor.left - panel.width - offset < MARGIN && anchor.right + panel.width + offset <= vw - MARGIN) {
    placement = "right";
  } else if (preferred === "right" && anchor.right + panel.width + offset > vw - MARGIN && anchor.left - panel.width - offset >= MARGIN) {
    placement = "left";
  }

  let top = 0;
  let left = 0;

  if (placement === "top" || placement === "bottom") {
    top = placement === "top" ? anchor.top - panel.height - offset : anchor.bottom + offset;
    if (align === "start") left = anchor.left;
    else if (align === "end") left = anchor.right - panel.width;
    else left = anchor.left + anchor.width / 2 - panel.width / 2;
  } else {
    left = placement === "left" ? anchor.left - panel.width - offset : anchor.right + offset;
    if (align === "start") top = anchor.top;
    else if (align === "end") top = anchor.bottom - panel.height;
    else top = anchor.top + anchor.height / 2 - panel.height / 2;
  }

  return {
    top: clamp(top, MARGIN, Math.max(MARGIN, vh - panel.height - MARGIN)),
    left: clamp(left, MARGIN, Math.max(MARGIN, vw - panel.width - MARGIN)),
    placement,
  };
}

export function useFloatingSurface({
  open,
  placement,
  align,
  offset,
  duration,
  idSuffix,
}: {
  open: boolean;
  placement: Placement;
  align: Align;
  offset: number;
  duration: number;
  idSuffix: string;
}) {
  const uid = useId();
  const panelId = `${uid}-${idSuffix}`;
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const refs = useMemo(() => [anchorRef, triggerRef, panelRef] as const, []);

  const setTriggerRef = useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
  }, []);

  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<"open" | "closed">("closed");
  const [position, setPosition] = useState<{ style: CSSProperties; placement: Placement }>({
    style: { position: "fixed", top: -9999, left: -9999 },
    placement,
  });

  const measure = useCallback(() => {
    const target = anchorRef.current ?? triggerRef.current;
    const panel = panelRef.current;
    if (!target || !panel) return;
    const anchorRect = target.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const coords = computeCoords(anchorRect, panelRect, placement, align, offset);
    setPosition({
      placement: coords.placement,
      style: {
        position: "fixed",
        top: Math.round(coords.top),
        left: Math.round(coords.left),
      },
    });
  }, [placement, align, offset]);

  useEffect(() => {
    if (open) {
      const mountFrame = requestAnimationFrame(() => {
        setMounted(true);
        requestAnimationFrame(() => {
          measure();
          setState("open");
        });
      });
      return () => cancelAnimationFrame(mountFrame);
    }

    const closeFrame = requestAnimationFrame(() => setState("closed"));
    const unmountTimer = setTimeout(() => setMounted(false), duration);
    return () => {
      cancelAnimationFrame(closeFrame);
      clearTimeout(unmountTimer);
    };
  }, [open, duration, measure]);

  useEffect(() => {
    if (!mounted || !open) return;
    const onRelocate = () => measure();
    window.addEventListener("scroll", onRelocate, true);
    window.addEventListener("resize", onRelocate);
    return () => {
      window.removeEventListener("scroll", onRelocate, true);
      window.removeEventListener("resize", onRelocate);
    };
  }, [mounted, open, measure]);

  return {
    anchorRef,
    triggerRef,
    setTriggerRef,
    panelRef,
    panelId,
    mounted,
    state,
    position,
    refs,
  };
}
