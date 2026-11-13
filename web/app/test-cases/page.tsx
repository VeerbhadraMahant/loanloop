"use client";

import React, { Suspense } from "react";
import { DevShell } from "@/components/dev/dev-shell";

export default function TestCasesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Loading Test Cases...</div>}>
      <DevShell initialTab="test-cases" />
    </Suspense>
  );
}
