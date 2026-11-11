"use client";
import React from "react";
import { AppHeader } from "@/components/sidebar-nav";

export function TopNav({ status }: { status?: React.ReactNode }) {
  return <AppHeader status={status} />;
}
