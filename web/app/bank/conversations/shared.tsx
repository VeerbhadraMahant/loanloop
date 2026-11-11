import { StatusBadge, type Tone } from "@/components/bank/status-badge";

const OUTCOME: Record<string, [Tone, string]> = {
  completed: ["ok", "Completed"], handover: ["warn", "Handed over"], blocked: ["danger", "Blocked"], caller_hung_up: ["neutral", "Caller hung up"],
};
export const outcomeLabel = (o: string | null) => (o ? OUTCOME[o]?.[1] ?? o.replace(/_/g, " ") : "In progress");
export const LANG: Record<string, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish", mr: "Marathi" };
export const langLabel = (l: string) => LANG[l] ?? l;

export function OutcomeBadge({ outcome }: { outcome: string | null }) {
  return <StatusBadge tone={outcome ? OUTCOME[outcome]?.[0] ?? "info" : "info"}>{outcomeLabel(outcome)}</StatusBadge>;
}
export const customerName = (ref: string | null | undefined) => ref ?? "Unidentified caller";
/** Gateway timestamps may lack a zone suffix; treat those as UTC. */
export const ms = (iso: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
export const istDay = (iso: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(typeof iso === "number" ? iso : ms(iso));
