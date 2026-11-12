"use client";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
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
const THEME_KEY = "loanloop.theme";
export type ThemeId = "bright" | "classic" | "dark";

export function useThemePreference() {
  const [theme, setTheme] = useState<ThemeId>("bright");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate client theme once on mount
    setMounted(true);
    try {
      const stored = localStorage.getItem(THEME_KEY) as ThemeId | null;
      const next: ThemeId = stored === "classic" || stored === "dark" || stored === "bright" ? stored : "bright";
      setTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    } catch {
      /* ignore */
    }
  }, []);

  const changeTheme = (newTheme: ThemeId) => {
    setTheme(newTheme);
    try {
      localStorage.setItem(THEME_KEY, newTheme);
      document.documentElement.setAttribute("data-theme", newTheme);
    } catch {
      /* ignore */
    }
  };

  return { theme, mounted, changeTheme };
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore persisted pref after mount
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && /^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(target.tagName);
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
  liveBadge?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "Operations",
    items: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/call/priya", label: "Calling Desk", icon: "support_agent", liveBadge: true },
      { href: "/user/home", label: "User Console", icon: "phone" },
      { href: "/bank", label: "Bank app", icon: "landmark" },
      { href: "/collections", label: "Collections", icon: "wallet" },
      { href: "/ops", label: "Ops Console", icon: "activity" },
    ],
  },
  {
    title: "Engineering",
    items: [
      { href: "/dev", label: "Developer Lab", icon: "sliders" },
      { href: "/test-cases", label: "Test Cases", icon: "list_checks" },
      { href: "/metrics", label: "Metrics & SLA", icon: "gauge" },
    ],
  },
];

export function ThemeSelector() {
  const { theme, mounted, changeTheme } = useThemePreference();

  if (!mounted) {
    return <div className="h-7 w-full rounded-md bg-sunken animate-pulse" />;
  }

  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-md border border-line bg-sunken p-0.5 text-[11px] font-medium"
      role="group"
      aria-label="Theme selector"
    >
      <button
        type="button"
        onClick={() => changeTheme("bright")}
        className={`flex items-center justify-center gap-1.5 rounded px-2 py-1 transition-colors cursor-pointer ${
          theme === "bright"
            ? "bg-card text-fg font-semibold border border-line"
            : "text-muted hover:text-fg"
        }`}
        title="Bright daylight slate"
        aria-label="Radiant bright theme"
        aria-pressed={theme === "bright"}
      >
        <span className="h-2 w-2 rounded-full bg-[#1D4ED8] border border-line" />
        <span>Bright</span>
      </button>
      <button
        type="button"
        onClick={() => changeTheme("classic")}
        className={`flex items-center justify-center gap-1.5 rounded px-2 py-1 transition-colors cursor-pointer ${
          theme === "classic"
            ? "bg-card text-fg font-semibold border border-line"
            : "text-muted hover:text-fg"
        }`}
        title="Classic lower-glare stone"
        aria-label="Classic theme"
        aria-pressed={theme === "classic"}
      >
        <span className="h-2 w-2 rounded-full bg-[#64748B] border border-line" />
        <span>Classic</span>
      </button>
      <button
        type="button"
        onClick={() => changeTheme("dark")}
        className={`flex items-center justify-center gap-1.5 rounded px-2 py-1 transition-colors cursor-pointer ${
          theme === "dark"
            ? "bg-card text-fg font-semibold border border-line"
            : "text-muted hover:text-fg"
        }`}
        title="Control room dark"
        aria-label="Dark theme"
        aria-pressed={theme === "dark"}
      >
        <span className="h-2 w-2 rounded-full bg-[#0C1017] border border-outline-variant" />
        <span>Dark</span>
      </button>
    </div>
  );
}

function UserSettingsMenu({ align = "up" }: { align?: "up" | "down" }) {
  const [open, setOpen] = useState(false);
  const { theme } = useThemePreference();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="User and theme settings"
        className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-line hover:bg-sunken cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-fg">
            SFB
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-fg leading-tight">Operator Desk</div>
            <div className="truncate text-[11px] text-muted capitalize">{theme} theme</div>
          </div>
        </div>
        <Icon name="settings" size={14} className="text-muted" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Appearance settings"
          className={`absolute left-0 right-0 z-50 min-w-[220px] rounded-lg border border-line bg-card p-3 shadow-md ${
            align === "up" ? "bottom-full mb-2" : "top-full mt-2 right-0 left-auto"
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Appearance
            </span>
            <span className="font-mono text-[10px] text-muted">Cmd+B nav</span>
          </div>
          <ThemeSelector />
        </div>
      )}
    </div>
  );
}

export function SidebarNav() {
  const path = usePathname();
  const { isOpen, toggle } = useSidebar();

  return (
    <>
      {isOpen && (
        <div
          onClick={toggle}
          className="fixed inset-0 z-40 bg-fg/20 backdrop-blur-[1px] md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Sidebar navigation"
        className={`fixed md:sticky top-0 left-0 z-40 h-screen bg-card border-r border-line flex flex-col transition-all duration-200 ease-out ${
          isOpen
            ? "w-60 translate-x-0"
            : "-translate-x-full md:translate-x-0 md:w-0 md:border-r-0 md:overflow-hidden md:opacity-0"
        }`}
      >
        {/* Brand Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-line shrink-0">
          <Link href="/" className="flex items-baseline gap-2 min-w-0">
            <Wordmark />
            <span className="text-[11px] font-mono text-muted">Sahyadri</span>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-2.5 space-y-4 overflow-y-auto" aria-label="Main menu">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              <div className="px-2.5 pb-1 pt-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  {section.title}
                </span>
              </div>

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    item.href === "/"
                      ? path === "/"
                      : item.href === "/call/priya"
                      ? path.startsWith("/call")
                      : item.href === "/user/priya"
                      ? path.startsWith("/user")
                      : path.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                        active
                          ? "bg-secondary-container text-accent-ink font-semibold"
                          : "text-muted hover:text-fg hover:bg-sunken font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon name={item.icon} size={15} className={active ? "text-primary" : "text-muted"} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.liveBadge && (
                        <span className="inline-flex items-center gap-1 rounded border border-ok-border bg-ok-bg px-1.5 py-0.5 font-mono text-[10px] font-medium text-ok-fg">
                          <span className="h-1.5 w-1.5 rounded-full bg-ok-fg pulse" />
                          Live
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Single Persistent Demo Notice + User/Theme Settings Menu */}
        <div className="border-t border-line p-2.5 space-y-2 shrink-0 bg-card">
          <UserSettingsMenu align="up" />
          <div className="px-2 text-[11px] font-mono text-muted">
            Demo · synthetic data
          </div>
        </div>
      </aside>
    </>
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
    <header className="sticky top-0 z-30 h-12 bg-card/95 backdrop-blur-sm border-b border-line px-4 sm:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={toggle}
          className="h-8 w-8 rounded-md border border-line bg-card hover:bg-sunken text-muted hover:text-fg transition-colors flex items-center justify-center cursor-pointer"
          title={isOpen ? "Hide navigation (Cmd+B)" : "Show navigation (Cmd+B)"}
          aria-label={isOpen ? "Hide navigation" : "Show navigation"}
          aria-expanded={isOpen}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
            {isOpen ? <path d="m15 15-3-3 3-3" /> : <path d="m13 9 3 3-3 3" />}
          </svg>
        </button>

        {title && (
          <div className="flex items-baseline gap-2 truncate">
            <span className="text-sm font-semibold text-fg truncate">{title}</span>
            {sub && <span className="hidden lg:inline text-xs text-muted truncate">· {sub}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {status}
        {!isOpen && (
          <div className="hidden md:block">
            <UserSettingsMenu align="down" />
          </div>
        )}
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
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader title={title} sub={sub} status={status} />
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}
