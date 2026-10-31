/** Only allow redirects to a path on our own site (same rule as the backend). */
export function safeNext(value: string | null | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  return "/";
}
