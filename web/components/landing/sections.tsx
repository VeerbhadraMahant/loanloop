import Link from "next/link";
import { Icon, Pill, Wordmark, type IconName } from "@/components/ui";
import s from "./landing.module.css";
import { NAV, Section } from "./shared";

const fig = "font-mono text-4xl font-semibold text-fg lg:text-5xl";

export function Problem() {
  const stats = [
    ["13.34 lakh", "complaints to the RBI Ombudsman in FY 2024-25"],
    ["29.25%", "of them about loans and advances"],
    ["70%+", "of calls to RBI's contact centre are in Hindi"],
  ];
  return (
    <Section id="problem" title="The call-back problem for lenders">
      <p className="mt-5 max-w-[65ch] text-lg text-muted">
        Indian lenders automate outbound calls, but borrower call-backs are still handled by people. Borrowers wait on hold, repeat themselves, and have no safe way to get help with details they are told never to share.
      </p>
      <dl className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
        {stats.map(([n, l]) => (
          <div key={n} className="bg-card p-8">
            <dt className={fig}>{n}</dt>
            <dd className="mt-3 text-base text-muted">{l}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-muted">Source: RBI Ombudsman annual report, FY 2024-25.</p>
    </Section>
  );
}

const FEATURES: { icon: IconName; title: string; items: string[] }[] = [
  { icon: "lock", title: "Secure details", items: ["Branch IFSC lookup", "Masked account, customer ID, mobile and email", "Full details by SMS to the registered mobile", "Password-reset guidance"] },
  { icon: "wallet", title: "Loan servicing", items: ["EMI amount and due date", "“I already paid” check with a reconciliation ticket", "EMI date change", "Foreclosure quote and closure request", "Statements and interest certificates"] },
  { icon: "sync", title: "One call, many requests", items: ["Several requests without re-verifying", "Mid-call language switching", "Warm handover with a structured case record when unsure"] },
];

export function Features() {
  return (
    <Section id="features" alt title="Requests the voice desk completes">
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {FEATURES.map((f) => (
          <article key={f.title} className="rounded-2xl border border-line bg-sunken p-6">
            <span className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-card text-primary"><Icon name={f.icon} size={20} /></span>
            <h3 className="mt-5 text-xl font-semibold text-fg">{f.title}</h3>
            <ul className="mt-4 space-y-3 text-base text-muted">
              {f.items.map((i) => (
                <li key={i} className="flex gap-3"><Icon name="check" size={16} className="mt-1 text-primary" />{i}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Section>
  );
}

const STEPS = [
  ["Speak", "The caller holds to talk. Gnani Prisma turns speech into text."],
  ["Verify", "Registered mobile plus date of birth or loan last four digits."],
  ["Act", "The agent calls one of 23 gateway actions. The gateway checks the tier, masks values and writes the audit log."],
  ["Confirm", "Gnani Timbre speaks the reply. Sensitive details go by SMS to the registered phone, never read aloud."],
];

export function How() {
  return (
    <Section id="how" title="How a call runs">
      <ol className="relative mt-12 grid gap-8 md:grid-cols-4 md:gap-6">
        <span aria-hidden className="absolute left-[21px] top-5 h-[calc(100%-2.5rem)] w-px bg-line md:left-5 md:top-[21px] md:h-px md:w-[calc(100%-2.5rem)]" />
        {STEPS.map(([t, d], i) => (
          <li key={t} className="relative flex gap-4 md:block">
            <span className="relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card font-mono text-base font-semibold text-primary">{i + 1}</span>
            <div className="md:mt-5">
              <h3 className="text-xl font-semibold text-fg">{t}</h3>
              <p className="mt-2 text-base text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-12 max-w-[65ch] text-lg text-fg">Every spoken figure comes from the bank database, so the language model cannot invent a number.</p>
    </Section>
  );
}

const TIERS = [
  ["0", "Public", "No verification", "Branch lookup, IFSC check, reset guidance"],
  ["1", "Verified", "Registered mobile + date of birth or loan last 4", "Masked values, EMI details, SMS delivery, hardship handover"],
  ["2", "Approved", "Tier 1 + approval tapped in the bank app", "Amounts, payments, foreclosure, every data change"],
];
const GUARANTEES = ["Masked outputs only", "Out-of-band delivery to the number on file", "Three failed verifications, then human handover"];

export function Security() {
  return (
    <Section id="security" alt title="Security tiers written in code">
      <div className="mt-12 grid gap-10 lg:grid-cols-[1.7fr_1fr]">
        <ol className="overflow-hidden rounded-2xl border border-line">
          {TIERS.map(([n, name, unlock, allow]) => (
            <li key={n} className="grid grid-cols-[3rem_1fr] items-baseline gap-x-5 gap-y-1 border-b border-line bg-sunken p-5 sm:grid-cols-[4rem_1fr_1.3fr] sm:p-6">
              <span className="font-mono text-4xl font-semibold text-primary sm:row-span-1">{n}</span>
              <div>
                <h3 className="text-lg font-semibold text-fg">Tier {n} {name}</h3>
                <p className="mt-1 text-base text-muted">{unlock}</p>
              </div>
              <p className="col-start-2 text-base text-fg sm:col-start-3">{allow}</p>
            </li>
          ))}
          <li className="grid grid-cols-[3rem_1fr] items-baseline gap-x-5 gap-y-1 border-danger-line bg-danger-bg p-5 sm:grid-cols-[4rem_1fr_1.3fr] sm:p-6">
            <span className="font-mono text-4xl font-semibold text-danger-fg">3</span>
            <div>
              <h3 className="text-lg font-semibold text-danger-fg">Tier 3 Never</h3>
              <p className="mt-1 text-base text-danger-fg">Cannot be unlocked</p>
            </div>
            <p className="col-start-2 text-base text-danger-fg sm:col-start-3">Passwords, PINs, OTPs, CVV and card numbers are never asked, accepted, stored or returned</p>
          </li>
        </ol>
        <ul className="flex flex-col justify-center gap-5">
          {GUARANTEES.map((g) => (
            <li key={g} className="flex gap-3 text-lg text-fg"><Icon name="verified" size={22} className="mt-0.5 text-primary" />{g}</li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

const LANGS: [string, string, string, boolean][] = [
  ["English", "English", "en", false],
  ["हिन्दी", "Hindi", "hi", false],
  ["Hinglish", "Hinglish", "en", false],
  ["मराठी", "Marathi", "mr", false],
  ["বাংলা", "Bengali", "bn", true],
  ["ગુજરાતી", "Gujarati", "gu", true],
  ["ಕನ್ನಡ", "Kannada", "kn", true],
  ["മലയാളം", "Malayalam", "ml", true],
  ["ਪੰਜਾਬੀ", "Punjabi", "pa", true],
  ["தமிழ்", "Tamil", "ta", true],
  ["తెలుగు", "Telugu", "te", true],
];

export function Languages() {
  return (
    <Section id="languages" title="11 Indian languages on one call">
      <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {LANGS.map(([native, en, lang, beta]) => (
          <li key={en} className="flex min-h-24 flex-col justify-between rounded-xl border border-line bg-card p-4">
            <span lang={lang} className="text-2xl font-semibold text-fg">{native}</span>
            <span className="mt-2 flex items-center justify-between gap-2 text-sm text-muted">{en}{beta && <Pill tone="warn">beta</Pill>}</span>
          </li>
        ))}
      </ul>
      <p className="mt-8 max-w-[65ch] text-base text-muted">Speech recognition and voices are Gnani Prisma and Timbre. Callers can switch language mid-call.</p>
    </Section>
  );
}

const RESULTS = [
  ["1,000", "concurrent simulated calls, 0 errors"],
  ["33 ms", "gateway p95 per action (target under 50 ms)"],
  ["94 / 100", "scripted calls passed in the four core languages"],
  ["139 / 140", "scripted calls passed in the seven beta languages"],
];

export function Results() {
  return (
    <Section id="results" alt title="Measured results">
      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {RESULTS.map(([n, l]) => (
          <li key={n} className="rounded-2xl border border-line border-l-primary bg-sunken p-6 [border-left-width:3px]">
            <p className={fig}>{n}</p>
            <p className="mt-3 text-base text-muted">{l}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-[70ch] text-sm text-muted">Single-machine numbers: load generator, gateway, Postgres and Redis share one box. End-to-end voice latency is not measured at scale.</p>
    </Section>
  );
}

const card = `${s.lift} relative flex flex-col rounded-2xl border border-line bg-card p-8 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary`;
const cta = `${s.btn} mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-base font-semibold text-primary-fg outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:ring-2 focus-visible:ring-primary`;

export function TwoDoors() {
  return (
    <Section id="signin" title="Two sign-in doors">
      <div className="mt-12 grid gap-5 md:grid-cols-2">
        <div className={card}>
          <h3 className="text-2xl font-semibold text-fg">Customer</h3>
          <p className="mt-3 max-w-[40ch] text-base text-muted">See the official bank SMS sent to you and call the voice desk.</p>
          <Link href="/login" className={`${cta} self-start`}>Customer sign in</Link>
        </div>
        <div className={card}>
          <h3 className="text-2xl font-semibold text-fg">Bank staff</h3>
          <ul className="mt-3 space-y-1 text-base text-muted">
            <li><span className="font-medium text-fg">Bank manager:</span> bank, ops, collections</li>
            <li><span className="font-medium text-fg">Engineer:</span> dev lab, metrics, test cases</li>
            <li><span className="font-medium text-fg">Admin:</span> everything</li>
          </ul>
          <Link href="/staff/login" className={`${cta} self-start`}>Staff sign in</Link>
        </div>
      </div>
    </Section>
  );
}

const FAQ = [
  ["Is this a real bank?", "No. Sahyadri Finance Bank is a fictional lender with 200 synthetic customers."],
  ["Will the agent ask for my OTP or PIN?", "Never. If a caller says one aloud it is caught before the language model sees it and is not stored."],
  ["Which language model answers?", "A local open model for English, Hindi, Hinglish and Marathi, and Sarvam for the other seven languages. Speech is Gnani."],
  ["What happens when the agent is unsure?", "It hands over to a person with a structured case record."],
];

export function About() {
  return (
    <Section id="about" alt title="About LoanLoop">
      <div className="mt-12 grid gap-12 lg:grid-cols-2">
        <p className="max-w-[50ch] text-lg text-muted">
          LoanLoop is an entry for the Gnani Great Indian AI Internship Challenge. Speech is Gnani: Prisma for recognition, Timbre for voices. All data is synthetic, and Sahyadri Finance Bank is a fictional lender.
        </p>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-lg font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                {q}
                <Icon name="chevron_down" size={18} className="text-muted group-open:rotate-180" />
              </summary>
              <p className="pb-2 pt-2 text-base text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function Footer() {
  const l = "inline-flex h-11 items-center rounded-lg px-2 text-base text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <footer className="border-t border-line bg-sunken">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          <Wordmark />
          <p className="mt-2 text-base text-muted">Demo with synthetic data. Sahyadri Finance Bank is fictional.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-2">
          {NAV.map(([h, t]) => <a key={h} href={h} className={l}>{t}</a>)}
          <Link href="/staff/login" className={l}>Staff sign in</Link>
          <Link href="/login" className={l}>Customer sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
