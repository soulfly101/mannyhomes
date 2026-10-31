import { screen, within } from "@testing-library/react";
import { Route } from "react-router";
import { HomePage } from "../../src/pages/HomePage";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";

const routes = <Route path="/" element={<HomePage />} />;

test("greets logged-in people and shows API and database status", async () => {
  mockApi({
    "GET /api/auth/me": { body: AMA },
    ...googleOff,
    "GET /api/health": { body: { status: "ok" } },
    "GET /api/health/db": { body: { database: "ok" } },
  });
  renderAt("/", routes);
  expect(await screen.findByRole("heading", { name: "Hi, Ama" })).toBeInTheDocument();
  const list = screen.getByRole("list", { name: "System status" });
  expect(await within(list).findAllByText("OK")).toHaveLength(2);
});

test("shows the database as not reachable when its check fails", async () => {
  mockApi({
    "GET /api/auth/me": { status: 401 },
    ...googleOff,
    "GET /api/health": { body: { status: "ok" } },
    "GET /api/health/db": { status: 503, body: { database: "unavailable" } },
  });
  renderAt("/", routes);
  expect(await screen.findByRole("heading", { name: "Altheo Homes" })).toBeInTheDocument();
  const dbRow = (await screen.findByText("Not reachable")).closest("li")!;
  expect(dbRow).toHaveTextContent("Database");
});
