"use client";

import React from "react";
import { UserProvider } from "@/lib/user/session";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <UserProvider>{children}</UserProvider>;
}
