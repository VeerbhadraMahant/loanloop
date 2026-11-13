import Link from "next/link";
import type { ReactNode } from "react";
import s from "./landing.module.css";

export const NAV = [
  ["#how", "How it works"],
  ["#security", "Security"],
  ["#languages", "Languages"],
  ["#results", "Results"],
  ["#about", "About"],
] as const;

const focus = "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
const btn = `${s.btn} inline-flex h-11 items-center justify-center rounded-xl px-5 text-base font-semibold ${focus}`;
export const primaryBtn = `${btn} bg-primary text-primary-fg`;
export const secondaryBtn = `${btn} border border-line bg-card text-fg`;
export const navLink = `${s.btn} inline-flex h-11 items-center rounded-lg px-2 text-base text-muted hover:text-fg ${focus}`;

export function Section({ id, alt, title, lead, aside, children }: { id: string; alt?: boolean; title: string; lead?: string; aside?: ReactNode; children?: ReactNode }) {
  const head = (
    <div>
      <h2 className="serif max-w-3xl text-4xl text-fg lg:text-5xl">{title}</h2>
      {lead && <p className="mt-5 max-w-[65ch] text-lg text-muted">{lead}</p>}
      {children}
    </div>
  );
  return (
    <section id={id} className={`scroll-mt-16 ${alt ? "border-y border-line bg-card" : "bg-sunken"}`}>
      <div className="mx-auto flex max-w-6xl flex-col justify-center px-5 py-16 sm:px-8 lg:min-h-[min(900px,100dvh)]">
        {aside ? <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">{head}{aside}</div> : head}
      </div>
    </section>
  );
}

export function SignInLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Link href="/staff/login" className={`${navLink} hidden whitespace-nowrap sm:inline-flex`}>Staff sign in</Link>
      <Link href="/login" className={`${primaryBtn} whitespace-nowrap px-3 text-sm sm:px-4 sm:text-base`}>Customer sign in</Link>
    </div>
  );
}
