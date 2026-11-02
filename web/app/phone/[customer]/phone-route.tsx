"use client";
import { useParams } from "next/navigation";
import PhoneApp from "./phone-app";

// Reads the route param on the client so the page needs no server-side streaming hole.
export default function PhoneRoute() {
  const { customer } = useParams<{ customer: string }>();
  return <PhoneApp customer={customer} />;
}
