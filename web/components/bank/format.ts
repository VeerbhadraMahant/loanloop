const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-IN");

/** 1234567 -> "₹12,34,567" */
export const inr = (n: number | null | undefined) => (n == null ? "–" : inrFmt.format(n));
/** 1234567 -> "12,34,567" */
export const num = (n: number | null | undefined) => (n == null ? "–" : numFmt.format(n));
/** Compact rupees for KPI tiles: ₹4.5 L, ₹1.2 Cr, else full. */
export function inrCompact(n: number | null | undefined) {
  if (n == null) return "–";
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${+(n / 1e5).toFixed(2)} L`;
  return inrFmt.format(n);
}

// Gateway timestamps may lack a zone suffix; treat those as UTC.
const toDate = (iso: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
const ist = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...o });

/** "12 Nov, 4:05 pm" in IST */
export function istTime(iso: string | null | undefined) {
  if (!iso) return "–";
  return ist({ day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(toDate(iso));
}

/** "15 Nov" for date-only values such as a promised date: the calendar date as stored, never shifted by timezone. */
export function istDate(iso: string | null | undefined) {
  const m = iso?.match(/^(\d{4})-(\d\d)-(\d\d)/);
  if (!m) return iso ? istTime(iso) : "–";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" }).format(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** "just now", "5 min ago", "3 h ago"; older than a day falls back to the IST date and time. */
export function relTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "–";
  const s = Math.max(0, Math.round((now - toDate(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return istTime(iso);
}
