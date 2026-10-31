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

/** An API error with the server's message and, for forms, a message per field. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: Record<string, string> = {},
  ) {
    super(message);
  }
}

const NETWORK_ERROR = "We couldn't reach Altheo Homes. Check your connection and try again.";

/** JSON request to our API with the session cookie and the header the backend requires on changes. */
export async function apiFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = "GET", body } = options;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "altheo",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown; errors?: Record<string, string> };
  if (!res.ok) {
    const message = typeof data.detail === "string" ? data.detail : "Something went wrong. Try again.";
    throw new ApiError(message, res.status, data.errors ?? {});
  }
  return data as T;
}
