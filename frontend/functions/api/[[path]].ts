/**
 * Cloudflare Pages Function (#32): the website's /api/* requests go on to the backend on the Oracle server.
 *
 * The app already calls `/api/...` on its own address, so through this function the login cookie belongs
 * to the website itself. Calling the API's address directly would make it a cross-site cookie, which
 * Safari (every iPhone) and private windows refuse, so people couldn't stay logged in.
 *
 * Settings, in Cloudflare (Settings → Variables and secrets):
 *   API_ORIGIN    the backend, e.g. https://89-168-66-187.sslip.io
 *   PROXY_SECRET  the same value as PROXY_SECRET in the server's deploy/.env. With it, the backend uses the
 *                 visitor's address (sent below) instead of Cloudflare's for login limits and signatures.
 *
 * Payment webhooks don't come through here; providers call the API's address directly.
 */

export interface Env {
  API_ORIGIN?: string;
  PROXY_SECRET?: string;
}

export const CLIENT_IP_HEADER = "X-Altheo-Client-IP";
export const PROXY_KEY_HEADER = "X-Altheo-Proxy-Key";

const NO_BODY = new Set(["GET", "HEAD"]);

function problem(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function proxy(request: Request, env: Env): Promise<Response> {
  const origin = env.API_ORIGIN?.trim().replace(/\/+$/, "");
  if (!origin) return problem(503, "The website isn't connected to the server yet.");

  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  // A visitor can't claim an address: only this function sets these, and only with the secret.
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(PROXY_KEY_HEADER);
  headers.delete("Host");
  const visitor = request.headers.get("CF-Connecting-IP");
  if (env.PROXY_SECRET && visitor) {
    headers.set(CLIENT_IP_HEADER, visitor);
    headers.set(PROXY_KEY_HEADER, env.PROXY_SECRET);
  }

  let response: Response;
  try {
    response = await fetch(`${origin}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: NO_BODY.has(request.method) ? undefined : await request.arrayBuffer(),
      // Google sign-in answers with redirects; the browser must follow them, not this function.
      redirect: "manual",
    });
  } catch {
    return problem(502, "The server can't be reached right now. Try again in a minute.");
  }
  // Passed back as it is: status, body and headers, including the login cookie.
  return new Response(response.body, response);
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) => proxy(request, env);
