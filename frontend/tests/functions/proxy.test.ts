/**
 * @jest-environment node
 */
// The Cloudflare Pages Function that sends the website's /api/* calls on to the backend (#32).
import { readFileSync } from "node:fs";
import { CLIENT_IP_HEADER, PROXY_KEY_HEADER, proxy } from "../../functions/api/[[path]]";

const ENV = { API_ORIGIN: "https://api.example.test/", PROXY_SECRET: "s3cret" };

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(async () => new Response('{"ok":true}', { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

function sent(): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

test("forwards the path and query to the backend", async () => {
  await proxy(new Request("https://altheo.pages.dev/api/chat/3/messages?after=17"), ENV);
  expect(sent().url).toBe("https://api.example.test/api/chat/3/messages?after=17");
  expect(sent().init.method).toBe("GET");
  expect(sent().init.body).toBeUndefined();
});

test("sends the body, cookie and CSRF header of a POST", async () => {
  await proxy(
    new Request("https://altheo.pages.dev/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "altheo", Cookie: "altheo_session=abc" },
      body: '{"email":"a@b.c"}',
    }),
    ENV,
  );
  const { init, headers } = sent();
  expect(init.method).toBe("POST");
  expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"email":"a@b.c"}');
  expect(headers.get("X-Requested-With")).toBe("altheo");
  expect(headers.get("Cookie")).toBe("altheo_session=abc");
  expect(init.redirect).toBe("manual");
});

test("tells the backend who the visitor is, with the secret", async () => {
  await proxy(new Request("https://altheo.pages.dev/api/contact", { headers: { "CF-Connecting-IP": "41.66.200.7" } }), ENV);
  expect(sent().headers.get(CLIENT_IP_HEADER)).toBe("41.66.200.7");
  expect(sent().headers.get(PROXY_KEY_HEADER)).toBe("s3cret");
});

test("a visitor can't claim an address or send a key of their own", async () => {
  await proxy(
    new Request("https://altheo.pages.dev/api/contact", {
      headers: { [CLIENT_IP_HEADER]: "1.2.3.4", [PROXY_KEY_HEADER]: "guess", "CF-Connecting-IP": "41.66.200.7" },
    }),
    { API_ORIGIN: ENV.API_ORIGIN },
  );
  // Without a secret set, neither header goes through.
  expect(sent().headers.get(CLIENT_IP_HEADER)).toBeNull();
  expect(sent().headers.get(PROXY_KEY_HEADER)).toBeNull();
});

test("passes the backend's answer back as it is, cookie and redirects included", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(null, {
      status: 303,
      headers: { Location: "https://accounts.google.com/o/oauth2", "Set-Cookie": "altheo_oauth=x; Path=/api/auth/google" },
    }),
  );
  const response = await proxy(new Request("https://altheo.pages.dev/api/auth/google/start"), ENV);
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toBe("https://accounts.google.com/o/oauth2");
  expect(response.headers.get("Set-Cookie")).toContain("altheo_oauth=x");
});

test("says so when the backend isn't set or can't be reached", async () => {
  const unset = await proxy(new Request("https://altheo.pages.dev/api/health"), {});
  expect(unset.status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();

  fetchMock.mockRejectedValueOnce(new TypeError("network down"));
  const down = await proxy(new Request("https://altheo.pages.dev/api/health"), ENV);
  expect(down.status).toBe(502);
  expect((await down.json()).detail).toMatch(/can't be reached/);
});

test("built files are cached for a year and every page refuses framing", () => {
  const headers = readFileSync(`${__dirname}/../../public/_headers`, "utf8");
  expect(headers).toMatch(/\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  expect(headers).toMatch(/\/\*\n(\s+.+\n)*\s+X-Frame-Options: DENY/);
});
