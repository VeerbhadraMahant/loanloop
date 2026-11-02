import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";
import { TopNav } from "@/components/top-nav";

export function Wordmark() {
  return <span className="serif text-[26px] leading-none tracking-tight">LoanLoop</span>;
}

/** Page chrome: top bar + content. */
export function Shell({ title, sub, status, children }: { title: string; sub?: string; status?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <TopNav status={status} />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <div className="mb-8">
          <h1 className="serif text-[40px] leading-tight sm:text-5xl">{title}</h1>
          {sub && <p className="mt-1 max-w-2xl text-muted">{sub}</p>}
        </div>
        {children}
      </main>
    </>
  );
}

type BtnProps = { variant?: "primary" | "secondary"; small?: boolean; className?: string; children: React.ReactNode };
export function Button({ variant = "primary", small, className = "", href, ...rest }:
  BtnProps & { href?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = `btn btn-${variant} ${small ? "btn-sm" : ""} ${className}`;
  if (href) return <Link href={href} className={cls}>{rest.children}</Link>;
  return <button type="button" {...rest} className={cls} />;
}

export function Card({ children, className = "", as: Tag = "section", ...rest }:
  { children: React.ReactNode; className?: string; as?: "section" | "div" | "li" } & React.HTMLAttributes<HTMLElement>) {
  return <Tag {...rest} className={`rounded-lg border border-line bg-card ${className}`}>{children}</Tag>;
}

const tones = {
  neutral: "bg-sunken text-fg border-line",
  ok: "bg-ok-bg text-ok-fg border-transparent",
  warn: "bg-warn-bg text-warn-fg border-transparent",
  danger: "bg-danger-bg text-danger-fg border-transparent",
  accent: "bg-accent-soft text-accent-ink border-transparent",
};
export function Pill({ tone = "neutral", icon, children, className = "" }:
  { tone?: keyof typeof tones; icon?: IconName; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>
      {icon && <Icon name={icon} size={12} />}{children}
    </span>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-muted">{children}</span>;
}

export function StatTile({ value, caption, accent }: { value: React.ReactNode; caption: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border border-line p-5 ${accent ? "bg-accent-soft/40" : "bg-card"}`}>
      <p className="serif num text-5xl leading-none">{value}</p>
      <p className="mt-2 text-sm text-muted">{caption}</p>
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
  clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  inbox: "M3 13l3-8h12l3 8v6H3v-6zM3 13h5l1 2h6l1-2h5",
};
export type IconName = keyof typeof paths;
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={paths[name]} />
    </svg>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger-fg">
      <Icon name="alert" size={16} />
      <span>Cannot reach the gateway ({error}). Showing the last data received, retrying.</span>
    </p>
  );
}

export function Empty({ children, icon = "inbox" }: { children: React.ReactNode; icon?: IconName }) {
  return (
    <p className="flex items-center gap-3 rounded-lg border border-dashed border-line px-4 py-5 text-sm text-muted">
      <Icon name={icon} size={18} />{children}
    </p>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-2 rounded-lg border border-line bg-card p-4">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-5" style={{ width: `${90 - i * 15}%` }} />)}
    </div>
  );
}

export function fmtTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleTimeString();
}

/** Stagger delay for the `.enter` class; capped so long lists stay snappy. */
export const stagger = (i: number) => ({ animationDelay: `${Math.min(i, 6) * 40}ms` });
