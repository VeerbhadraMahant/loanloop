"use client";

import React, { Suspense } from "react";
import { UnifiedUserShell } from "@/components/user/unified-user-shell";

export default function UserHelpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-bg text-xs text-muted">Loading Account...</div>}>
      <UnifiedUserShell initialTab="account" />
    </Suspense>
  );
}
