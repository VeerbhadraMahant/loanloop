"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UnifiedUserShell } from "@/components/user/unified-user-shell";

function Talk() {
  return <UnifiedUserShell initialTab="calling-desk" initialUtterance={useSearchParams().get("q") ?? undefined} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Starting voice session...</div>}>
      <Talk />
    </Suspense>
  );
}
