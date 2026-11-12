"use client";

import React, { Suspense } from "react";
import { StaffShell } from "@/components/staff/staff-shell";

export default function StaffPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Loading Staff Operations Desk...</div>}>
      <StaffShell />
    </Suspense>
  );
}
