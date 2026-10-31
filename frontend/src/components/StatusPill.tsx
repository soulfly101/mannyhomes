export type Tone = "ok" | "warn" | "danger" | "neutral";

/** Every status word in the app and the one tone it always uses (DESIGN.md → Status pills). */
export const STATUS_TONE: Record<string, Tone> = {
  paid: "ok",
  available: "ok",
  resolved: "ok",
  active: "ok",
  approved: "ok",
  partial: "warn",
  pending: "warn",
  "awaiting allocation": "warn",
  "in progress": "warn",
  booked: "warn",
  "due soon": "warn",
  unpaid: "danger",
  overdue: "danger",
  "fully booked": "danger",
  rejected: "danger",
  failed: "danger",
  closed: "neutral",
  draft: "neutral",
  inactive: "neutral",
  info: "neutral",
};

export const toneFor = (status: string): Tone => STATUS_TONE[status.trim().toLowerCase()] ?? "neutral";

/** Status label. The text is always shown; colour is never the only signal. */
export function StatusPill({ status, tone, label }: { status: string; tone?: Tone; label?: string }) {
  return <span className={`pill pill-${tone ?? toneFor(status)}`}>{label ?? status}</span>;
}
