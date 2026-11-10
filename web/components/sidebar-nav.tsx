"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark, Icon, type IconName } from "@/components/ui";

type SidebarContextType = {
  isOpen: boolean;
  toggle: () => void;
  setIsOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarContextType>({
  isOpen: true,
  toggle: () => {},
  setIsOpen: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

const STORAGE_KEY = "loanloop.nav.open";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);

  // Restore user's preference from localStorage after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setIsOpen(stored === "true");
      } else if (window.innerWidth < 1024) {
        setIsOpen(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Keyboard shortcut: Cmd+B or Ctrl+B or '[' to toggle navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (isInput) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      } else if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, setIsOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
  badgeTone?: "default" | "dev" | "ok" | "primary";
  isDev?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "Banking Operations",
    items: [
      { href: "/", label: "Home", icon: "shield" },
      { href: "/call/priya", label: "Calling Desk", icon: "phone_in_talk", badge: "Live", badgeTone: "ok" },
      { href: "/collections", label: "Collections", icon: "database" },
      { href: "/ops", label: "Ops Console", icon: "speed" },
    ],
  },
  {
    title: "Developer & Testing",
    items: [
      {
        href: "/dev",
        label: "Developer Lab",
        icon: "tune",
        badge: "DEV LAB",
        badgeTone: "dev",
        isDev: true,
      },
      {
        href: "/test-cases",
        label: "Test Cases",
        icon: "verified",
        badge: "5 Presets",
        badgeTone: "primary",
        isDev: true,
      },
      {
        href: "/metrics",
        label: "Metrics & SLA",
        icon: "speed",
        badge: "p95 Proof",
        isDev: true,
      },
    ],
  },
];

export function SidebarNav() {
  const path = usePathname();
  const { isOpen, toggle } = useSidebar();

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={toggle}
          className="fixed inset-0 z-40 bg-fg/20 backdrop-blur-xs md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Vertical Sidebar */}
      <aside
        aria-label="Sidebar navigation"
        className={`fixed md:sticky top-0 left-0 z-40 h-screen bg-card border-r border-line flex flex-col transition-all duration-300 ease-in-out shadow-xs ${
          isOpen
            ? "w-64 translate-x-0"
            : "-translate-x-full md:translate-x-0 md:w-0 md:border-r-0 md:overflow-hidden md:opacity-0"
        }`}
      >
        {/* Brand & Wordmark Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-line shrink-0 bg-card">
          <Link href="/" className="flex items-baseline gap-2">
            <Wordmark />
            <span className="text-[10px] font-mono uppercase tracking-widest text-primary font-semibold px-1.5 py-0.5 rounded bg-secondary-container">
              Desk
            </span>
          </Link>

          {/* Toggle button inside sidebar header to collapse it */}
          <button
            type="button"
            onClick={toggle}
            className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-sunken transition-colors cursor-pointer"
            title="Hide navigation (Cmd+B or [)"
            aria-label="Hide navigation"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
              <path d="m16 15-3-3 3-3" />
            </svg>
          </button>
        </div>

        {/* Bank Context Strip */}
        <div className="px-4 py-2.5 bg-surface-container-low border-b border-line flex items-center justify-between text-xs text-muted shrink-0">
          <span className="font-mono text-[11px] font-medium text-fg">Sahyadri Bank</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-sunken border border-line">
            Sandbox v2.4
          </span>
        </div>

        {/* Vertical Navigation Items grouped by section */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto" aria-label="Main menu">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <div className="px-3 pt-1 pb-1 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted font-bold">
                  {section.title}
                </span>
                {section.title.includes("Developer") && (
                  <span className="inline-flex items-center gap-1 font-mono text-[9px] text-warn-fg font-bold bg-warn-bg px-1.5 py-0.5 rounded border border-warn-border">
                    SANDBOX
                  </span>
                )}
              </div>

              <div className="space-y-1">
                {section.items.map((item) => {
                  const active =
                    item.href === "/"
                      ? path === "/"
                      : item.href === "/call/priya"
                      ? path.startsWith("/call")
                      : path.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        active
                          ? item.isDev
                            ? "bg-warn-bg text-warn-fg font-semibold shadow-xs border-l-4 border-warn-fg"
                            : "bg-secondary-container text-primary font-semibold shadow-xs border-l-4 border-primary"
                          : item.isDev
                          ? "text-fg/80 hover:text-fg hover:bg-warn-bg/25 font-medium"
                          : "text-muted hover:text-fg hover:bg-sunken"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon name={item.icon} size={15} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            item.badgeTone === "dev"
                              ? active
                                ? "bg-warn-fg text-card font-bold"
                                : "bg-warn-bg text-warn-fg border border-warn-border"
                              : item.badgeTone === "ok"
                              ? active
                                ? "bg-ok-fg text-card"
                                : "bg-ok-bg text-ok-fg border border-ok-border"
                              : active
                              ? "bg-primary text-primary-fg"
                              : "bg-sunken text-muted border border-line"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Theme Selector Strip */}
        <div className="px-3 py-2 border-t border-line shrink-0 bg-surface-bright/30 flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted uppercase font-semibold">Theme</span>
          <ThemeSelector />
        </div>

        {/* Live SSE Stream Telemetry */}
        <div className="p-3 border-t border-line shrink-0 bg-surface-bright/50">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-ok-bg text-ok-fg text-xs font-mono border border-ok-border">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok-fg opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-ok-fg"></span>
            </span>
            <span className="truncate">SSE Stream: Connected</span>
          </div>
        </div>

        {/* User / Operator Footer */}
        <div className="p-3 border-t border-line flex items-center justify-between shrink-0 bg-card">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-fg flex items-center justify-center font-bold text-xs shadow-xs">
              SFB
            </div>
            <div>
              <div className="text-xs font-semibold text-fg leading-tight">SFB Voice Desk</div>
              <div className="text-[10px] font-mono text-muted">Mumbai Ingress Node</div>
            </div>
          </div>
          <span className="text-[10px] font-mono text-muted uppercase">PCI-DSS</span>
        </div>
      </aside>
    </>
  );
}

export function ThemeSelector() {
  const [theme, setTheme] = useState<"bright" | "classic" | "dark">("bright");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem("loanloop.theme") as "bright" | "classic" | "dark" | null;
      if (stored) {
        setTheme(stored);
        document.documentElement.setAttribute("data-theme", stored);
      } else {
        setTheme("bright");
        document.documentElement.setAttribute("data-theme", "bright");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const changeTheme = (newTheme: "bright" | "classic" | "dark") => {
    setTheme(newTheme);
    try {
      localStorage.setItem("loanloop.theme", newTheme);
      document.documentElement.setAttribute("data-theme", newTheme);
    } catch {
      /* ignore */
    }
  };

  if (!mounted) {
    return <div className="h-7 w-20 rounded-md bg-sunken animate-pulse" />;
  }

  return (
    <div
      className="inline-flex items-center p-0.5 rounded-lg bg-sunken border border-line text-[11px] font-mono shadow-xs"
      role="group"
      aria-label="Theme selector"
    >
      <button
        type="button"
        onClick={() => changeTheme("bright")}
        className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
          theme === "bright"
            ? "bg-card text-primary font-bold shadow-xs border border-line"
            : "text-muted hover:text-fg"
        }`}
        title="Radiant Warm Ledger: Brighter, crisp porcelain & vivid emerald"
        aria-label="Radiant bright theme"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        <span>Bright</span>
      </button>
      <button
        type="button"
        onClick={() => changeTheme("classic")}
        className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
          theme === "classic"
            ? "bg-card text-fg font-bold shadow-xs border border-line"
            : "text-muted hover:text-fg"
        }`}
        title="Classic Warm Paper: Subdued original (§2.1)"
        aria-label="Classic theme"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#8A5A00]"></span>
        <span className="hidden sm:inline">Classic</span>
      </button>
      <button
        type="button"
        onClick={() => changeTheme("dark")}
        className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
          theme === "dark"
            ? "bg-card text-primary font-bold shadow-xs border border-line"
            : "text-muted hover:text-fg"
        }`}
        title="Control Room Dark: (§2.4)"
        aria-label="Dark theme"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#3FB98A]"></span>
        <span className="hidden sm:inline">Dark</span>
      </button>
    </div>
  );
}

export function AppHeader({
  title,
  sub,
  status,
}: {
  title?: string;
  sub?: string;
  status?: React.ReactNode;
}) {
  const { isOpen, toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-30 h-14 bg-card/90 backdrop-blur-md border-b border-line px-4 sm:px-6 flex items-center justify-between gap-4 shadow-[0_1px_3px_rgba(31,42,36,0.03)]">
      <div className="flex items-center gap-3 min-w-0">
        {/* Toggle button to show or hide the vertical navbar */}
        <button
          type="button"
          onClick={toggle}
          className="p-2 rounded-lg border border-line bg-sunken hover:bg-card text-fg transition-colors flex items-center gap-1.5 text-xs font-medium shadow-xs cursor-pointer"
          title={isOpen ? "Hide navigation (Cmd+B)" : "Show navigation (Cmd+B)"}
          aria-label={isOpen ? "Hide navigation" : "Show navigation"}
        >
          <svg
            className="w-4 h-4 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
            {isOpen ? <path d="m16 15-3-3 3-3" /> : <path d="m14 9 3 3-3 3" />}
          </svg>
          <span className="hidden sm:inline font-mono text-[11px]">
            {isOpen ? "Hide Nav" : "Show Nav"}
          </span>
        </button>

        {title && (
          <div className="flex items-baseline gap-2 truncate">
            <span className="serif text-lg font-semibold text-fg truncate">{title}</span>
            {sub && <span className="hidden xl:inline text-xs text-muted truncate">· {sub}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {status}
        <ThemeSelector />
        <div className="hidden lg:flex items-center px-2.5 py-1 rounded-md bg-sunken text-muted text-xs font-mono border border-line">
          Bank Sandbox v2.4
        </div>
      </div>
    </header>
  );
}

export function SidebarLayout({
  title,
  sub,
  status,
  children,
}: {
  title?: string;
  sub?: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex bg-bg">
        <SidebarNav />
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <AppHeader title={title} sub={sub} status={status} />
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}
