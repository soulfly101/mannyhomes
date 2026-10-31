import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { BuildingsPage } from "../../src/admin/BuildingsPage";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";
import { MANNY, asAdmin } from "./fixtures";

const routes = (
  <Route
    path="/admin/buildings"
    element={
      <RequireAuth roles={["admin"]}>
        <BuildingsPage />
      </RequireAuth>
    }
  />
);

test("lists buildings with prices and availability", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/buildings": { body: [MANNY, { ...MANNY, id: "b2", name: "Apartment B", listed: false, total_available: 0, room_types: [] }] } });
  renderAt("/admin/buildings", routes);

  const manny = await screen.findByRole("article", { name: "Manny Building" });
  expect(within(manny).getByText("Oyarifa · Sanitation GH₵ 50/mo")).toBeInTheDocument();
  const rows = within(manny).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("1 bedroom");
  expect(rows[0]).toHaveTextContent("GH₵ 1,200/mo");
  expect(within(rows[1]).getByText("3 available")).toHaveClass("pill-ok");
  expect(within(rows[2]).getByText("Fully booked")).toHaveClass("pill-danger");
  expect(within(manny).getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/admin/buildings/b1");

  const hidden = screen.getByRole("article", { name: "Apartment B" });
  expect(within(hidden).getByText("Hidden from tenants")).toBeInTheDocument();
  expect(screen.getByText("2 buildings · 4 rooms available")).toBeInTheDocument();
});

test("shows an empty state with no buildings", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/buildings": { body: [] } });
  renderAt("/admin/buildings", routes);
  expect(await screen.findByRole("heading", { name: "No buildings yet" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Add building" })).toHaveAttribute("href", "/admin/buildings/new");
});

test("deletes a building only after confirming", async () => {
  const { calls } = mockApi({
    ...asAdmin,
    "GET /api/admin/buildings": { body: [MANNY] },
    "DELETE /api/admin/buildings/b1": { status: 204 },
  });
  renderAt("/admin/buildings", routes);
  const card = await screen.findByRole("article", { name: "Manny Building" });

  await userEvent.click(within(card).getByRole("button", { name: "Delete" }));
  expect(within(card).getByText(/This can't be undone/)).toBeInTheDocument();
  await userEvent.click(within(card).getByRole("button", { name: "Cancel" }));
  expect(calls.some((c) => c.key.startsWith("DELETE"))).toBe(false);

  await userEvent.click(within(card).getByRole("button", { name: "Delete" }));
  await userEvent.click(within(card).getByRole("button", { name: "Delete building" }));
  await waitFor(() => expect(screen.queryByRole("article", { name: "Manny Building" })).not.toBeInTheDocument());
  expect(calls.some((c) => c.key === "DELETE /api/admin/buildings/b1")).toBe(true);
});

test("shows the error if deleting fails", async () => {
  mockApi({
    ...asAdmin,
    "GET /api/admin/buildings": { body: [MANNY] },
    "DELETE /api/admin/buildings/b1": { status: 500, body: { detail: "Database is down." } },
  });
  renderAt("/admin/buildings", routes);
  const card = await screen.findByRole("article", { name: "Manny Building" });
  await userEvent.click(within(card).getByRole("button", { name: "Delete" }));
  await userEvent.click(within(card).getByRole("button", { name: "Delete building" }));
  expect(await within(card).findByRole("alert")).toHaveTextContent("Database is down.");
});

test("tenants see that they don't have access", async () => {
  const { calls } = mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff });
  renderAt("/admin/buildings", routes);
  expect(await screen.findByRole("heading", { name: "You don't have access to this page" })).toBeInTheDocument();
  expect(calls.some((c) => c.key === "GET /api/admin/buildings")).toBe(false);
});
