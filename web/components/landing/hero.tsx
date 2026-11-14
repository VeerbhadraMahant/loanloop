import Link from "next/link";
import { Icon } from "@/components/ui";
import { Arrow, Chevron } from "./shared";

const d = (i: number) => ({ animationDelay: `${300 + i * 100}ms` });

export function Hero() {
  return (
    <section id="home" className="ll-window ll-onDark ll-hero scroll-mt-20">
      <div className="ll-wrap">
        <div className="ll-heroText">
          <h1 className="ll-display ll-white">
            Voice service desk
            <br />
            for loan borrowers
          </h1>
          <p className="ll-heroSub ll-white80">
            Borrowers call, speak in any of 11 Indian languages, and finish the request on the same call. The agent never takes a password, PIN or OTP.
          </p>
          <div className="ll-heroActions">
            <Link href="/login" className="ll-heroBtn">
              <span>Customer sign in</span>
              <span aria-hidden className="ll-heroChip"><Arrow /></span>
            </Link>
            <Link href="/staff/login" className="ll-link ll-linkDark">Staff sign in<Chevron /></Link>
          </div>
        </div>

        <div className="ll-heroStage">
          <div aria-hidden className="ll-orb">
            <span className="ll-orbRing" />
            <span className="ll-orbRing" style={{ animationDelay: "1.3s" }} />
            <span className="ll-orbRing" style={{ animationDelay: "2.6s" }} />
            <span className="ll-orbBtn"><Icon name="mic" size={40} /></span>
          </div>
          <p aria-hidden className="ll-orbLabel ll-white80">Hold to talk</p>

          <div className="ll-frag ll-glass ll-fragTier" style={d(1)}>
            <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="verified" size={16} />Tier 1 verified</span>
            <span className="ll-chipLilac">Hinglish</span>
          </div>

          <div className="ll-frag ll-glass ll-fragCall" style={d(0)}>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><Icon name="phone_in_talk" size={16} />Voice desk call</span>
              <span className="ll-mono text-xs">02:14</span>
            </div>
            <div className="space-y-3 px-4 pb-4 text-[15px]">
              <div className="ll-bubble ml-auto max-w-[88%] rounded-2xl rounded-br-md px-4 py-3">
                <p className="ll-mono mb-1 text-xs ll-white65">Caller</p>
                <p>Maine is mahine ki EMI already pay kar di hai.</p>
              </div>
              <div className="ll-bubble ll-bubbleAgent max-w-[94%] rounded-2xl rounded-bl-md px-4 py-3">
                <p className="ll-mono mb-1 text-xs ll-white65">Agent</p>
                <p>Thank you. I can see a payment of ₹12,450 received on 5 Nov against your loan ending 2046. I have raised a reconciliation ticket and paused reminders.</p>
              </div>
            </div>
          </div>

          <div className="ll-frag ll-glass ll-fragSms" style={d(2)}>
            <p className="flex items-center gap-2 text-xs font-semibold ll-white80"><Icon name="inbox" size={14} />SMS · Sahyadri Finance Bank</p>
            <p className="mt-2 text-[15px]">Your account details were requested on a call. Full details: sent to your registered mobile ••••7310.</p>
          </div>

          <div className="ll-frag ll-glass ll-fragLang" style={d(3)}>
            <Icon name="sync" size={16} />
            <span className="text-sm font-medium">Hinglish to मराठी</span>
          </div>

          <div className="ll-frag ll-glass ll-fragReq" style={d(4)}>
            <Icon name="check" size={16} />
            <span className="text-sm font-medium">Request raised: EMI date change</span>
          </div>
        </div>
      </div>
    </section>
  );
}
