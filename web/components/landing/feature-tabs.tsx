"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "@/components/ui";

const FEATURES: { id: string; icon: IconName; title: string; items: [string, string, IconName][] }[] = [
  { id: "secure", icon: "lock", title: "Secure details", items: [
    ["Branch IFSC lookup", "Public branch details, no sign in needed.", "landmark"],
    ["Masked account, customer ID, mobile and email", "The agent only ever speaks the masked form.", "eye"],
    ["Full details by SMS to the registered mobile", "Never read aloud. Sent only to the number on file.", "inbox"],
    ["Password-reset guidance", "Steps for the app or net banking. The secret is never handled.", "lock"],
  ] },
  { id: "loans", icon: "wallet", title: "Loan servicing", items: [
    ["EMI amount and due date", "Read from the loan record after the caller is verified.", "wallet"],
    ["“I already paid” check with a reconciliation ticket", "Date, amount and UTR are read back, matched to the ledger, and reminders pause.", "check"],
    ["EMI date change", "Eligibility is checked, then the request is raised after a read-back.", "clock"],
    ["Foreclosure quote and closure request", "Outstanding amount and charges today, then a closure request.", "list_checks"],
    ["Statements and interest certificates", "Raised as a request and delivered to the registered channel.", "copy"],
  ] },
  { id: "calls", icon: "sync", title: "One call, many requests", items: [
    ["Several requests without re-verifying", "Verify once, then work through every request on the same call.", "verified"],
    ["Mid-call language switching", "English, Hindi, Hinglish or Marathi, whenever the caller changes.", "mic"],
    ["Warm handover with a structured case record when unsure", "A person gets the summary, what is done and what is pending.", "support_agent"],
  ] },
];

const tiles = [
  "linear-gradient(135deg, var(--ll-lavender), var(--ll-lilac))",
  "linear-gradient(135deg, var(--ll-lilac), #f0d9f5)",
  "linear-gradient(135deg, #dcd2ff, var(--ll-lavender))",
];

export function FeatureTabs() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent) {
    const n = FEATURES.length;
    let i = active;
    if (e.key === "ArrowRight") i = (active + 1) % n;
    else if (e.key === "ArrowLeft") i = (active + n - 1) % n;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = n - 1;
    else return;
    e.preventDefault();
    setActive(i);
    refs.current[i]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Request groups" className="ll-tabs" onKeyDown={onKey}>
        {FEATURES.map((f, i) => (
          <button
            key={f.id}
            ref={(el) => { refs.current[i] = el; }}
            id={`tab-${f.id}`}
            role="tab"
            type="button"
            aria-selected={active === i}
            aria-controls={`panel-${f.id}`}
            tabIndex={active === i ? 0 : -1}
            className="ll-tab"
            onClick={() => setActive(i)}
          >
            <Icon name={f.icon} size={20} />
            <span>{f.title}</span>
          </button>
        ))}
      </div>
      {FEATURES.map((f, i) => (
        <div key={f.id} id={`panel-${f.id}`} role="tabpanel" aria-labelledby={`tab-${f.id}`} hidden={active !== i} className="ll-tabPanel">
          <ul className="ll-featGrid">
            {f.items.map(([t, s, ic], k) => (
              <li key={t} className="ll-card ll-featCard">
                <span aria-hidden className="ll-tile" style={{ background: tiles[(i + k) % tiles.length] }}>
                  <Icon name={ic} size={26} />
                </span>
                <h3 className="ll-title mt-6">{t}</h3>
                <p className="ll-muted mt-2 text-base">{s}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
