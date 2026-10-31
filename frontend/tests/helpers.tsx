import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { AuthProvider, type User } from "../src/auth/AuthContext";

export const AMA: User = {
  id: "u1",
  name: "Ama Mensah",
  email: "ama@example.com",
  phone: "+233241234567",
  role: "tenant",
  needs_onboarding: false,
};

type Reply = { status?: number; body?: unknown };
type Handler = (body: unknown) => Reply;

/** Fakes our API. Keys are "METHOD /path"; unknown calls fail the test loudly. */
export function mockApi(routes: Record<string, Reply | Handler>) {
  const calls: { key: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const route = routes[key];
    if (!route) throw new Error(`Unexpected API call: ${key}`);
    const reply = typeof route === "function" ? route(body) : route;
    const status = reply.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => reply.body ?? {},
    } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, calls };
}

/** Where the router ended up, so tests can check redirects. */
export function Location() {
  const l = useLocation();
  return <p data-testid="location">{l.pathname + l.search}</p>;
}

export function renderAt(path: string, routes: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>{routes}</Routes>
        <Location />
      </AuthProvider>
    </MemoryRouter>,
  );
}

export const loggedOut = { "GET /api/auth/me": { status: 401, body: { detail: "Log in to continue." } } };
export const googleOff = { "GET /api/auth/config": { body: { google: false } } };
export const googleOn = { "GET /api/auth/config": { body: { google: true } } };
