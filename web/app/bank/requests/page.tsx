import type { Metadata } from "next";
import { PageHeader } from "@/components/bank/page-header";
import { EmptyState } from "@/components/bank/states";

export const metadata: Metadata = { title: "Service requests" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Service requests" description="Requests raised during calls, awaiting action." />
      <EmptyState title="Coming soon" description="This page is being built." />
    </div>
  );
}
