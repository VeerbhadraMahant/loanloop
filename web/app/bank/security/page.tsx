import type { Metadata } from "next";
import { PageHeader } from "@/components/bank/page-header";
import { EmptyState } from "@/components/bank/states";

export const metadata: Metadata = { title: "Security" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Security" description="Blocked attempts, spoken secrets and unapproved requests." />
      <EmptyState title="Coming soon" description="This page is being built." />
    </div>
  );
}
