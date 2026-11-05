import { Suspense } from "react";
import CallRoute from "./call-route";

export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-sunken"><p className="text-muted">Loading…</p></main>}>
      <CallRoute />
    </Suspense>
  );
}
