import Link from "next/link";
import { Icon, Pill, Wordmark } from "@/components/ui";
import s from "./landing.module.css";
import { NAV, SignInLinks, primaryBtn, secondaryBtn } from "./shared";

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <a href="#main" className="sr-only rounded-lg bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:absolute focus:left-4 focus:top-2">Skip to content</a>
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex items-center gap-8">
          <a href="#home" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"><Wordmark /></a>
          <ul className="hidden items-center gap-1 lg:flex">
            {NAV.map(([h, l]) => (
              <li key={h}><a href={h} className="inline-flex h-11 items-center rounded-lg px-3 text-base text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-primary">{l}</a></li>
            ))}
          </ul>
        </div>
        <SignInLinks />
      </nav>
    </header>
  );
}

const d = (i: number) => ({ animationDelay: `${i * 50}ms` });

function CallMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg"><Icon name="phone_in_talk" size={16} className="text-primary" />Voice desk call</span>
        <span className="font-mono text-xs text-muted">02:14</span>
      </div>
      <div className="space-y-3 p-4 text-base">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-surface-container-high px-4 py-3 text-fg">
          <p className="mb-1 font-mono text-xs text-muted">Caller</p>
          <p>Maine is mahine ki EMI already pay kar di hai.</p>
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-accent-soft px-4 py-3 text-fg">
          <p className="mb-1 font-mono text-xs text-muted">Agent</p>
          <p>Thank you, Priya. I can see a payment of ₹12,450 received on 5 Nov against your loan ending 4417. I have raised a reconciliation ticket and paused reminders.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Pill tone="ok" icon="verified">Tier 1 verified</Pill>
          <Pill>Hinglish</Pill>
        </div>
        <p className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted"><Icon name="inbox" size={14} />SMS sent to registered mobile ••••4417</p>
      </div>
      <div className="flex items-center gap-4 border-t border-line bg-sunken px-4 py-3">
        <span className="relative inline-flex size-11 shrink-0 items-center justify-center">
          <span aria-hidden className={`${s.ring} absolute inset-0 rounded-full bg-primary`} />
          <span className="relative inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-fg"><Icon name="mic" size={18} /></span>
        </span>
        <span className="text-sm text-muted">Hold to talk</span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="home" className="bg-sunken">
      <div className="mx-auto grid min-h-[min(900px,calc(100dvh-4rem))] max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-2">
        <div>
          <p className={`${s.rise} font-mono text-sm text-muted`} style={d(0)}>Demo · synthetic data</p>
          <h1 className={`${s.rise} serif mt-4 text-5xl text-fg lg:text-6xl`} style={d(1)}>Voice service desk for loan borrowers</h1>
          <p className={`${s.rise} mt-6 max-w-[52ch] text-lg text-muted`} style={d(2)}>
            Borrowers call, speak in any of 11 Indian languages, and finish the request on the same call. The agent never takes a password, PIN or OTP.
          </p>
          <div className={`${s.rise} mt-8 flex flex-wrap gap-3`} style={d(3)}>
            <Link href="/login" className={primaryBtn}>Customer sign in</Link>
            <Link href="/staff/login" className={secondaryBtn}>Staff sign in</Link>
          </div>
        </div>
        <div className={s.rise} style={d(4)}><CallMock /></div>
      </div>
    </section>
  );
}
