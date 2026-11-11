"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEvents } from "@/lib/api";

const NAV = [
  { href: "/bank", label: "Today", d: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/bank/conversations", label: "Conversations", d: "M4 5h16v11H9l-5 4z" },
  { href: "/bank/handovers", label: "Handovers", d: "M7 7h10M7 7l3-3M7 7l3 3M17 17H7m10 0l-3-3m3 3l-3 3" },
  { href: "/bank/collections", label: "Collections", d: "M4 19V9m6 10V5m6 14v-7m4 7H2" },
  { href: "/bank/requests", label: "Service requests", d: "M8 4h8l3 3v13H5V4zM9 12h6M9 16h6" },
  { href: "/bank/security", label: "Security", d: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
];

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const noop = () => {};
const THEME_KEY = "loanloop.theme";
const DENSITY_KEY = "loanloop.bank.density";

export function BankShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const live = useEvents(noop);
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- restore persisted prefs after mount */
  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
    try { setCompact(localStorage.getItem(DENSITY_KEY) === "compact"); } catch { /* ignore */ }
  }, []);
  useEffect(() => { setMenu(false); }, [path]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [menu]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "bright");
    try { localStorage.setItem(THEME_KEY, next ? "dark" : "bright"); } catch { /* ignore */ }
  };
  const toggleDensity = () => {
    setCompact(!compact);
    try { localStorage.setItem(DENSITY_KEY, !compact ? "compact" : "comfortable"); } catch { /* ignore */ }
  };

  const ctl = "b-pressable inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-bank-line-strong px-3 text-sm text-bank-fg hover:bg-bank-sunken";
  const active = (h: string) => (h === "/bank" ? path === "/bank" : path.startsWith(h));

  return (
    <div className="bank min-h-dvh" data-density={compact ? "compact" : "comfortable"}>
      <a href="#bank-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-bank-accent focus:px-3 focus:py-2 focus:text-bank-accent-fg">Skip to content</a>

      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-bank-line bg-bank-surface px-4 py-2 lg:hidden">
        <button type="button" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu} className="grid h-10 w-10 cursor-pointer place-items-center rounded-md text-bank-fg hover:bg-bank-sunken">
          <Icon d="M4 7h16M4 12h16M4 17h16" />
        </button>
        <span className="b-title text-lg">Sahyadri Finance Bank</span>
      </div>
      {menu && <div className="b-scrim fixed inset-0 z-40 bg-[var(--b-scrim)] lg:hidden" onClick={() => setMenu(false)} aria-hidden />}

      <div className="lg:grid lg:grid-cols-[240px_1fr]">
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-bank-line bg-bank-surface transition-[transform,visibility] duration-200 ease-out lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 lg:visible ${menu ? "" : "max-lg:invisible max-lg:-translate-x-full"}`}
        >
          <div className="px-5 pb-4 pt-5">
            <p className="b-title text-xl leading-6">Sahyadri Finance Bank</p>
            <p className="mt-1 text-xs text-bank-muted">Demo · synthetic data</p>
          </div>
          <nav aria-label="Bank sections" className="flex-1 space-y-0.5 px-3">
            {NAV.map((n) => (
              <Link
                key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-md px-3 font-medium transition-colors duration-150 ${active(n.href) ? "bg-bank-accent-soft text-bank-accent-ink" : "text-bank-fg hover:bg-bank-sunken"}`}
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
            <div className="flex gap-2">
              <button type="button" onClick={toggleTheme} aria-pressed={dark} className={`${ctl} flex-1 justify-center`}>{dark ? "Dark" : "Light"}</button>
              <button type="button" onClick={toggleDensity} aria-pressed={compact} className={`${ctl} flex-1 justify-center`}>{compact ? "Compact" : "Comfortable"}</button>
            </div>
          </div>
        </aside>

        <main id="bank-main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1280px] px-4 py-6 outline-none sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
