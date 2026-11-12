"use client";
import { useEffect, useState } from "react";

export type Door = "staff" | "customer";
export type Me = { kind: Door; role: string; name: string; customer_key?: string };

/** The signed-in user of one door, from GET /auth/me. `me` stays null while loading or when signed out. */
export function useMe(door: Door) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch(`/auth/me?door=${door}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe, () => setMe(null));
  }, [door]);
  return me;
}

export function SignOut({ door, className = "" }: { door: Door; className?: string }) {
  const [busy, setBusy] = useState(false);
  const out = async () => {
    setBusy(true);
    try {
      const r = await fetch("/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ door }) });
      const j = await r.json();
      window.location.assign(j.login);
    } catch {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={out} disabled={busy} className={`cursor-pointer disabled:opacity-50 ${className}`}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
