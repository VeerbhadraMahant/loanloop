import type { Metadata } from "next";
import { PageHeader } from "@/components/bank/page-header";
import { EmptyState } from "@/components/bank/states";

export const metadata: Metadata = { title: "Collections" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Collections" description="Overdue cases, promises to pay and refusals." />
      <EmptyState title="Coming soon" description="This page is being built." />
    </div>
  );
}
