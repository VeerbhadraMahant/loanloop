"use client";
import { notFound, useParams } from "next/navigation";
import CallApp from "../../[customer]/call-app";

export default function OutboundRoute() {
  const { caseId } = useParams<{ caseId: string }>();
  if (!caseId || !/^\d{1,9}$/.test(caseId)) notFound();
  return <CallApp customer={`Outbound case ${caseId}`} caseId={Number(caseId)} />;
}

