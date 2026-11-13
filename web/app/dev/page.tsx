import React, { Suspense } from "react";
import { DevShell } from "@/components/dev/dev-shell";

export const metadata = { title: "Developer lab | LoanLoop" };

export default function DevPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Loading Developer Lab...</div>}>
      <DevShell />
    </Suspense>
  );
}
