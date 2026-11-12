"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/auth-context";

export default function UserConsoleIndexPage() {
  const { isAuthenticated } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/user/home");
    } else {
      router.replace("/user/welcome");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg text-xs text-muted font-sans">
      Loading Sahyadri Voice Banking...
    </div>
  );
}
