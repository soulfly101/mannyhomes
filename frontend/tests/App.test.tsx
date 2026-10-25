import { render, screen, within } from "@testing-library/react";
import { App } from "../src/App";

// jsdom has no fetch, so each test installs its own fake.
const fetchMock = jest.fn<Promise<Partial<Response>>, [RequestInfo | URL]>();
const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

test("shows API and database as OK when both health checks pass", async () => {
  fetchMock.mockImplementation((input) =>
    String(input).endsWith("/db") ? json({ database: "ok" }) : json({ status: "ok" }),
  );
  render(<App />);

  const list = screen.getByRole("list", { name: "System status" });
  expect(await within(list).findAllByText("OK")).toHaveLength(2);
  expect(fetchMock).toHaveBeenCalledWith("/api/health");
  expect(fetchMock).toHaveBeenCalledWith("/api/health/db");
});

test("shows the database as not reachable when its check fails", async () => {
  fetchMock.mockImplementation((input) =>
    String(input).endsWith("/db") ? json({ database: "unavailable" }, 503) : json({ status: "ok" }),
  );
  render(<App />);

  const dbRow = (await screen.findByText("Not reachable")).closest("li")!;
  expect(dbRow).toHaveTextContent("Database");
  expect(await screen.findByText("OK")).toBeInTheDocument();
});

test("shows both as not reachable when the API is down", async () => {
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  render(<App />);

  expect(await screen.findAllByText("Not reachable")).toHaveLength(2);
});
