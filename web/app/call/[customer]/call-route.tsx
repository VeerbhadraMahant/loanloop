"use client";
import { useParams } from "next/navigation";
import CallApp from "./call-app";

// Same pattern as /phone: read the route param on the client.
export default function CallRoute() {
  const { customer } = useParams<{ customer: string }>();
  const c = decodeURIComponent(customer);
  // key: switching persona via the scenario links must not carry a live call/transcript over to the new persona.
  return <CallApp key={c} customer={c} />;
}
