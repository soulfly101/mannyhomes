import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { TicketsPage } from "../../src/admin/TicketsPage";
import { googleOff, mockApi, renderAt } from "../helpers";

const ESI = { id: "a1", name: "Esi Admin", email: "esi@example.com", phone: null, role: "admin", needs_onboarding: false };
const base = { "GET /api/auth/me": { body: ESI }, ...googleOff };

const row = (overrides = {}) => ({
  id: "t1",
  category: "plumbing",
  description: "The kitchen tap drips all night.",
  status: "pending",
  room_number: "A12",
  building: "Manny Building",
  created_at: "2026-11-07T10:00:00",
  updated_at: "2026-11-07T10:00:00",
  tenant_name: "Ama Mensah",
  tenant_phone: "+233241234567",
  ...overrides,
});

const page = () => renderAt("/admin/tickets", <Route path="/admin/tickets" element={<TicketsPage />} />);
const reports = async () => within(await screen.findByRole("list", { name: "Reports" }));

test("each report shows who, where, when, the category and the description", async () => {
  mockApi({ ...base, "GET /api/admin/tickets": { body: [row()] } });
  page();
  const r = await reports();
  expect(r.getByRole("heading", { name: "Ama Mensah" })).toBeInTheDocument();
  expect(r.getByText(/Manny Building, room A12 · \+233241234567/)).toBeInTheDocument();
  expect(r.getByText("Plumbing")).toBeInTheDocument();
  expect(r.getByText(/Reported 7 Nov 2026/)).toBeInTheDocument();
  expect(r.getByText("The kitchen tap drips all night.")).toBeInTheDocument();
  expect(r.getByLabelText("Status")).toHaveValue("pending");
});

test("the admin changes a status and it's saved", async () => {
  const { calls } = mockApi({ ...base, "GET /api/admin/tickets": { body: [row()] }, "PATCH /api/admin/tickets/t1": { body: row({ status: "in_progress" }) } });
  page();
  const r = await reports();
  await userEvent.selectOptions(r.getByLabelText("Status"), "In Progress / Assigned");
  expect(calls.find((c) => c.key === "PATCH /api/admin/tickets/t1")!.body).toEqual({ status: "in_progress" });
  expect(await r.findByDisplayValue("In Progress / Assigned")).toBeInTheDocument();
});

test("the four statuses use the admin's names", async () => {
  mockApi({ ...base, "GET /api/admin/tickets": { body: [row()] } });
  page();
  const options = within((await reports()).getByLabelText("Status")).getAllByRole("option").map((o) => o.textContent);
  expect(options).toEqual(["New / Pending", "In Progress / Assigned", "Resolved", "Closed"]);
});

test("filtering by status, with a count on each", async () => {
  mockApi({ ...base, "GET /api/admin/tickets": { body: [row(), row({ id: "t2", tenant_name: "Kofi Boateng", status: "resolved" })] } });
  page();
  await reports();
  await userEvent.click(screen.getByRole("button", { name: "Resolved (1)" }));
  const r = await reports();
  expect(r.getByRole("heading", { name: "Kofi Boateng" })).toBeInTheDocument();
  expect(r.queryByRole("heading", { name: "Ama Mensah" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Closed (0)" }));
  expect(screen.getByText("No reports with this status.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "All (2)" }));
  expect((await reports()).getAllByRole("heading")).toHaveLength(2);
});

test("a failed save is explained", async () => {
  mockApi({ ...base, "GET /api/admin/tickets": { body: [row()] }, "PATCH /api/admin/tickets/t1": { status: 500, body: { detail: "Something broke." } } });
  page();
  await userEvent.selectOptions((await reports()).getByLabelText("Status"), "Closed");
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
});

test("no reports yet says so", async () => {
  mockApi({ ...base, "GET /api/admin/tickets": { body: [] } });
  page();
  expect(await screen.findByText("No reports yet. They appear here as soon as a tenant sends one.")).toBeInTheDocument();
});
