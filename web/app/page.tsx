import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { Button, Card, Eyebrow, Icon, StatTile, type IconName } from "@/components/ui";

const stats = [
  { value: "33 ms", caption: "p95 gateway latency at 1,000 concurrent calls", accent: true },
  { value: "170", caption: "tests passing" },
  { value: "23", caption: "gateway actions" },
  { value: "4", caption: "languages" },
];
const safety: { icon: IconName; title: string; body: string }[] = [
  { icon: "lock", title: "Never takes secrets", body: "PINs, OTPs and card numbers are refused on the call and never reach the agent or its logs." },
  { icon: "eye", title: "Masked-only output", body: "The agent only ever hears masked values. Anything sensitive goes to the registered phone by SMS." },
  { icon: "phone", title: "Approval in the app", body: "Risky actions wait for the customer to approve in the bank app, not for a spoken yes." },
];

// Quiet waveform motif: deterministic bars, so server and client render identically.
function Waveform() {
  const bars = Array.from({ length: 64 }, (_, i) => {
    const h = 14 + Math.abs(Math.sin(i * 0.37) * 52 + Math.sin(i * 0.11 + 1) * 34);
    return <rect key={i} x={i * 18 + 4} y={110 - h / 2} width={6} height={h} rx={3} />;
  });
  return (
    <svg aria-hidden viewBox="0 0 1152 220" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <g fill="var(--fg)" opacity={0.14}>{bars}</g>
      <circle cx="300" cy="110" r="54" fill="var(--accent)" opacity={0.9} />
      <circle cx="690" cy="110" r="32" fill="var(--accent)" opacity={0.6} />
      <circle cx="930" cy="110" r="18" fill="var(--accent)" opacity={0.45} />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <TopNav />
      <main>
        <section className="relative overflow-hidden" style={{ background: "linear-gradient(180deg, var(--wash-from) 0%, var(--wash-to) 100%)" }}>
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
            <Eyebrow><span className="h-1.5 w-1.5 rounded-full bg-accent" />Voice service desk for borrowers</Eyebrow>
            <h1 className="serif mx-auto mt-6 max-w-4xl text-[44px] leading-[1.05] sm:text-7xl lg:text-[80px]">
              Every call ends with the work done.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-muted sm:text-lg">
              LoanLoop answers borrowers in their language, completes the request in the bank&apos;s system, and hands over to a person when it should.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Button href="/ops">Open ops console</Button>
              <Button href="/phone/priya" variant="secondary">Open Priya&apos;s phone</Button>
            </div>
          </div>
          <div className="mx-auto h-36 max-w-5xl px-4 pb-6 sm:h-44"><Waveform /></div>
        </section>

        <section aria-label="Key numbers" className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => <StatTile key={s.caption} {...s} />)}
          </div>
        </section>

        <section aria-labelledby="safe" className="mx-auto max-w-5xl px-4 pt-20 sm:px-6">
          <h2 id="safe" className="serif text-4xl sm:text-5xl">How it stays safe</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {safety.map((s) => (
              <Card key={s.title} className="p-6">
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-sunken"><Icon name={s.icon} size={20} /></span>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">
            Other demo phones:{" "}
            {["ramesh", "sunita"].map((c, i) => (
              <span key={c}>{i > 0 && ", "}<Link className="underline underline-offset-4" href={`/phone/${c}`}>{c}</Link></span>
            ))}
          </p>
        </section>
      </main>
      <footer className="mx-auto mt-20 max-w-5xl border-t border-line px-4 py-8 text-sm text-muted sm:px-6">
        <p>Built on Gnani Prisma · Timbre · Agent Builder</p>
        <p className="mt-1">Demo · synthetic data</p>
      </footer>
    </>
  );
}
