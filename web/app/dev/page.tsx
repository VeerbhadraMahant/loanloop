"use client";

import React, { Suspense } from "react";
import { DevShell } from "@/components/dev/dev-shell";

export default function DevPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted">Loading Developer Lab...</div>}>
      <DevShell />
    </Suspense>
  );
}
