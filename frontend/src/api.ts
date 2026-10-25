export type Status = "checking" | "ok" | "error";

/** Calls a health endpoint and reports whether it answered with the expected field set to "ok". */
export async function checkHealth(path: string, field: string): Promise<Status> {
  try {
    const res = await fetch(path);
    if (!res.ok) return "error";
    const body = (await res.json()) as Record<string, unknown>;
    return body[field] === "ok" ? "ok" : "error";
  } catch {
    return "error";
  }
}
