"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UnifiedUserShell } from "@/components/user/unified-user-shell";

function TalkRoute() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? undefined;
  return <UnifiedUserShell initialTab="calling-desk" initialUtterance={q} />;
}

export default function UserTalkPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-bg text-xs text-muted">Loading Calling Desk...</div>}>
      <TalkRoute />
    </Suspense>
  );
}
