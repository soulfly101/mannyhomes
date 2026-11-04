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
