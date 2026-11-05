"use client";
import { useParams } from "next/navigation";
import CallApp from "./call-app";

// Same pattern as /phone: read the route param on the client.
export default function CallRoute() {
  const { customer } = useParams<{ customer: string }>();
  return <CallApp customer={decodeURIComponent(customer)} />;
}
