import { Icon } from "@/components/ui";
import { Bento, Cell, Chapter, Chevron, Section, TwoTone, link } from "./shared";
import { FeatureTabs } from "./feature-tabs";

export function Facts() {
  const cells = [
    ["11", "Indian languages"],
    ["23", "gateway actions"],
    ["4", "security tiers"],
    ["SMS only", "full details go to the registered mobile"],
    ["Tier 3", "OTP, PIN and password never asked"],
    ["Gnani", "Prisma speech-to-text and Timbre voices"],
  ];
  return (
    <section aria-label="In numbers" className="ll-section ll-facts">
      <div className="ll-wrap">
        <p className="ll-eyebrow ll-muted mb-6">In numbers</p>
        <ul className="ll-hairGrid ll-factsGrid">
          {cells.map(([f, l]) => (
            <li key={f} className="ll-factCell">
              <p className="ll-figure ll-factFig">{f}</p>
              <p className="ll-muted mt-2 text-sm">{l}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Problem() {
  return (
    <Section id="problem">
      <Chapter
        eyebrow="The problem"
        title="The call-back problem"
        soft="for lenders"
        lead="Lenders automate outbound calls, but borrower call-backs are still handled by people. Borrowers wait on hold, repeat themselves, and have no safe way to get help."
      />
      <div className="ll-chapterBody">
        <Bento>
          <Cell fill="teal" span={12} className="ll-problemMain">
            <div className="ll-problemText">
              <p className="ll-eyebrow">RBI Ombudsman</p>
              <h3 className="ll-title">Complaints keep rising while call-backs wait in a queue.</h3>
            </div>
            <div className="ll-problemStat">
              <p className="ll-figure ll-bigFig">13.34 lakh</p>
              <p className="ll-statLabel">complaints to the RBI Ombudsman in FY 2024-25</p>
            </div>
          </Cell>
          <Cell fill="wine" span={6} className="ll-statCell">
            <p className="ll-figure ll-bigFig">29.25%</p>
            <p className="ll-statLabel">of them about loans and advances</p>
          </Cell>
          <Cell fill="stone" span={6} className="ll-statCell">
            <p className="ll-figure ll-bigFig">70%+</p>
            <p className="ll-statLabel">of calls to RBI&apos;s contact centre are in Hindi</p>
          </Cell>
        </Bento>
        <p className="ll-muted mt-6 text-center text-sm">Source: RBI Ombudsman annual report, FY 2024-25.</p>
      </div>
    </Section>
  );
}

export function Features() {
  return (
    <Section id="features">
      <Chapter
        eyebrow="Features"
        title="Requests the voice desk"
        soft="completes"
        actions={<a href="#how" className={link}>See how a call runs<Chevron /></a>}
      />
      <div className="ll-chapterBody">
        <FeatureTabs />
      </div>
    </Section>
  );
}

export function Statement() {
  return (
    <Section kind="band">
      <div className="ll-statement">
        <p className="ll-quote">
          Every spoken figure comes from the <b>bank database</b>, so the language model <b>cannot invent</b> a number.
        </p>
        <p className="ll-muted mt-6 text-base">Design rule of the gateway</p>
        <a href="#security" className={`${link} mt-2`}>See the security tiers<Chevron /></a>
      </div>
    </Section>
  );
}

const STEPS: [string, string][] = [
  ["Speak", "The caller holds to talk. Gnani Prisma turns speech into text."],
  ["Verify", "Registered mobile plus date of birth or loan last four digits."],
  ["Act", "The agent calls one of 23 gateway actions. The gateway checks the tier, masks values and writes the audit log."],
  ["Confirm", "Gnani Timbre speaks the reply. Sensitive details go by SMS to the registered phone, never read aloud."],
];

function Chip({ title, note, strong, icon }: { title: string; note?: string; strong?: boolean; icon?: "mic" | "inbox" }) {
  return (
    <div className={`ll-pipeChip ${strong ? "ll-pipeStrong" : ""}`}>
      {icon && <Icon name={icon} size={16} />}
      <span className="font-semibold">{title}</span>
      {note && <span className="ll-pipeNote">{note}</span>}
    </div>
  );
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <li className="ll-step">
      <span className="ll-mono ll-stepNum">{String(n).padStart(2, "0")}</span>
      <div>
        <h4 className="ll-title">{t}</h4>
        <p className="ll-stepText">{d}</p>
      </div>
    </li>
  );
}

export function How() {
  return (
    <Section id="how">
      <Chapter eyebrow="How it works" title="How a call" soft="runs" />
      <div className="ll-chapterBody">
        <Bento>
          <Cell fill="violet" span={7} tall className="ll-howMain">
            <div role="group" aria-label="Call pipeline" className="ll-pipe">
              <Chip title="Caller speech" icon="mic" />
              <span aria-hidden className="ll-pipeLine" />
              <Chip title="Gnani Prisma" note="speech to text" />
              <span aria-hidden className="ll-pipeLine" />
              <Chip title="Language model" />
              <span aria-hidden className="ll-pipeLine" />
              <Chip title="Bank gateway" note="tier check, masking, audit log" strong />
              <span aria-hidden className="ll-pipeLine" />
              <div className="ll-pipeSplit">
                <Chip title="Gnani Timbre" note="voice" />
                <Chip title="SMS to registered mobile" note="side branch" icon="inbox" />
              </div>
            </div>
            <div className="ll-cellText">
              <p className="ll-eyebrow">Pipeline</p>
              <h3 className="ll-title"><TwoTone lead="Every action passes the gateway." soft="Nothing reaches the model unmasked." /></h3>
            </div>
          </Cell>
          <>
            <Cell fill="aubergine" span={5}>
              <ol className="ll-cellText ll-stepList">
                <Step n={1} t={STEPS[0][0]} d={STEPS[0][1]} />
                <Step n={2} t={STEPS[1][0]} d={STEPS[1][1]} />
              </ol>
            </Cell>
            <Cell fill="stone" span={5}>
              <ol className="ll-cellText ll-stepList" start={3}>
                <Step n={3} t={STEPS[2][0]} d={STEPS[2][1]} />
                <Step n={4} t={STEPS[3][0]} d={STEPS[3][1]} />
              </ol>
            </Cell>
          </>
        </Bento>
      </div>
    </Section>
  );
}
