"use client";

import React, { Suspense } from "react";
import { StaffShell } from "@/components/staff/staff-shell";

export default function OpsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Loading Operations Console...</div>}>
      <StaffShell initialTab="ops" />
    </Suspense>
  );
}
