/** Whole Ghana cedis shown the house way: "GH₵ 1,200". */
export const formatCedis = (amount: number) => `GH₵ ${Math.round(amount).toLocaleString("en-GH")}`;

/** "31 Oct 2026", in Accra time (DESIGN.md → Type). */
export const formatDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : `${iso}Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });
