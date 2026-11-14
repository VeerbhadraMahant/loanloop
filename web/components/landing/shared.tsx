import type { CSSProperties, ReactNode } from "react";

export const NAV = [
  ["#features", "Features"],
  ["#how", "How it works"],
  ["#security", "Security"],
  ["#languages", "Languages"],
  ["#results", "Results"],
  ["#about", "About"],
] as const;

export const wrap = "ll-wrap";
export const btnPrimary = "ll-btn ll-primary";
export const btnOnDark = "ll-btn ll-onDarkFill";
export const btnOutline = "ll-btn ll-outline";
export const btnOutlineDark = "ll-btn ll-outlineDark";
export const link = "ll-link";
export const linkDark = "ll-link ll-linkDark";

export type Fill = "teal" | "wine" | "aubergine" | "violet" | "stone" | "lavender" | "surface";

/** A page section. kind "light" = canvas, "band" = lavender, "window" = transparent over the animated background (white text). */
export function Section({ id, kind = "light", as: Tag = "section", className = "", children }: { id?: string; kind?: "light" | "band" | "window"; as?: "section" | "footer" | "div"; className?: string; children: ReactNode }) {
  const base = kind === "window" ? "ll-window ll-onDark" : kind === "band" ? "ll-section ll-band" : "ll-section";
  return (
    <Tag id={id} className={`${base} scroll-mt-20 ${className}`}>
      <div className={wrap}>{children}</div>
    </Tag>
  );
}

/** Two-tone headline text: the second half is the same size and weight at 65% opacity. */
export function TwoTone({ lead, soft }: { lead: string; soft?: string }) {
  return <>{lead}{soft && <> <span className="ll-soft">{soft}</span></>}</>;
}

/** Chapter intro: eyebrow, two-tone H2, lead, then actions (a filled button followed by a chevron link). */
export function Chapter({ eyebrow, title, soft, lead, actions, center = true, dark = false }: { eyebrow?: ReactNode; title: string; soft?: string; lead?: ReactNode; actions?: ReactNode; center?: boolean; dark?: boolean }) {
  return (
    <div className={`ll-chapter ${center ? "ll-chapterCenter" : ""}`}>
      {eyebrow && <p className={`ll-eyebrow ${dark ? "ll-white80" : "ll-muted"}`}>{eyebrow}</p>}
      <h2 className="ll-h2"><TwoTone lead={title} soft={soft} /></h2>
      {lead && <p className={`ll-lead max-w-[60ch] ${dark ? "ll-white80" : "ll-muted"}`}>{lead}</p>}
      {actions && <div className="ll-actions">{actions}</div>}
    </div>
  );
}

/** Bento grid (12 columns from 800px, stacked below). Put <Cell> children inside. */
export function Bento({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`ll-bento ${className}`}>{children}</div>;
}

/** One colour-blocked bento card. Text sits bottom-left; pass media (a cropped UI moment) as children. */
export function Cell({ fill, span = 6, tall = false, eyebrow, title, className = "", style, children }: { fill: Fill; span?: 3 | 4 | 5 | 6 | 7 | 12; tall?: boolean; eyebrow?: string; title?: ReactNode; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className={`ll-cell ll-fill-${fill} ll-span${span} ${tall ? "ll-row2" : ""} ${className}`} style={style}>
      {children}
      {(eyebrow || title) && (
        <div className="ll-cellText">
          {eyebrow && <p className="ll-eyebrow">{eyebrow}</p>}
          {title && <h3 className="ll-title">{title}</h3>}
        </div>
      )}
    </div>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`text-[19px] font-semibold tracking-tight ${className}`}>LoanLoop</span>;
}
