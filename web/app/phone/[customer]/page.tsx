import { Suspense } from "react";
import PhoneApp from "./phone-app";

async function Inner({ params }: { params: Promise<{ customer: string }> }) {
  const { customer } = await params;
  return <PhoneApp customer={customer} />;
}

export default function Page({ params }: { params: Promise<{ customer: string }> }) {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <Inner params={params} />
    </Suspense>
  );
}
