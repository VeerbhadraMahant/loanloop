import { Suspense } from "react";
import OutboundRoute from "./outbound-route";

// Ops-started outbound collections call; the start request goes through /voice-out (adds the token).
export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-sunken"><p className="text-muted">Loading…</p></main>}>
      <OutboundRoute />
    </Suspense>
  );
}
