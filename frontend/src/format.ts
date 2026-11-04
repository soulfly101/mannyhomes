/** Whole Ghana cedis shown the house way: "GH₵ 1,200". */
export const formatCedis = (amount: number) => `GH₵ ${Math.round(amount).toLocaleString("en-GH")}`;

/** "31 Oct 2026", in Accra time (DESIGN.md → Type). */
export const formatDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : `${iso}Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });

/** "Ama Mensah" -> "AM": the first letters of the first and last names, for showing someone compactly. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** "3 hours ago", from a UTC time as the API sends it. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(`${iso}Z`).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (seconds < 3600) return unit(Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return unit(Math.floor(seconds / 3600), "hour");
  if (seconds < 86400 * 30) return unit(Math.floor(seconds / 86400), "day");
  return formatDate(iso);
}

/** "Nov" or "Nov 2026" from "2026-11". */
export const formatMonth = (month: string, withYear = false) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
