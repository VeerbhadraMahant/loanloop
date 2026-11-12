"use client";
import { useParams } from "next/navigation";
import CallApp from "@/app/call/[customer]/call-app";

export default function UserRoute() {
  const { customer } = useParams<{ customer: string }>();
  const c = decodeURIComponent(customer);
  return <CallApp key={c} customer={c} mode="user" />;
}

