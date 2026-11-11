import type { Metadata } from "next";
import { PageHeader } from "@/components/bank/page-header";
import { EmptyState } from "@/components/bank/states";

export const metadata: Metadata = { title: "Conversations" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Conversations" description="Every borrower call, with outcome and language." />
      <EmptyState title="Coming soon" description="This page is being built." />
    </div>
  );
}
