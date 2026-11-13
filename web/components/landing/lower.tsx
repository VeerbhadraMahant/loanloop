import Link from "next/link";
import { Icon } from "@/components/ui";
import { Arrow, NAV, Panel, Wordmark, btnGhostDark, btnPrimary } from "./shared";

const TIERS = [
  ["0", "Public", "No verification", "Branch lookup, IFSC check, reset guidance"],
  ["1", "Verified", "Registered mobile + date of birth or loan last 4", "Masked values, EMI details, SMS delivery, hardship handover"],
  ["2", "Approved", "Tier 1 + approval tapped in the bank app", "Amounts, payments, foreclosure, every data change"],
];
const GUARANTEES = ["Masked outputs only", "Out-of-band delivery to the number on file", "Three failed verifications, then human handover"];
const offsets = ["", "sm:ml-8", "sm:ml-3"];

export function Security() {
  return (
    <Panel id="security" tone="lagoon">
      <div className="ll-white grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="ll-display ll-white">Security tiers written in code</h2>
          <p className="ll-white80 mt-6 max-w-[48ch] text-lg">Passwords, PINs, OTPs, CVV and card numbers are never asked, accepted, stored or returned.</p>
          <ul className="mt-8 space-y-3">
            {GUARANTEES.map((g) => (
              <li key={g} className="flex gap-3 text-base"><Icon name="check" size={20} className="mt-0.5" />{g}</li>
            ))}
          </ul>
          <a href="#results" className={`${btnGhostDark} mt-8`}>See measured results<Arrow /></a>
        </div>
        <div className="relative lg:order-first">
          <div aria-hidden className="ll-rect ll-rectLilac left-0 top-6 h-48 w-3/5" />
          <div aria-hidden className="ll-rect ll-rectBlue right-0 top-1/3 h-56 w-1/2" />
          <div aria-hidden className="ll-rect ll-rectRose bottom-2 left-6 h-44 w-2/5" />
          <ol className="relative flex flex-col gap-3 p-3 sm:p-6">
            {TIERS.map(([n, name, unlock, allow], i) => (
              <li key={n} className={`ll-tier ${offsets[i]} grid grid-cols-[3rem_1fr] items-start gap-x-4 p-4 sm:p-5`}>
                <span className="ll-mono text-[44px] font-medium leading-none">{n}</span>
                <div>
                  <h3 className="text-[19px] font-bold">Tier {n} {name}</h3>
                  <p className="ll-white80 mt-1 text-sm">{unlock}</p>
                  <p className="mt-2 text-base">{allow}</p>
                </div>
              </li>
            ))}
            <li className="ll-tier ll-tierNever grid grid-cols-[3rem_1fr] items-start gap-x-4 p-4 sm:ml-12 sm:p-5">
              <span className="ll-mono text-[44px] font-medium leading-none">3</span>
              <div>
                <h3 className="text-[19px] font-bold">Tier 3 Never</h3>
                <p className="mt-1 text-sm font-semibold uppercase tracking-wide">Cannot be unlocked</p>
                <p className="mt-2 text-base">Passwords, PINs, OTPs, CVV and card numbers are never asked, accepted, stored or returned</p>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </Panel>
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
    <Panel id="languages" tone="sand">
      <div>
        <h2 className="ll-h2 ll-ink max-w-[20ch]">11 Indian languages on one call</h2>
        <p className="ll-ink mt-5 max-w-[60ch] text-lg">Speech recognition and voices are Gnani Prisma and Timbre. Callers can switch language mid-call.</p>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {LANGS.map(([native, en, lang, beta]) => (
            <li key={en} className="ll-card flex min-h-28 flex-col justify-between p-5">
              <span lang={lang} className="ll-ink text-[28px] font-medium leading-tight sm:text-[32px]">{native}</span>
              <span className="ll-stone mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">{en}{beta && <span className="ll-bgLilac ll-ink rounded-md px-2 py-0.5 text-xs font-semibold">beta</span>}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

const RESULTS = [
  ["1,000", "concurrent simulated calls, 0 errors"],
  ["33 ms", "gateway p95 per action (target under 50 ms)"],
  ["94/100", "scripted calls passed in the four core languages"],
  ["139/140", "scripted calls passed in the seven beta languages"],
];

export function Results() {
  return (
    <Panel id="results" tone="mist">
      <div>
        <h2 className="ll-h2 ll-ink">Measured results</h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RESULTS.map(([n, l]) => (
            <li key={n} className="ll-glass p-6">
              <p className="ll-figure ll-mono ll-ink text-[40px] xl:text-[48px]">{n}</p>
              <p className="ll-stone mt-3 text-base">{l}</p>
            </li>
          ))}
        </ul>
        <p className="ll-ink mt-8 max-w-[70ch] text-sm">Single-machine numbers: load generator, gateway, Postgres and Redis share one box. End-to-end voice latency is not measured at scale.</p>
      </div>
    </Panel>
  );
}

const door = `ll-lift ll-card relative flex cursor-pointer flex-col p-6 lg:p-10 has-[a:focus-visible]:outline has-[a:focus-visible]:outline-2`;
const cta = `${btnPrimary} mt-8 self-start after:absolute after:inset-0 after:rounded-2xl`;

export function TwoDoors() {
  return (
    <Panel id="signin" tone="dawn" pad="py-16 lg:py-28">
      <div>
        <h2 className="ll-display ll-ink">Two sign-in doors</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className={door}>
            <Icon name="phone" size={28} className="ll-ink" />
            <h3 className="ll-sub ll-ink mt-5">Customer</h3>
            <p className="ll-stone mt-3 max-w-[40ch] text-base">See the official bank SMS sent to you and call the voice desk.</p>
            <Link href="/login" className={cta}>Customer sign in<Arrow /></Link>
          </div>
          <div className={door}>
            <Icon name="landmark" size={28} className="ll-ink" />
            <h3 className="ll-sub ll-ink mt-5">Bank staff</h3>
            <ul className="ll-stone mt-3 space-y-2 text-base">
              <li><span className="ll-ink font-medium">Bank manager:</span> bank, ops, collections</li>
              <li><span className="ll-ink font-medium">Engineer:</span> dev lab, metrics, test cases</li>
              <li><span className="ll-ink font-medium">Admin:</span> everything</li>
            </ul>
            <Link href="/staff/login" className={cta}>Staff sign in<Arrow /></Link>
          </div>
        </div>
      </div>
    </Panel>
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
    <Panel id="about" tone="blush">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="ll-h2 ll-ink">About LoanLoop</h2>
          <p className="ll-ink mt-6 max-w-[50ch] text-lg">
            LoanLoop is an entry for the Gnani Great Indian AI Internship Challenge. Speech is Gnani: Prisma for recognition, Timbre for voices. All data is synthetic, and Sahyadri Finance Bank is a fictional lender.
          </p>
        </div>
        <div className="ll-card ll-divide px-6">
          {FAQ.map(([q, a]) => (
            <details key={q} className="ll-faq py-2">
              <summary className="ll-ink flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 text-[19px] font-bold">
                {q}
                <Icon name="chevron_down" size={20} className="ll-chev" />
              </summary>
              <p className="ll-stone pb-3 text-base">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function Footer() {
  const h = "text-sm font-bold text-white";
  const l = "ll-footLink inline-flex min-h-11 items-center text-base";
  return (
    <Panel tone="wine" as="footer" pad="py-12">
      <div className="ll-white grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark className="text-white" />
          <p className="ll-white70 mt-3 max-w-[32ch] text-base">Sahyadri Finance Bank is a fictional lender. All data is synthetic.</p>
        </div>
        <nav aria-label="Product">
          <h2 className={h}>Product</h2>
          <ul className="mt-2">
            {NAV.filter(([x]) => x !== "#about").map(([x, t]) => <li key={x}><a href={x} className={l}>{t}</a></li>)}
          </ul>
        </nav>
        <nav aria-label="Sign in">
          <h2 className={h}>Sign in</h2>
          <ul className="mt-2">
            <li><Link href="/login" className={l}>Customer sign in</Link></li>
            <li><Link href="/staff/login" className={l}>Staff sign in</Link></li>
          </ul>
        </nav>
        <nav aria-label="About">
          <h2 className={h}>About</h2>
          <ul className="mt-2">
            <li><a href="#about" className={l}>About LoanLoop</a></li>
            <li><a href="#about" className={l}>FAQ</a></li>
          </ul>
        </nav>
      </div>
    </Panel>
  );
}
