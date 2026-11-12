import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ui";

export const metadata: Metadata = { title: "LoanLoop" };

const ROLES = [
  ["Bank manager", "bank, ops, collections"],
  ["Engineer / developer", "dev lab, metrics, test cases"],
  ["Admin", "everything"],
];

// Whole card is the hit area (stretched link), so it is one tab stop; press/hover use transform+colour only, off under reduced motion.
const card = "relative flex flex-col rounded-2xl border border-line bg-card p-6 shadow-sm transition-[transform,border-color] duration-150 ease-out hover:border-primary active:scale-[0.98] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary motion-reduce:transition-none motion-reduce:active:scale-100";
const cta = "mt-auto inline-flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-fg outline-none focus-visible:ring-2 focus-visible:ring-primary after:absolute after:inset-0 after:rounded-2xl";

// Public page: static text and plain links only. proxy.ts redirects visitors who already have a session.
export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sunken p-4">
      <div className="w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <Wordmark />
          <h1 className="serif text-2xl font-semibold text-fg">Voice service desk for loan borrowers</h1>
          <p className="text-base text-muted">Speaks 11 Indian languages, powered by Gnani speech.</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <section className={card}>
            <h2 className="text-lg font-semibold text-fg">Customer</h2>
            <p className="mb-4 mt-1 text-sm text-muted">See the official bank SMS sent to you and call the voice desk.</p>
            <Link href="/login" className={cta}>Customer sign in</Link>
          </section>
          <section className={card}>
            <h2 className="text-lg font-semibold text-fg">Bank staff</h2>
            <ul className="mb-4 mt-1 space-y-1 text-sm text-muted">
              {ROLES.map(([r, d]) => (
                <li key={r}><span className="font-medium text-fg">{r}</span>: {d}</li>
              ))}
            </ul>
            <Link href="/staff/login" className={cta}>Staff sign in</Link>
          </section>
        </div>
      </div>
    </main>
  );
}
