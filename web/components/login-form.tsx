"use client";
import { useState } from "react";
import { Wordmark } from "@/components/ui";

const DOORS = {
  staff: {
    title: "Staff sign in",
    a: { name: "email", label: "Email", type: "email", autoComplete: "username" },
    b: { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
  },
  customer: {
    title: "Sign in",
    a: { name: "mobile", label: "Mobile number", type: "tel", autoComplete: "tel", inputMode: "tel" as const },
    b: { name: "passcode", label: "6-digit passcode", type: "password", autoComplete: "current-password", inputMode: "numeric" as const, maxLength: 6, pattern: "[0-9]{6}" },
  },
} as const;

// label is for the <label> text, not an input attribute
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const field = ({ label: _l, ...rest }: { label: string }) => rest;
const ERRORS: Record<number, string> = { 401: "Wrong details. Try again.", 429: "Too many attempts. Try again in 15 minutes." };

export function LoginForm({ door }: { door: "staff" | "customer" }) {
  const d = DOORS[door];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const input = "mt-1 block w-full rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary";
  return (
    <main className="flex min-h-screen items-center justify-center bg-sunken p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <Wordmark />
          <span className="font-mono text-[11px] text-muted">Demo · synthetic data</span>
        </div>
        <h1 className="serif text-2xl font-semibold text-fg">{d.title}</h1>
        <label className="block text-sm font-medium text-fg">
          {d.a.label}
          <input {...field(d.a)} required disabled={busy} className={input} />
        </label>
        <label className="block text-sm font-medium text-fg">
          {d.b.label}
          <input {...field(d.b)} required disabled={busy} className={input} />
        </label>
        <p role="alert" className="min-h-5 text-sm text-danger-fg">{error}</p>
        <button type="submit" disabled={busy} className="h-11 w-full cursor-pointer rounded-xl bg-primary text-sm font-semibold text-primary-fg disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
