import type { GwEvent } from "@/lib/api";
import type { Tone } from "./status-badge";

export const human = (s: string) => { const t = s.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };

const REASONS: Record<string, { label: string; tone: Tone }> = {
  hardship: { label: "Financial hardship", tone: "warn" },
  brute_force: { label: "Failed verification", tone: "danger" },
  unclear: { label: "Request unclear", tone: "info" },
  out_of_scope: { label: "Outside agent scope", tone: "info" },
  caller_request: { label: "Customer asked for a person", tone: "neutral" },
  caller_asked_for_a_human: { label: "Customer asked for a person", tone: "neutral" },
  faq_not_found: { label: "Question not in FAQ", tone: "info" },
  dispute: { label: "Dispute", tone: "danger" },
  other: { label: "Other", tone: "neutral" },
};
// Gateway reasons are free text (e.g. "FAQ NOT FOUND"); fold case and spaces so equal reasons group together.
export const keyOf = (r: string) => r.trim().toLowerCase().replace(/[\s-]+/g, "_");
export const reasonOf = (r: string) => REASONS[keyOf(r)] ?? { label: human(keyOf(r)), tone: "neutral" as Tone };

const CODE: Record<string, string> = {
  SECRET_DETECTED: "Caller said a secret; it was discarded and not stored",
  TIER_TOO_LOW: "Asked for data above verification level",
  NOT_VERIFIED: "Asked for data before identity was verified",
  RATE_LIMITED: "Too many attempts; call routed to a person",
};
/** Plain-language description of a security/approval event. */
export const what = (e: GwEvent) =>
  e.type === "approval" ? (e.detail ? human(e.detail) : "Approval not completed")
  : e.error_code ? CODE[e.error_code] ?? human(e.error_code)
  : e.action === "report_secret_spoken" ? "Caller said a secret; it was not stored" : "Blocked";
