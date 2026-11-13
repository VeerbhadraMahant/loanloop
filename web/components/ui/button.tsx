import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
} from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
type Size = "default" | "sm" | "lg" | "icon";

const BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-semibold transition-[color,background-color,border-color,transform] duration-150 ease-out motion-reduce:transition-none cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

const VARIANT_CLASSES: Record<Variant, string> = {
  default: "bg-primary text-primary-fg hover:bg-accent-hover shadow-xs",
  destructive: "bg-danger-fg text-white hover:opacity-90 shadow-xs",
  outline: "border border-line-strong bg-card text-fg hover:bg-sunken shadow-xs",
  secondary: "border border-line bg-sunken text-fg hover:bg-accent-soft hover:text-accent-ink",
  ghost: "text-muted hover:bg-sunken hover:text-fg",
  link: "text-primary underline-offset-4 hover:underline",
};

const SIZE_CLASSES: Record<Size, string> = {
  default: "h-9 px-3.5 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-6 text-sm",
  icon: "h-9 w-9",
};

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(BASE, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, children, ...props }, ref) => {
    const classes = buttonVariants({ variant, size, className });
    if (asChild && isValidElement(children)) {
      const child = children as ReactElement<{ className?: string }>;
      return cloneElement(child, {
        ...props,
        className: cn(classes, child.props.className),
      });
    }
    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button };
