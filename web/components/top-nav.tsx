"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/ui";

const links = [
  ["/", "Home"],
  ["/test-cases", "Test Cases"],
  ["/call/priya", "Live Desk"],
  ["/ops", "Ops"],
  ["/collections", "Collections"],
  ["/metrics", "Metrics"],
  ["/dev", "Developer console"],
];

export function TopNav({ status }: { status?: React.ReactNode }) {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-card/90 backdrop-blur-md shadow-[0_1px_4px_rgba(31,42,36,0.03)]">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand & Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/" aria-label="LoanLoop home" className="flex items-baseline gap-2">
            <Wordmark />
            <span className="hidden xl:inline-block rounded bg-surface-container px-2 py-0.5 text-xs text-muted font-normal">
              Voice Agent Studio · Sahyadri Bank
            </span>
          </Link>
        </div>

        {/* Primary Navigation Pills */}
        <nav aria-label="Main" className="hidden md:flex items-center gap-1 shrink-0">
          {links.map(([href, label]) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-secondary-container text-on-secondary-fixed shadow-xs"
                    : "text-muted hover:text-fg hover:bg-surface-container-high"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right Status Actions & Sandbox Badge */}
        <div className="flex items-center gap-3 shrink-0">
          {status ? (
            status
          ) : (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-ok-bg text-ok-fg text-xs font-medium border border-ok-border">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok-fg opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-ok-fg"></span>
              </span>
              <span className="num">Live stream: connected</span>
            </div>
          )}
          <div className="hidden lg:flex items-center px-2.5 py-1 rounded-md bg-sunken text-muted text-xs font-mono">
            Bank Sandbox v2.4
          </div>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-fg text-xs font-bold shadow-xs">
            SFB
          </div>
        </div>
      </div>
    </header>
  );
}
