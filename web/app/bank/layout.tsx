import type { Metadata } from "next";
import { BankShell } from "@/components/bank/shell";

export const metadata: Metadata = {
  title: { default: "Today · Sahyadri Bank", template: "%s · Sahyadri Bank" },
  description: "Servicing, collections and compliance console for Sahyadri Finance Bank. Demo with synthetic data.",
};

export default function BankLayout({ children }: { children: React.ReactNode }) {
  return <BankShell>{children}</BankShell>;
}
