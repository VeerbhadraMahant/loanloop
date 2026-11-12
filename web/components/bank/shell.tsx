"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEvents } from "@/lib/api";
import { SignOut } from "@/components/auth";

const NAV = [
  { href: "/bank", label: "Today", d: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/bank/conversations", label: "Conversations", d: "M4 5h16v11H9l-5 4z" },
  { href: "/bank/handovers", label: "Handovers", d: "M7 7h10M7 7l3-3M7 7l3 3M17 17H7m10 0l-3-3m3 3l-3 3" },
  { href: "/bank/collections", label: "Collections", d: "M4 19V9m6 10V5m6 14v-7m4 7H2" },
  { href: "/bank/requests", label: "Service requests", d: "M8 4h8l3 3v13H5V4zM9 12h6M9 16h6" },
  { href: "/bank/security", label: "Security", d: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
];

const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const noop = () => {};
const THEME_KEY = "loanloop.theme";
const DENSITY_KEY = "loanloop.bank.density";
const THEMES = ["bright", "classic", "dark"] as const;
type Theme = (typeof THEMES)[number];

export function BankShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const live = useEvents(noop);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<Theme>("bright");
  const [compact, setCompact] = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect -- restore persisted prefs after mount */
  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme") as Theme | null;
    if (cur === "bright" || cur === "classic" || cur === "dark") setTheme(cur);
    try {
      const d = localStorage.getItem(DENSITY_KEY);
      if (d === "comfortable") setCompact(false);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { setMenu(false); }, [path]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [menu]);

  const cycleTheme = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  };
  const toggleDensity = () => {
    setCompact(!compact);
    try { localStorage.setItem(DENSITY_KEY, !compact ? "compact" : "comfortable"); } catch { /* ignore */ }
  };

  const ctl = "b-pressable inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-bank-line-strong px-2.5 text-xs text-bank-fg hover:bg-bank-sunken";
  const active = (h: string) => (h === "/bank" ? path === "/bank" : path.startsWith(h));

  return (
    <div className="bank min-h-dvh" data-density={compact ? "compact" : "comfortable"}>
      <a href="#bank-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-bank-accent focus:px-3 focus:py-2 focus:text-bank-accent-fg">Skip to content</a>

      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-bank-line bg-bank-surface px-4 py-2 lg:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu} className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-md text-bank-fg hover:bg-bank-sunken">
            <Icon d="M4 7h16M4 12h16M4 17h16" />
          </button>
          <span className="b-title text-base truncate">Sahyadri Finance Bank</span>
        </div>
        <Link
          href="/"
          className="b-pressable inline-flex shrink-0 items-center gap-1 rounded-md bg-bank-accent px-2.5 py-1.5 text-xs font-semibold text-bank-accent-fg hover:opacity-90"
        >
          <Icon d="M15 18l-6-6 6-6" />
          <span>LoanLoop Desk</span>
        </Link>
      </div>
      {menu && <div className="b-scrim fixed inset-0 z-40 bg-[var(--b-scrim)] lg:hidden" onClick={() => setMenu(false)} aria-hidden />}

      <div className="lg:grid lg:grid-cols-[240px_1fr]">
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-bank-line bg-bank-surface transition-[transform,visibility] duration-200 ease-out lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 lg:visible ${menu ? "" : "max-lg:invisible max-lg:-translate-x-full"}`}
        >
          <div className="border-b border-bank-line px-4 py-3.5">
            <p className="b-title text-base leading-5">Sahyadri Finance Bank</p>
          </div>
          <nav aria-label="Bank sections" className="flex-1 space-y-0.5 p-2.5">
            {NAV.map((n) => (
              <Link
                key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
                className={`flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150 ${active(n.href) ? "bg-bank-accent-soft text-bank-accent-ink font-semibold" : "text-bank-fg hover:bg-bank-sunken"}`}
              >
                <Icon d={n.d} />{n.label}
              </Link>
            ))}
          </nav>
          <div className="space-y-2 border-t border-bank-line p-3">
            <div role="status" className="flex items-center gap-2 px-1 text-xs text-bank-muted">
              <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "pulse bg-bank-ok-fg" : "bg-bank-danger-fg"}`} />
              {live ? "Live: receiving updates" : "Offline: reconnecting"}
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={cycleTheme} className={`${ctl} flex-1 justify-center capitalize`}>Theme: {theme}</button>
              <button type="button" onClick={toggleDensity} aria-pressed={compact} className={`${ctl} flex-1 justify-center`}>{compact ? "Compact" : "Comfy"}</button>
            </div>
            <SignOut door="staff" className={`${ctl} w-full justify-center`} />
            <div className="px-1 font-mono text-[11px] text-bank-muted">Demo · synthetic data</div>
          </div>
        </aside>

        <div className="min-w-0 flex flex-col">
          <main id="bank-main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1280px] px-4 py-4 outline-none sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
