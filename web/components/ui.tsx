import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

export function Wordmark() {
  return (
    <span className="text-[17px] font-semibold tracking-tight text-fg">
      LoanLoop
    </span>
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
  const cls =
    variant === "ghost"
      ? `btn bg-transparent text-muted hover:text-fg hover:bg-sunken ${small ? "btn-sm" : ""} ${className}`
      : `btn btn-${variant} ${small ? "btn-sm" : ""} ${className}`;
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
      className={`rounded-lg border border-line bg-card ${className}`}
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
  accent: "bg-secondary-container text-accent-ink font-semibold border-primary/25",
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
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 ${tones[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-muted">
      {children}
    </span>
  );
}

const tileEdge: Record<"neutral" | "accent" | "ok" | "warn" | "danger", string> = {
  neutral: "border-l-outline-variant",
  accent: "border-l-primary",
  ok: "border-l-ok-fg",
  warn: "border-l-warn-fg",
  danger: "border-l-danger-fg",
};

export function StatTile({
  value,
  caption,
  accent,
  tone,
  className = "",
}: {
  value: React.ReactNode;
  caption: string;
  accent?: boolean;
  tone?: "neutral" | "accent" | "ok" | "warn" | "danger";
  className?: string;
}) {
  const str = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const isCurrency = str.startsWith("₹") || str.startsWith("$");
  const isLong = str.length > 10;
  const isMedium = str.length > 5 || isCurrency;

  const sizeClass = isLong
    ? "text-base sm:text-lg"
    : isMedium
    ? "text-lg sm:text-xl"
    : "text-xl sm:text-2xl";

  const edgeKey = tone ?? (accent ? "accent" : "neutral");

  return (
    <div
      className={`flex min-w-0 flex-col justify-between overflow-hidden rounded-lg border border-l-[3px] border-line bg-card px-3.5 py-2.5 ${tileEdge[edgeKey]} ${className}`}
    >
      <p
        className="truncate text-[11px] font-medium uppercase tracking-wider text-muted"
        title={caption}
      >
        {caption}
      </p>
      <p
        className={`num mt-1 truncate font-semibold leading-tight tracking-tight text-fg ${sizeClass}`}
        title={str || undefined}
      >
        {value}
      </p>
    </div>
  );
}

const paths = {
  home: "M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5.5v-6h-5v6H4a1 1 0 01-1-1v-9.5z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 4l9 16H3L12 4zM12 10v4M12 17.5v.01",
  lock: "M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  phone: "M7 3h10a1 1 0 011 1v16a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM10.5 18h3",
  phone_in_talk: "M19 10v2a7 7 0 01-14 0v-2M12 19v4m-4 0h8M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z",
  phone_forwarded: "M17 2l4 4-4 4M21 6H10a4 4 0 00-4 4v10",
  support_agent: "M12 3a8 8 0 00-8 8v6a3 3 0 003 3h1v-6H5v-3a7 7 0 1114 0v3h-3v6h1a3 3 0 003-3v-6a8 8 0 00-8-8z",
  clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  inbox: "M3 13l3-8h12l3 8v6H3v-6zM3 13h5l1 2h6l1-2h5",
  speed: "M12 3a9 9 0 109 9 9 9 0 00-9-9zm0 9l4-3M12 15v2",
  database: "M4 6c0 1.66 3.58 3 8 3s8-1.34 8-3-3.58-3-8-3-8 1.34-8 3zm0 6c0 1.66 3.58 3 8 3s8-1.34 8-3M4 18c0 1.66 3.58 3 8 3s8-1.34 8-3",
  tune: "M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6",
  mic: "M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v3m-4 0h8",
  sync: "M21 3v5h-5M3 21v-5h5M3 11a9 9 0 0116-5l2 2M21 13a9 9 0 01-16 5l-2-2",
  timer: "M10 2h4m-2 2v4m0 0a8 8 0 108 8 8 8 0 00-8-8z",
  verified: "M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
  landmark: "M3 10h18M5 10v8M10 10v8M14 10v8M19 10v8M2 20h20M12 3l9 5H3l9-5z",
  wallet: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm13 5h5m-3 0a1 1 0 100 .01",
  activity: "M3 12h4l3-7 4 14 3-7h4",
  sliders: "M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M10 16v4",
  list_checks: "M4 7l1.5 1.5L8.5 5.5M4 13l1.5 1.5 3-3M4 19l1.5 1.5 3-3M11 7h9M11 13h9M11 19h9",
  gauge: "M12 4a9 9 0 00-9 9h2a7 7 0 0114 0h2a9 9 0 00-9-9zm0 9l4-4M9 17h6",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-2.5a7.5 7.5 0 00-.1-1l2-1.5-2-3.5-2.3.9a7.5 7.5 0 00-1.7-1L15 4h-4l-.3 2.4a7.5 7.5 0 00-1.7 1L6.7 6.5l-2 3.5 2 1.5a7.5 7.5 0 000 2l-2 1.5 2 3.5 2.3-.9a7.5 7.5 0 001.7 1L11 20h4l.3-2.4a7.5 7.5 0 001.7-1l2.3.9 2-3.5-2-1.5z",
  chevron_down: "M6 9l6 6 6-6",
  chevron_right: "M9 6l6 6-6 6",
  arrow_up_down: "M8 7l4-4 4 4M8 17l4 4 4-4",
  copy: "M8 8h11v11H8zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1",
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 15, className = "" }: { name: IconName; size?: number; className?: string }) {
  const p = paths[name] || paths.shield;
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
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
      className="mb-3 flex items-start gap-2 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs text-danger-fg"
    >
      <Icon name="alert" size={15} className="mt-0.5" />
      <span>{error}</span>
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
    <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-line bg-card px-4 py-4 text-xs text-muted">
      <Icon name={icon} size={15} />
      <span>{children}</span>
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="space-y-2 rounded-lg border border-line bg-card p-3.5"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton h-4"
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

/** Stagger delay for `.enter`; capped so long lists stay snappy. */
export function stagger(index: number) {
  return { animationDelay: `${Math.min(index * 25, 250)}ms` };
}
