"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/ui";

const links = [["/", "Home"], ["/ops", "Ops"], ["/metrics", "Metrics"]] as const;

export function TopNav({ status }: { status?: React.ReactNode }) {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 sm:px-6">
        <Link href="/" aria-label="LoanLoop home" className="flex min-h-11 items-center"><Wordmark /></Link>
        <nav aria-label="Main" className="flex flex-1 items-center gap-1">
          {links.map(([href, label]) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors duration-150 ${active ? "bg-sunken font-medium text-fg" : "text-muted hov:text-fg"}`}>
                {label}
              </Link>
            );
          })}
        </nav>
        {status}
      </div>
    </header>
  );
}
