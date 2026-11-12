"use client";
import { useEffect, type RefObject } from "react";

export function useDismiss({
  enabled,
  onDismiss,
  refs,
  closeOnOutsidePointer = true,
}: {
  enabled: boolean;
  onDismiss: () => void;
  refs: ReadonlyArray<RefObject<HTMLElement | null>>;
  closeOnOutsidePointer?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!closeOnOutsidePointer) return;
      const target = event.target as Node | null;
      if (target && refs.some((r) => r.current?.contains(target))) return;
      onDismiss();
    };

    document.addEventListener("keydown", onKeyDown);
    if (closeOnOutsidePointer) {
      document.addEventListener("pointerdown", onPointerDown);
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (closeOnOutsidePointer) {
        document.removeEventListener("pointerdown", onPointerDown);
      }
    };
  }, [enabled, onDismiss, refs, closeOnOutsidePointer]);
}
