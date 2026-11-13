"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, Wordmark, type IconName } from "@/components/ui";

const DOORS = {
  staff: {
    title: "Staff sign in",
    help: "Use your staff email.",
    heading: "Sahyadri Finance Bank staff console.",
    points: [
      ["landmark", "Bank managers: bank, ops and collections."],
      ["settings", "Engineers: dev lab, metrics and test cases."],
      ["shield", "Every page checks your role on each request."],
    ] as [IconName, string][],
    a: { name: "email", label: "Email", type: "email", autoComplete: "username" },
    b: { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
  },
  customer: {
    title: "Sign in",
    help: "Use the mobile number registered with your loan.",
    heading: "Your loan desk, in your language.",
    points: [
      ["lock", "The desk never asks for your password, PIN or OTP on a call."],
      ["phone", "Full account details go only by SMS to your registered mobile."],
      ["mic", "Speak in any of 11 Indian languages."],
    ] as [IconName, string][],
    a: { name: "mobile", label: "Mobile number", type: "tel", autoComplete: "tel", inputMode: "tel" as const },
    b: { name: "passcode", label: "6-digit passcode", type: "password", autoComplete: "current-password", inputMode: "numeric" as const, maxLength: 6, pattern: "[0-9]{6}" },
  },
} as const;

// label is for the <label> text, not an input attribute
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const field = ({ label: _l, ...rest }: { label: string }) => rest;
const ERRORS: Record<number, string> = { 401: "Wrong details. Try again.", 429: "Too many attempts. Try again in 15 minutes." };

const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const input = `block h-12 w-full rounded-xl border border-line bg-card px-3.5 text-base text-fg ${ring}`;

export function LoginForm({ door }: { door: "staff" | "customer" }) {
  const d = DOORS[door];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [hasValue, setHasValue] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const noun = door === "staff" ? "password" : "passcode";

  useEffect(() => {
    if (error) formRef.current?.querySelector("input")?.focus();
  }, [error]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/auth/${door}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [d.a.name]: f.get(d.a.name), [d.b.name]: f.get(d.b.name) }),
      });
      if (r.ok) {
        window.location.assign((await r.json()).landing);
        return;
      }
      setError(ERRORS[r.status] ?? "Sign-in is unavailable right now. Try again shortly.");
    } catch {
      setError("Sign-in is unavailable right now. Try again shortly.");
    }
    setBusy(false);
  };

  const labelCls = "mb-1.5 block text-sm font-medium text-fg";
  return (
    <main className="grid min-h-dvh bg-sunken lg:grid-cols-2">
      <style>{`@keyframes ll-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <aside className="hidden flex-col justify-between border-r border-line bg-card p-12 lg:flex">
        <Wordmark />
        <div className="max-w-md">
          <p className="serif text-4xl font-semibold leading-tight text-fg">{d.heading}</p>
          <ul className="mt-8 space-y-4">
            {d.points.map(([icon, text]) => (
              <li key={text} className="flex items-start gap-3 text-base text-muted">
                <span className="mt-0.5 text-primary"><Icon name={icon} size={20} /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <span className="font-mono text-xs text-muted">Demo · synthetic data</span>
      </aside>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-[400px] animate-[ll-in_200ms_var(--ease-out)_both] motion-reduce:animate-none">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Wordmark />
            <span className="font-mono text-xs text-muted">Demo · synthetic data</span>
          </div>
          <h1 className="serif text-3xl font-semibold text-fg">{d.title}</h1>
          <p className="mt-2 text-base text-muted">{d.help}</p>

          <form ref={formRef} onSubmit={submit} className="mt-8">
            <label className={labelCls} htmlFor="ll-a">{d.a.label}</label>
            <input id="ll-a" {...field(d.a)} required disabled={busy} className={input} />

            <label className={`${labelCls} mt-5`} htmlFor="ll-b">{d.b.label}</label>
            <div className="relative">
              <input
                id="ll-b"
                {...field(d.b)}
                type={show ? "text" : d.b.type}
                onChange={(e) => setHasValue(e.target.value !== "")}
                required
                disabled={busy}
                className={`${input} pr-12 ${door === "customer" && hasValue ? "font-mono tracking-[0.3em]" : ""}`}
              />
              <button
                type="button"
                aria-label={show ? `Hide ${noun}` : `Show ${noun}`}
                aria-pressed={show}
                onClick={() => setShow((s) => !s)}
                className={`absolute right-0 top-0 flex h-12 w-11 cursor-pointer items-center justify-center rounded-xl text-muted ${ring}`}
              >
                <Icon name={show ? "x" : "eye"} size={18} />
              </button>
            </div>

            <p role="alert" className="min-h-5 py-3 text-sm text-danger-fg">
              <span key={error} className="inline-block animate-[enter-fade_150ms_ease-out_both] motion-reduce:animate-none">{error}</span>
            </p>

            <button
              type="submit"
              disabled={busy}
              className={`flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-fg transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none ${ring} focus-visible:ring-offset-2`}
            >
              {busy && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <Link href="/" className={`mt-4 flex h-11 items-center justify-center rounded-xl text-sm text-muted transition-colors duration-150 hover:text-fg motion-reduce:transition-none ${ring}`}>Back to home</Link>
        </div>
      </div>
    </main>
  );
}
