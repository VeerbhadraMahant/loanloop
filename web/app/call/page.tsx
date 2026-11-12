"use client";
import CallApp from "./call-app";
import { useMe } from "@/components/auth";

// The customer comes from the session, never from the URL.
export default function Page() {
  const me = useMe("customer");
  if (!me?.customer_key) return <main className="flex min-h-screen items-center justify-center bg-sunken"><p className="text-muted">Loading…</p></main>;
  return <CallApp key={me.customer_key} customer={me.customer_key} name={me.name} />;
}
