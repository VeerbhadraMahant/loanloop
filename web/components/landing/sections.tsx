import { Icon, type IconName } from "@/components/ui";
import { Arrow, Panel, link } from "./shared";

export function Problem() {
  const stats = [
    ["13.34 lakh", "complaints to the RBI Ombudsman in FY 2024-25"],
    ["29.25%", "of them about loans and advances"],
    ["70%+", "of calls to RBI's contact centre are in Hindi"],
  ];
  return (
    <Panel id="problem" tone="sand">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="ll-h2 ll-ink max-w-[16ch]">The call-back problem for lenders</h2>
          <p className="ll-ink mt-6 max-w-[52ch] text-lg">
            Indian lenders automate outbound calls, but borrower call-backs are still handled by people. Borrowers wait on hold, repeat themselves, and have no safe way to get help with details they are told never to share.
          </p>
        </div>
        <div>
          <dl className="ll-card ll-divide">
            {stats.map(([n, l]) => (
              <div key={n} className="p-6 sm:p-8">
                <dt className="ll-figure ll-ink text-[44px] sm:text-[56px]">{n}</dt>
                <dd className="ll-stone mt-3 text-base">{l}</dd>
              </div>
            ))}
          </dl>
          <p className="ll-ink mt-4 text-sm">Source: RBI Ombudsman annual report, FY 2024-25.</p>
        </div>
      </div>
    </Panel>
  );
}

const FEATURES: { id: string; icon: IconName; title: string; items: string[] }[] = [
  { id: "feat-secure", icon: "lock", title: "Secure details", items: ["Branch IFSC lookup", "Masked account, customer ID, mobile and email", "Full details by SMS to the registered mobile", "Password-reset guidance"] },
  { id: "feat-loans", icon: "wallet", title: "Loan servicing", items: ["EMI amount and due date", "“I already paid” check with a reconciliation ticket", "EMI date change", "Foreclosure quote and closure request", "Statements and interest certificates"] },
  { id: "feat-calls", icon: "sync", title: "One call, many requests", items: ["Several requests without re-verifying", "Mid-call language switching", "Warm handover with a structured case record when unsure"] },
];

export function Features() {
  return (
    <Panel id="features" tone="mist">
      <div>
        <h2 className="ll-h2 ll-ink max-w-[18ch]">Requests the voice desk completes</h2>
        <nav aria-label="Request groups" className="ll-glass mt-10 grid gap-1 p-1 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <a key={f.id} href={`#${f.id}`} className={`${i === 0 ? "ll-bgLilac" : ""} ll-tab ll-ink flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-4 py-2 text-center font-semibold`}>{f.title}</a>
          ))}
        </nav>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.id} id={f.id} className="ll-card flex scroll-mt-24 flex-col p-6">
              <Icon name={f.icon} size={28} className="ll-ink" />
              <h3 className="ll-ink mt-5 text-[19px] font-bold">{f.title}</h3>
              <ul className="ll-stone mt-4 flex-1 space-y-3 text-base">
                {f.items.map((i) => (
                  <li key={i} className="flex gap-3"><Icon name="check" size={16} className="ll-ink mt-1" />{i}</li>
                ))}
              </ul>
              <a href="#how" className={`${link} mt-6 self-start`}>See how a call runs<Arrow /></a>
            </article>
          ))}
        </div>
      </div>
    </Panel>
  );
}

const STEPS = [
  ["Speak", "The caller holds to talk. Gnani Prisma turns speech into text."],
  ["Verify", "Registered mobile plus date of birth or loan last four digits."],
  ["Act", "The agent calls one of 23 gateway actions. The gateway checks the tier, masks values and writes the audit log."],
  ["Confirm", "Gnani Timbre speaks the reply. Sensitive details go by SMS to the registered phone, never read aloud."],
];

function Stage({ title, note, tint }: { title: string; note?: string; tint?: boolean }) {
  return (
    <div className={`${tint ? "ll-tint" : "ll-bgCanvas"} ll-bLine ll-ink rounded-xl px-4 py-3`}>
      <p className="font-semibold">{title}</p>
      {note && <p className="ll-stone text-sm">{note}</p>}
    </div>
  );
}

export function How() {
  return (
    <Panel id="how" tone="blush">
      <div>
        <h2 className="ll-h2 ll-ink">How a call runs</h2>
        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <ol>
            {STEPS.map(([t, d], i) => (
              <li key={t} className={`relative flex gap-5 ${i < STEPS.length - 1 ? "pb-9" : ""}`}>
                {i < STEPS.length - 1 && <span aria-hidden className="absolute bottom-1 left-5 top-12 w-px ll-hairline" />}
                <span className="ll-bInk ll-bgCanvas ll-mono ll-ink relative z-10 inline-flex size-10 shrink-0 items-center justify-center rounded-full font-semibold">{i + 1}</span>
                <div>
                  <h3 className="ll-ink text-[19px] font-bold">{t}</h3>
                  <p className="ll-stone mt-1 text-base">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="ll-card p-6" role="group" aria-label="Call pipeline">
            <p className="ll-eyebrow ll-stone mb-4">Pipeline</p>
            <div className="flex flex-col items-stretch gap-2">
              <Stage title="Caller speech" />
              <Arrow down className="ll-stone self-center" />
              <Stage title="Gnani Prisma" note="speech to text" />
              <Arrow down className="ll-stone self-center" />
              <Stage title="Language model" />
              <Arrow down className="ll-stone self-center" />
              <Stage title="Bank gateway" note="tier check, masking, audit log" tint />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Arrow down className="ll-stone self-center" />
                  <Stage title="Gnani Timbre" note="voice" />
                </div>
                <div className="flex flex-col gap-2">
                  <Arrow down className="ll-stone self-center" />
                  <Stage title="SMS to registered mobile" note="side branch" tint />
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="ll-glass ll-ink mt-10 max-w-[65ch] p-6 text-lg">Every spoken figure comes from the bank database, so the language model cannot invent a number.</p>
      </div>
    </Panel>
  );
}
