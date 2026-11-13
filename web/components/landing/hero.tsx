import Link from "next/link";
import { Icon } from "@/components/ui";
import { Arrow, NAV, Panel, Wordmark, btnPrimary, btnSecondary, wrap } from "./shared";

export function TopNav() {
  return (
    <header className={`${wrap} sticky top-3 z-20 mt-3`}>
      <a href="#main" className="ll-bgWine ll-white sr-only rounded-lg px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-2">Skip to content</a>
      <nav aria-label="Main" className="ll-header flex h-16 items-center justify-between gap-4 px-4 sm:px-5">
        <a href="#home" className="ll-ink inline-flex h-11 items-center"><Wordmark /></a>
        <ul className="hidden items-center gap-1 lg:flex">
          {NAV.map(([h, l]) => (
            <li key={h}><a href={h} className="ll-navLink inline-flex h-11 items-center px-3">{l}</a></li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link href="/staff/login" className="ll-navLink hidden h-11 items-center px-3 sm:inline-flex">Staff sign in</Link>
          <Link href="/login" className={`${btnSecondary} !px-4`}>Customer sign in</Link>
        </div>
      </nav>
    </header>
  );
}

const d = (i: number) => ({ animationDelay: `${i * 50}ms` });

function Cards() {
  return (
    <div className="flex flex-col gap-4">
      <div className="ll-glass ll-ink flex items-center gap-2 self-end px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="verified" size={16} />Tier 1 verified</span>
        <span className="ll-bgLilac rounded-lg px-2 py-0.5 text-xs font-semibold">Hinglish</span>
      </div>
      <div className="ll-glass ll-ink overflow-hidden lg:ml-4">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="phone_in_talk" size={16} />Voice desk call</span>
          <span className="ll-mono text-xs">02:14</span>
        </div>
        <div className="space-y-3 px-4 pb-4 text-[15px]">
          <div className="ll-bgCard ml-auto max-w-[88%] rounded-2xl rounded-br-md px-4 py-3">
            <p className="ll-mono mb-1 text-xs ll-stone">Caller</p>
            <p>Maine is mahine ki EMI already pay kar di hai.</p>
          </div>
          <div className="ll-tint max-w-[94%] rounded-2xl rounded-bl-md px-4 py-3">
            <p className="ll-mono mb-1 text-xs ll-stone">Agent</p>
            <p>Thank you. I can see a payment of ₹12,450 received on 5 Nov against your loan ending 2046. I have raised a reconciliation ticket and paused reminders.</p>
          </div>
        </div>
      </div>
      <div className="ll-glass ll-ink p-4 sm:w-[88%] lg:w-[86%]">
        <p className="flex items-center gap-2 text-xs font-semibold ll-stone"><Icon name="inbox" size={14} />SMS · Sahyadri Finance Bank</p>
        <p className="mt-2 text-[15px]">Your account details were requested on a call. Full details: sent to your registered mobile ••••7310.</p>
      </div>
      <div className="ll-glass ll-ink flex items-center gap-4 self-end px-4 py-3 sm:w-[62%]">
        <span className="relative inline-flex size-11 shrink-0 items-center justify-center">
          <span aria-hidden className="ll-ring ll-bgWine absolute inset-0 rounded-full" />
          <span className="ll-bgWine ll-white relative inline-flex size-11 items-center justify-center rounded-full"><Icon name="mic" size={18} /></span>
        </span>
        <span className="text-sm font-medium">Hold to talk</span>
      </div>
    </div>
  );
}

function Facts() {
  const cells = [
    ["11", "Indian languages"],
    ["23", "gateway actions"],
    ["4", "security tiers"],
    ["33 ms", "gateway p95 per action"],
    ["Tier 3", "OTP, PIN and password never asked"],
    ["Gnani", "Prisma speech-to-text and Timbre voices"],
  ];
  return (
    <ul aria-label="Key facts" className="ll-rise mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" style={d(5)}>
      {cells.map(([f, l]) => (
        <li key={f} className="ll-glass px-3 py-5 sm:px-4">
          <p className="ll-mono ll-ink break-words text-2xl font-medium leading-none sm:text-[28px]">{f}</p>
          <p className="ll-stone mt-2 text-sm">{l}</p>
        </li>
      ))}
    </ul>
  );
}

export function Hero() {
  return (
    <Panel id="home" tone="dawn" pad="py-12 lg:py-16">
      <div className="grid gap-10 lg:min-h-[560px] lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-8">
        <div>
          <h1 className="ll-rise ll-display ll-ink" style={d(1)}>Voice service desk for loan borrowers</h1>
          <p className="ll-rise ll-ink mt-6 max-w-[48ch] text-lg sm:text-xl" style={d(2)}>
            Borrowers call, speak in any of 11 Indian languages, and finish the request on the same call. The agent never takes a password, PIN or OTP.
          </p>
          <div className="ll-rise mt-8 flex flex-wrap gap-3" style={d(3)}>
            <Link href="/login" className={btnPrimary}>Customer sign in<Arrow /></Link>
            <Link href="/staff/login" className={`${btnSecondary} !h-12`}>Staff sign in</Link>
          </div>
        </div>
        <div className="ll-rise" style={d(4)}><Cards /></div>
      </div>
      <Facts />
    </Panel>
  );
}
