import { Suspense } from "react";
import UserRoute from "./user-route";

export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-sunken"><p className="text-muted">Loading…</p></main>}>
      <UserRoute />
    </Suspense>
  );
}

