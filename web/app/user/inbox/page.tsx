"use client";

import React, { Suspense } from "react";
import { UnifiedUserShell } from "@/components/user/unified-user-shell";

export default function UserInboxPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-bg text-xs text-muted">Loading Bank App...</div>}>
      <UnifiedUserShell initialTab="bank-app" />
    </Suspense>
  );
}
