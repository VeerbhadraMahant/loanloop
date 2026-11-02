import { Suspense } from "react";
import PhoneRoute from "./phone-route";

export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-sunken"><p className="text-muted">Loading…</p></main>}>
      <PhoneRoute />
    </Suspense>
  );
}
