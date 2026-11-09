import { notFound } from "next/navigation";
import CallApp from "../../[customer]/call-app";

// Ops-started outbound collections call; the start request goes through /voice-out (adds the token).
export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!/^\d{1,9}$/.test(caseId)) notFound();
  return <CallApp customer={`Outbound case ${caseId}`} caseId={Number(caseId)} />;
}
