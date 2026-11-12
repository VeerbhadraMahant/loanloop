import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "@/components/ui/tooltip-utils/cx";

export interface AnchorProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export const Anchor = forwardRef<HTMLSpanElement, AnchorProps>(
  function Anchor({ children, className, ...props }, ref) {
    return (
      <span
        ref={ref}
        className={cx("inline-block", className)}
        {...props}
      >
        {children}
      </span>
    );
  },
);
