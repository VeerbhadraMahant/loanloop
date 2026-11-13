import s from "./landing.module.css";

export const NAV = [
  ["#how", "How it works"],
  ["#security", "Security"],
  ["#languages", "Languages"],
  ["#results", "Results"],
  ["#about", "About"],
] as const;

export const wrap = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";
export const btnPrimary = `${s.btn} ${s.primary}`;
export const btnSecondary = `${s.btn} ${s.secondary}`;
export const btnGhostDark = `${s.btn} ${s.ghostDark}`;
export const link = `${s.link} inline-flex min-h-11 items-center gap-1 font-medium`;

export function Arrow({ className = "", down = false }: { className?: string; down?: boolean }) {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${down ? "rotate-90" : ""} ${className}`}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`text-[19px] font-semibold tracking-tight ${className}`}>LoanLoop</span>;
}
