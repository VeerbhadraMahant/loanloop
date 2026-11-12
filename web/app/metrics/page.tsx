"use client";

import React, { Suspense } from "react";
import { DevShell } from "@/components/dev/dev-shell";

export default function MetricsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Loading Metrics & SLA...</div>}>
      <DevShell initialTab="metrics" />
    </Suspense>
  );
}
