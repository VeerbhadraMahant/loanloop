"use client";

import React, { Suspense } from "react";
import { UnifiedUserShell } from "@/components/user/unified-user-shell";

export default function UserHomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-bg text-xs text-muted">Loading...</div>}>
      <UnifiedUserShell initialTab="console" />
    </Suspense>
  );
}
