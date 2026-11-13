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

export function Section({ id, alt, title, children }: { id: string; alt?: boolean; title: string; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-16 ${alt ? "border-y border-line bg-card" : "bg-sunken"}`}>
      <div className="mx-auto flex min-h-[min(900px,100dvh)] max-w-6xl flex-col justify-center px-5 py-20 sm:px-8">
        <h2 className="serif max-w-3xl text-3xl text-fg lg:text-4xl">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function SignInLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Link href="/staff/login" className={navLink}>Staff sign in</Link>
      <Link href="/login" className={`${primaryBtn} px-4`}>Customer sign in</Link>
    </div>
  );
}
