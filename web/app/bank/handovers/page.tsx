import type { Metadata } from "next";
import { PageHeader } from "@/components/bank/page-header";
import { EmptyState } from "@/components/bank/states";

export const metadata: Metadata = { title: "Handovers" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Handovers" description="Calls passed to your team with a case summary." />
      <EmptyState title="Coming soon" description="This page is being built." />
    </div>
  );
}
