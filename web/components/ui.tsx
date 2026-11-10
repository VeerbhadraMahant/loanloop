import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";
import { SidebarLayout } from "@/components/sidebar-nav";

export function Wordmark() {
  return (
    <span className="serif text-[24px] font-semibold text-primary tracking-tight">
      LoanLoop
    </span>
  );
}

/** Page chrome: vertical sidebar + content. */
export function Shell({
  title,
  sub,
  status,
  children,
}: {
  title: string;
  sub?: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SidebarLayout title={title} sub={sub} status={status}>
      <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-5 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <h1 className="serif text-3xl font-semibold leading-tight sm:text-4xl text-fg">
              {title}
            </h1>
            {sub && <p className="mt-1 text-xs sm:text-sm text-muted max-w-3xl leading-relaxed">{sub}</p>}
          </div>
          {status && <div className="shrink-0">{status}</div>}
        </div>
        {children}
      </div>
    </SidebarLayout>
  );
}

type BtnProps = {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  small?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "primary",
  small,
  className = "",
  href,
  ...rest
}: BtnProps & { href?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = `btn btn-${variant} ${small ? "btn-sm" : ""} ${className}`;
  if (href) return <Link href={href} className={cls}>{rest.children}</Link>;
  return <button type="button" {...rest} className={cls} />;
}

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "li";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      {...rest}
      className={`rounded-xl border border-line bg-card shadow-[0_1px_3px_rgba(31,42,36,0.03)] ${className}`}
    >
      {children}
    </Tag>
  );
}

const tones = {
  neutral: "bg-sunken text-muted border-line",
  ok: "bg-ok-bg text-ok-fg border-ok-border",
  warn: "bg-warn-bg text-warn-fg border-warn-border",
  danger: "bg-danger-bg text-danger-fg border-danger-line",
  accent: "bg-secondary-container text-primary font-semibold border-transparent",
};

export function Pill({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: keyof typeof tones;
  icon?: IconName;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-muted shadow-xs">
      {children}
    </span>
  );
}

export function StatTile({
  value,
  caption,
  accent,
  className = "",
}: {
  value: React.ReactNode;
  caption: string;
  accent?: boolean;
  className?: string;
}) {
  const str = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const isLong = str.length > 7;
  const isMedium = str.length > 4;
  const sizeClass = isLong
    ? "text-xl sm:text-2xl"
    : isMedium
    ? "text-2xl sm:text-3xl"
    : "text-3xl sm:text-4xl";

  return (
    <div
      className={`rounded-xl border border-line p-3.5 sm:p-4 shadow-[0_1px_2px_rgba(31,42,36,0.04)] flex flex-col justify-between min-w-0 overflow-hidden ${
        accent ? "bg-accent-soft/40 border-accent/20" : "bg-card"
      } ${className}`}
    >
      <p
        className={`serif num font-semibold leading-tight text-fg tracking-tight truncate ${sizeClass}`}
        title={str || undefined}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-muted font-normal truncate" title={caption}>
        {caption}
      </p>
    </div>
  );
}

const paths = {
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 4l9 16H3L12 4zM12 10v4M12 17.5v.01",
  lock: "M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  phone: "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2",
  phone_in_talk: "M19 10v2a7 7 0 0 1-14 0v-2M12 19v4m-4 0h8M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z",
  phone_forwarded: "M17 1l4 4-4 4M21 5H9a4 4 0 0 0-4 4v11",
  support_agent: "M12 2a8 8 0 0 0-8 8v7a3 3 0 0 0 3 3h1v-6H5v-4a7 7 0 1 1 14 0v4h-3v6h1a3 3 0 0 0 3-3v-7a8 8 0 0 0-8-8z",
  clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  inbox: "M3 13l3-8h12l3 8v6H3v-6zM3 13h5l1 2h6l1-2h5",
  speed: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V17a1 1 0 0 1-2 0v-.07A4 4 0 0 1 8 13a4 4 0 0 1 7.9-1l-2.9 2.9z",
  database: "M4 6c0 1.66 3.58 3 8 3s8-1.34 8-3-3.58-3-8-3-8 1.34-8 3zm0 6c0 1.66 3.58 3 8 3s8-1.34 8-3M4 18c0 1.66 3.58 3 8 3s8-1.34 8-3",
  tune: "M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6",
  mic: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4m-4 0h8",
  sync: "M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2",
  timer: "M10 2h4m-2 2v4m0 0a8 8 0 1 0 8 8 8 8 0 0 0-8-8z",
  verified: "M12 2l3 2 3.5-1 1.5 3 3 1.5-1 3.5 2 3-2 3 1 3.5-3 1.5-1.5 3-3.5-1-3 2-3-2-3.5 1-1.5-3-3-1.5 1-3.5-2-3 2-3-1-3.5 3-1.5 1.5-3 3.5 1z",
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const p = paths[name] || paths.shield;
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={p} />
    </svg>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-bg px-3.5 py-2.5 text-sm text-danger-fg shadow-xs"
    >
      <Icon name="alert" size={16} />
      <span>Cannot reach the gateway ({error}). Showing the last data received, retrying.</span>
    </p>
  );
}

export function Empty({
  children,
  icon = "inbox",
}: {
  children: React.ReactNode;
  icon?: IconName;
}) {
  return (
    <p className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-card/60 px-4 py-6 text-sm text-muted">
      <Icon name={icon} size={18} />
      {children}
    </p>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="space-y-2.5 rounded-xl border border-line bg-card p-4"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton h-5"
          style={{ width: `${90 - i * 15}%` }}
        />
      ))}
    </div>
  );
}

export function fmtTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleTimeString();
}

/** Stagger delay for the `.enter` class; capped so long lists stay snappy. */
export function stagger(index: number) {
  return { animationDelay: `${Math.min(index * 35, 350)}ms` };
}
