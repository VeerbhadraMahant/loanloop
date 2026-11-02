import Link from "next/link";
import { Shell } from "@/components/ui";

const link = "rounded border border-slate-300 bg-white px-4 py-3 font-medium text-blue-800 hover:bg-blue-50";

export default function Home() {
  return (
    <Shell title="LoanLoop">
      <p className="mb-6 max-w-2xl text-slate-700">
        LoanLoop is a voice service desk for a lender&apos;s borrowers. Every request ends with an action completed in
        the bank&apos;s system, and the agent is safe by design: it never takes secrets, never sees full sensitive
        values, and sends anything sensitive only to the customer&apos;s registered phone. All data here is synthetic.
      </p>
      <h2 className="mb-2 font-semibold">Mock bank app (customer phone)</h2>
      <div className="mb-6 flex flex-wrap gap-3">
        {["priya", "ramesh", "sunita"].map((c) => (
          <Link key={c} href={`/phone/${c}`} className={link}>Phone: {c}</Link>
        ))}
      </div>
      <h2 className="mb-2 font-semibold">Dashboards</h2>
      <div className="flex flex-wrap gap-3">
        <Link href="/ops" className={link}>Ops console</Link>
        <Link href="/metrics" className={link}>Metrics</Link>
      </div>
    </Shell>
  );
}
