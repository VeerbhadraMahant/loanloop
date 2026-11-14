import Link from "next/link";
import { Icon } from "@/components/ui";
import { Arrow, Bento, Cell, Chapter, Chevron, NAV, Section, Wordmark, btnOnDark, btnOutlineDark, btnPrimary, linkDark } from "./shared";

const TIERS = [
  ["0", "Public", "No verification", "Branch lookup, IFSC check, reset guidance"],
  ["1", "Verified", "Registered mobile + date of birth or loan last 4", "Masked values, EMI details, SMS delivery, hardship handover"],
  ["2", "Approved", "Tier 1 + approval tapped in the bank app", "Amounts, payments, foreclosure, every data change"],
];
const GUARANTEES = ["Masked outputs only", "Out-of-band delivery to the number on file", "Three failed verifications, then human handover"];

export function Security() {
  return (
    <Section id="security" kind="window">
      <div className="ll-secGrid">
        <div>
          <Chapter
            center={false}
            dark
            eyebrow="Security"
            title="Security tiers"
            soft="written in code"
            lead="Passwords, PINs, OTPs, CVV and card numbers are never asked, accepted, stored or returned."
            actions={
              <>
                <a href="#results" className={btnOnDark}>See measured results</a>
                <a href="#how" className={linkDark}>How a call runs<Chevron /></a>
              </>
            }
          />
          <ul className="ll-checks mt-8">
            {GUARANTEES.map((g) => (
              <li key={g}><Icon name="check" size={20} />{g}</li>
            ))}
          </ul>
        </div>
        <ol className="ll-tiers">
          {TIERS.map(([n, name, unlock, allow]) => (
            <li key={n} className="ll-glass ll-tier">
              <span className="ll-tierNum">{n}</span>
              <div>
                <h3>Tier {n} {name}</h3>
                <p>{unlock}</p>
                <p className="ll-tierAllow">{allow}</p>
              </div>
            </li>
          ))}
          <li className="ll-glass ll-tier ll-tierNever">
            <span className="ll-tierNum">3</span>
            <div>
              <h3>Tier 3 Never</h3>
              <span className="ll-neverTag">Cannot be unlocked</span>
              <p className="ll-tierAllow">Passwords, PINs, OTPs, CVV and card numbers are never asked, accepted, stored or returned</p>
            </div>
          </li>
        </ol>
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
    <Section id="languages">
      <Chapter title="11 Indian languages" soft="on one call" lead="Speech recognition and voices are Gnani Prisma and Timbre." />
      <ul className="ll-hairGrid ll-langGrid">
        {LANGS.map(([native, en, lang, beta]) => (
          <li key={en} className="ll-langCell">
            <span lang={lang} className="ll-langNative">{native}</span>
            <span className="ll-langMeta">{en}{beta && <span className="ll-beta">beta</span>}</span>
          </li>
        ))}
        <li className="ll-langCell ll-langNote">Callers can switch language mid-call</li>
      </ul>
    </Section>
  );
}

export function Results() {
  const fig = "ll-figure ll-mono ll-resFigure";
  const text = (t: string) => <div className="ll-cellText"><p className="ll-title">{t}</p></div>;
  return (
    <Section id="results">
      <Chapter title="Measured results" soft="on one machine" />
      <div className="ll-chapterBody">
        <Bento>
          <Cell fill="teal" span={7} className="ll-resCell"><p className={fig}>1,000</p>{text("concurrent simulated calls, 0 errors")}</Cell>
          <Cell fill="stone" span={5} className="ll-resCell"><p className={fig}>33 ms</p>{text("gateway p95 per action (target under 50 ms)")}</Cell>
          <Cell fill="aubergine" span={5} className="ll-resCell"><p className={fig}>94/100</p>{text("scripted calls passed in the four core languages")}</Cell>
          <Cell fill="lavender" span={7} className="ll-resCell"><p className={fig}>139/140</p>{text("scripted calls passed in the seven beta languages")}</Cell>
        </Bento>
        <p className="ll-resNote">Single-machine numbers: load generator, gateway, Postgres and Redis share one box. End-to-end voice latency is not measured at scale.</p>
      </div>
    </Section>
  );
}

export function TwoDoors() {
  return (
    <Section id="signin">
      <Chapter title="Two sign-in doors" soft="one for each side of the desk" />
      <div className="ll-doors">
        <div className="ll-door ll-fill-lavender">
          <span className="ll-doorIcon"><Icon name="phone" size={24} /></span>
          <h3 className="ll-title">Customer</h3>
          <p className="ll-doorDesc">See the official bank SMS sent to you and call the voice desk.</p>
          <Link href="/login" className={`${btnPrimary} ll-doorBtn`}>Customer sign in<Arrow /></Link>
        </div>
        <div className="ll-door ll-fill-stone">
          <span className="ll-doorIcon"><Icon name="landmark" size={24} /></span>
          <h3 className="ll-title">Bank staff</h3>
          <ul className="ll-doorRoles">
            <li><b>Bank manager:</b> bank, ops, collections</li>
            <li><b>Engineer:</b> dev lab, metrics, test cases</li>
            <li><b>Admin:</b> everything</li>
          </ul>
          <Link href="/staff/login" className={`${btnPrimary} ll-doorBtn`}>Staff sign in<Arrow /></Link>
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
    <Section id="about">
      <div className="ll-aboutGrid">
        <Chapter
          center={false}
          title="About LoanLoop"
          lead="LoanLoop is an entry for the Gnani Great Indian AI Internship Challenge. Speech is Gnani: Prisma for recognition, Timbre for voices. All data is synthetic, and Sahyadri Finance Bank is a fictional lender."
        />
        <div>
          {FAQ.map(([q, a]) => (
            <details key={q} className="ll-faq">
              <summary>{q}<Icon name="chevron_down" size={20} /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function CtaBand() {
  return (
    <Section kind="window">
      <div className="ll-cta">
        <h2 className="ll-h2 ll-white max-w-[20ch]">Call the voice desk and get it done</h2>
        <Link href="/login" className={btnOutlineDark}>Customer sign in</Link>
      </div>
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="ll-footer">
      <div className="ll-wrap">
        <div className="ll-footTop">
          <div>
            <Wordmark className="text-white" />
            <p className="ll-footTag">Voice service desk for loan borrowers</p>
            <p className="ll-footNote">Sahyadri Finance Bank is a fictional lender. All data is synthetic.</p>
          </div>
          <div className="ll-footCols">
            <nav aria-label="Product">
              <h2 className="ll-footHead">Product</h2>
              <ul className="mt-2">
                {NAV.filter(([x]) => x !== "#about").map(([x, t]) => <li key={x}><a href={x} className="ll-footLink">{t}</a></li>)}
              </ul>
            </nav>
            <nav aria-label="Sign in">
              <h2 className="ll-footHead">Sign in</h2>
              <ul className="mt-2">
                <li><Link href="/login" className="ll-footLink">Customer sign in</Link></li>
                <li><Link href="/staff/login" className="ll-footLink">Staff sign in</Link></li>
              </ul>
            </nav>
            <nav aria-label="About">
              <h2 className="ll-footHead">About</h2>
              <ul className="mt-2">
                <li><a href="#about" className="ll-footLink">About LoanLoop</a></li>
                <li><a href="#about" className="ll-footLink">FAQ</a></li>
              </ul>
            </nav>
          </div>
        </div>
      </div>
      <span aria-hidden className="ll-footMark">LoanLoop</span>
    </footer>
  );
}
