import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Sign in · LoanLoop" };

export default function Page() {
  return <LoginForm door="customer" />;
}
