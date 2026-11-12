"use client";

import React, { Suspense } from "react";
import { UnifiedUserShell } from "@/components/user/unified-user-shell";

export default function UserActivityPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-bg text-xs text-muted">Loading Activity...</div>}>
      <UnifiedUserShell initialTab="console" />
    </Suspense>
  );
}
