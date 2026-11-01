import { screen, within } from "@testing-library/react";
import { Route } from "react-router";
import { StatusPage } from "../../src/pages/StatusPage";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";

const routes = <Route path="/" element={<StatusPage />} />;

test("shows who is logged in and the API and database status", async () => {
  mockApi({
    "GET /api/auth/me": { body: AMA },
    ...googleOff,
    "GET /api/health": { body: { status: "ok" } },
    "GET /api/health/db": { body: { database: "ok" } },
  });
  renderAt("/", routes);
  expect(await screen.findByText("Logged in as Ama Mensah.")).toBeInTheDocument();
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
  expect(await screen.findByText("Not logged in.")).toBeInTheDocument();
  const dbRow = (await screen.findByText("Not reachable")).closest("li")!;
  expect(dbRow).toHaveTextContent("Database");
});
