import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { dayOfMonth, TenantsPage } from "../../src/admin/TenantsPage";
import { googleOff, mockApi, renderAt } from "../helpers";

const ESI = { id: "a1", name: "Esi Admin", email: "esi@example.com", phone: null, role: "admin", needs_onboarding: false };
const base = { "GET /api/auth/me": { body: ESI }, ...googleOff };

const row = (overrides = {}) => ({
  id: "t1",
  tenant_name: "Ama Mensah",
  room_number: "A12",
  building: "Manny Building",
  sanitation_fee: 50,
  move_in_date: "2026-11-15",
  set_by_admin: false,
  this_month: { number: "BILL-000020", status: "unpaid", balance: 50, due_date: "2026-11-15" },
  ...overrides,
});

const page = () => renderAt("/admin/tenants", <Route path="/admin/tenants" element={<TenantsPage />} />);
const card = async () => within(await screen.findByRole("list", { name: "Tenants" }));

test.each([
  ["2026-11-01", "1st"],
  ["2026-11-02", "2nd"],
  ["2026-11-03", "3rd"],
  ["2026-11-11", "11th"],
  ["2026-11-12", "12th"],
  ["2026-11-13", "13th"],
  ["2026-11-21", "21st"],
  ["2026-11-31", "31st"],
])("%s is the %s", (iso, expected) => {
  expect(dayOfMonth(iso)).toBe(expected);
});

test("shows each tenant, when their bill is due and how this month stands", async () => {
  mockApi({ ...base, "GET /api/admin/tenancies": { body: [row()] } });
  page();
  const c = await card();
  expect(c.getByRole("heading", { name: "Ama Mensah" })).toBeInTheDocument();
  expect(c.getByText("Room A12 · Manny Building")).toBeInTheDocument();
  expect(c.getByText(/GH₵ 50 sanitation fee, due on the 15th of each month\. Worked out from the day they signed\./)).toBeInTheDocument();
  expect(c.getByText("This month: Unpaid")).toBeInTheDocument();
  expect(c.getByText(/GH₵ 50 still to pay on BILL-000020, due 15 Nov 2026/)).toBeInTheDocument();
  expect(c.getByLabelText("Move-in date")).toHaveValue("2026-11-15");
});

test("before signing it says no bills have started", async () => {
  mockApi({ ...base, "GET /api/admin/tenancies": { body: [row({ move_in_date: null, this_month: null })] } });
  page();
  const c = await card();
  expect(c.getByText(/No bills yet\. They start when the tenant signs/)).toBeInTheDocument();
});

test("rooms with no fee say so", async () => {
  mockApi({ ...base, "GET /api/admin/tenancies": { body: [row({ sanitation_fee: 0, this_month: null })] } });
  page();
  expect((await card()).getByText("No sanitation fee for this room.")).toBeInTheDocument();
});

test("saving a date updates the card", async () => {
  const { calls } = mockApi({
    ...base,
    "GET /api/admin/tenancies": { body: [row()] },
    "PATCH /api/admin/tenancies/t1": { body: row({ move_in_date: "2026-11-20", set_by_admin: true, this_month: { number: "BILL-000020", status: "unpaid", balance: 50, due_date: "2026-11-20" } }) },
  });
  page();
  const c = await card();
  const input = c.getByLabelText("Move-in date");
  await userEvent.clear(input);
  await userEvent.type(input, "2026-11-20");
  await userEvent.click(c.getByRole("button", { name: "Save date" }));
  expect(await c.findByText(/due on the 20th of each month\.$/)).toBeInTheDocument();
  expect(calls.find((x) => x.key.startsWith("PATCH"))?.body).toEqual({ move_in_date: "2026-11-20" });
  expect(c.queryByText(/Worked out from/)).not.toBeInTheDocument();
});

test("a refused date shows why and an empty one isn't sent", async () => {
  const { calls } = mockApi({
    ...base,
    "GET /api/admin/tenancies": { body: [row()] },
    "PATCH /api/admin/tenancies/t1": { status: 409, body: { detail: "November 2026 has been paid, so the move-in date can't be after that month." } },
  });
  page();
  const c = await card();
  await userEvent.click(c.getByRole("button", { name: "Save date" }));
  expect(await c.findByText(/has been paid/)).toBeInTheDocument();
  await userEvent.clear(c.getByLabelText("Move-in date"));
  const sent = calls.filter((x) => x.key.startsWith("PATCH")).length;
  await userEvent.click(c.getByRole("button", { name: "Save date" }));
  expect(await c.findByText("Choose the move-in date.")).toBeInTheDocument();
  expect(calls.filter((x) => x.key.startsWith("PATCH"))).toHaveLength(sent);
});

test("says when there are no tenants, or loading fails", async () => {
  mockApi({ ...base, "GET /api/admin/tenancies": { body: [] } });
  const { unmount } = page();
  expect(await screen.findByText(/No tenants yet/)).toBeInTheDocument();
  unmount();
  mockApi({ ...base, "GET /api/admin/tenancies": { status: 500, body: { detail: "Something broke." } } });
  page();
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
});
