import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lastMonths, PaymentStatusPanel, type PaymentStatus } from "../../src/admin/PaymentStatusPanel";
import { mockApi } from "../helpers";

const KEY = "GET /api/admin/overview/payments";

const status = (overrides: Partial<PaymentStatus> = {}): PaymentStatus => ({
  period: "2026-11",
  fee: "all",
  building_id: null,
  groups: [
    { key: "paid", label: "Fully paid", count: 2, owed: 0 },
    { key: "partial", label: "Still owes something", count: 1, owed: 2500 },
    { key: "unpaid", label: "Nothing paid", count: 1, owed: 1000 },
  ],
  tenants: [
    { id: "t1", name: "Kofi Part", room: "A2", building: "Manny Building", status: "partial", owed: 2500 },
    { id: "t2", name: "Yaw Owes", room: "T1", building: "Tema Court", status: "unpaid", owed: 1000 },
    { id: "t3", name: "Ama Paid", room: "A1", building: "Manny Building", status: "paid", owed: 0 },
    { id: "t4", name: "Esi Paid", room: "A3", building: "Manny Building", status: "paid", owed: 0 },
  ],
  not_billed: 0,
  buildings: [
    { id: "b1", name: "Manny Building" },
    { id: "b2", name: "Tema Court" },
  ],
  ...overrides,
});

const queries = (fetchMock: jest.Mock) => fetchMock.mock.calls.map(([url]) => new URL(String(url), "http://localhost").searchParams);

test("tenants who owe come first, with counts, shares and amounts in words", async () => {
  mockApi({ [KEY]: { body: status() } });
  render(<PaymentStatusPanel />);
  const groups = await screen.findByRole("group", { name: "Show tenants who are" });
  const partial = within(groups).getByRole("button", { name: /Still owes something/ });
  expect(partial).toHaveAttribute("aria-pressed", "true");
  expect(partial).toHaveTextContent("GH₵ 2,500 owed");
  expect(partial).toHaveTextContent("1 (25%)");
  expect(within(groups).getByRole("button", { name: /Fully paid/ })).toHaveTextContent("2 (50%)");
  const list = screen.getByRole("list", { name: "Still owes something tenants" });
  expect(within(list).getByText("Kofi Part")).toBeInTheDocument();
  expect(within(list).getByText("Room A2, Manny Building")).toBeInTheDocument();
  expect(within(list).queryByText("Yaw Owes")).not.toBeInTheDocument();
  // A table carries the same numbers for screen readers.
  expect(screen.getByRole("table", { name: "Tenants by payment status" })).toHaveTextContent("Nothing paid1GH₵ 1,000");
});

test("picking a group lists its tenants", async () => {
  mockApi({ [KEY]: { body: status() } });
  render(<PaymentStatusPanel />);
  await userEvent.click(await screen.findByRole("button", { name: /Fully paid/ }));
  const list = screen.getByRole("list", { name: "Fully paid tenants" });
  expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "Ama PaidRoom A1, Manny BuildingPaid",
    "Esi PaidRoom A3, Manny BuildingPaid",
  ]);
  expect(screen.getByRole("heading", { name: "Fully paid (2)" })).toBeInTheDocument();
});

test("the filters ask the server again for that building, fee and month", async () => {
  const { fetchMock } = mockApi({ [KEY]: { body: status() } });
  render(<PaymentStatusPanel />);
  await screen.findByRole("group", { name: "Show tenants who are" });
  expect(queries(fetchMock)[0].get("period")).toBe(lastMonths(1)[0]);
  expect(queries(fetchMock)[0].get("fee")).toBe("all");
  expect(queries(fetchMock)[0].has("building_id")).toBe(false);

  await userEvent.selectOptions(screen.getByLabelText("Building"), "Tema Court");
  await userEvent.selectOptions(screen.getByLabelText("Fee"), "Sanitation fee");
  const previous = lastMonths(2)[1];
  await userEvent.selectOptions(screen.getByLabelText("Month"), previous);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  const last = queries(fetchMock)[3];
  expect([last.get("building_id"), last.get("fee"), last.get("period")]).toEqual(["b2", "sanitation", previous]);
  expect(screen.getByLabelText("Month")).toHaveValue(previous);
});

test("deposits explain what the month means, and uncounted tenants are mentioned", async () => {
  mockApi({ [KEY]: { body: status({ fee: "renting_deposit", not_billed: 1 }) } });
  render(<PaymentStatusPanel />);
  await userEvent.selectOptions(await screen.findByLabelText("Fee"), "Renting deposit");
  expect(screen.getByText("Deposits are paid once. The month picks who had a room then.")).toBeInTheDocument();
  expect(await screen.findByText(/1 tenant with a room isn't counted: the bill was cancelled\./)).toBeInTheDocument();
});

test("sanitation explains who isn't billed yet", async () => {
  mockApi({ [KEY]: { body: status({ not_billed: 2 }) } });
  render(<PaymentStatusPanel />);
  expect(await screen.findByText(/2 tenants with a room aren't counted: no sanitation bill for/)).toBeInTheDocument();
});

test("with nobody to show it says so instead of drawing an empty chart", async () => {
  const groups = status().groups.map((g) => ({ ...g, count: 0, owed: 0 }));
  mockApi({ [KEY]: { body: status({ groups, tenants: [] }) } });
  render(<PaymentStatusPanel />);
  expect(await screen.findByText(/No tenants to show for/)).toHaveTextContent("once they have a room and their first sanitation bill");
  expect(screen.queryByRole("group", { name: "Show tenants who are" })).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("a failure is shown", async () => {
  mockApi({ [KEY]: { status: 500, body: { detail: "Something went wrong." } } });
  render(<PaymentStatusPanel />);
  expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
});

test("the month list counts back across the new year", () => {
  expect(lastMonths(3, new Date(Date.UTC(2027, 0, 20)))).toEqual(["2027-01", "2026-12", "2026-11"]);
});
