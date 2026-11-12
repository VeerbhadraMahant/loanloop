"use client";

import React, { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/auth-context";
import { UnifiedUserShell, type UserShellTab } from "@/components/user/unified-user-shell";

function UserPageContent() {
  const { isAuthenticated } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") as UserShellTab | null;
  const qParam = searchParams.get("q") || undefined;

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/user/welcome");
    }
  }, [isAuthenticated, router]);

  return <UnifiedUserShell initialTab={tabParam ?? "console"} initialUtterance={qParam} />;
}

export default function UserIndexPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg text-xs text-muted">
          Loading Sahyadri Voice Banking...
        </div>
      }
    >
      <UserPageContent />
    </Suspense>
  );
}
