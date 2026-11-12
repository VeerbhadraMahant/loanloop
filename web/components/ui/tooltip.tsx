"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cx } from "@/components/ui/tooltip-utils/cx";
import type { Align, Placement } from "@/components/ui/tooltip-utils/types";
import { useDismiss } from "@/components/ui/tooltip-utils/useDismiss";
import { Anchor } from "@/components/ui/tooltip-utils/Anchor";
import { useFloatingSurface } from "@/components/ui/tooltip-utils/useFloatingSurface";
import { Portal } from "@/components/ui/tooltip-utils/Portal";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  placement?: Placement;
  align?: Align;
  offset?: number;
  delay?: number;
  className?: string;
  triggerClassName?: string;
}

export default function Tooltip({
  content,
  children,
  placement = "top",
  align = "center",
  offset = 8,
  delay = 200,
  className,
  triggerClassName,
}: TooltipProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [open, setOpen] = useState(false);
  const {
    anchorRef,
    panelRef,
    panelId,
    mounted,
    state,
    position,
    refs,
  } = useFloatingSurface({
    open,
    placement,
    align,
    offset,
    duration: 150,
    idSuffix: "tooltip",
  });

  const show = useCallback(
    (immediate = false) => {
      clearTimeout(timerRef.current);
      if (immediate || delay === 0) setOpen(true);
      else timerRef.current = setTimeout(() => setOpen(true), delay);
    },
    [delay],
  );

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setOpen(false);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  useDismiss({
    enabled: open,
    onDismiss: hide,
    refs,
    closeOnOutsidePointer: false,
  });

  return (
    <>
      <Anchor
        ref={anchorRef}
        className={triggerClassName}
        aria-describedby={mounted ? panelId : undefined}
        onPointerEnter={(event: PointerEvent<HTMLSpanElement>) => {
          if (event.pointerType !== "touch") show();
        }}
        onPointerLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
      >
        {children}
      </Anchor>
      {mounted && (
        <Portal>
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            className={cx("mors-tooltip", className)}
            style={position.style}
            data-state={state}
            data-placement={position.placement}
          >
            {content}
          </div>
        </Portal>
      )}
    </>
  );
}
