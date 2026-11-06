import { screen, within } from "@testing-library/react";
import { Route } from "react-router";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { currentSanitationBills, type TenantBill } from "../../src/residences/bills";
import { BillsPage } from "../../src/residences/BillsPage";
import { TenantDashboardPage } from "../../src/residences/TenantDashboardPage";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";
import { booking } from "./fixtures";

const bill = (overrides: Partial<TenantBill> = {}): TenantBill => ({
  id: 20,
  number: "BILL-000020",
  kind: "sanitation",
  description: "Sanitation fee, November 2026, room A12 at Manny Building",
  amount: 50,
  paid: 0,
  balance: 50,
  status: "unpaid",
  period: "2026-11",
  due_date: "2026-11-15",
  ...overrides,
});

const allocated = (signed: boolean, sanitation_fee = 50) =>
  booking({
    status: "allocated",
    bill_status: "paid",
    payment: { status: "success", message: null, otp_required: false },
    tenancy: { room_number: "A12", start_date: "2026-11-04", rent: 2000, sanitation_fee, renting_deposit: 4000, renting_bill_number: "BILL-000009", renting_bill_status: "paid", renting_bill_id: 9, agreement_id: "ag1", agreement_signed: signed },
  });

const base = { "GET /api/auth/me": { body: AMA }, ...googleOff };

const dashboard = () =>
  renderAt("/dashboard", <Route path="/dashboard" element={<RequireAuth roles={["tenant"]}><TenantDashboardPage /></RequireAuth>} />);
const billsPage = () => renderAt("/bills", <Route path="/bills" element={<RequireAuth roles={["tenant"]}><BillsPage /></RequireAuth>} />);

const section = async () => within(await screen.findByRole("region", { name: "Billing / Payments" }));

test("the dashboard shows the month's bill with its status and a Pay Fee button", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [allocated(true)] }, "GET /api/me/bills": { body: [bill()] } });
  dashboard();
  const billing = await section();
  expect(await billing.findByText(/Sanitation fee, November 2026/)).toBeInTheDocument();
  expect(billing.getByText("Unpaid")).toBeInTheDocument();
  expect(billing.getByText(/GH₵ 50 to pay, due 15 Nov 2026/)).toBeInTheDocument();
  expect(billing.getByRole("link", { name: /^Pay Fee/ })).toHaveAttribute("href", "/bills/20/pay");
  expect(billing.getByRole("link", { name: "See all bills" })).toHaveAttribute("href", "/bills");
});

test("a part-paid bill says Partial and asks only for what's left", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [allocated(true)] }, "GET /api/me/bills": { body: [bill({ status: "partial", paid: 20, balance: 30 })] } });
  dashboard();
  const billing = await section();
  expect(await billing.findByText("Partial")).toBeInTheDocument();
  expect(billing.getByText(/GH₵ 30 to pay/)).toBeInTheDocument();
  expect(billing.getByRole("link", { name: /^Pay Fee/ })).toBeInTheDocument();
});

test("a paid bill says Paid and can't be paid again", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [allocated(true)] }, "GET /api/me/bills": { body: [bill({ status: "paid", paid: 50, balance: 0 })] } });
  dashboard();
  const billing = await section();
  expect(await billing.findByText("Paid")).toBeInTheDocument();
  expect(billing.queryByRole("link", { name: /^Pay Fee/ })).not.toBeInTheDocument();
});

test("before the first bill it explains when they start", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [allocated(false)] }, "GET /api/me/bills": { body: [] } });
  dashboard();
  const billing = await section();
  expect(await billing.findByText(/will appear here once you've signed/)).toBeInTheDocument();
});

test("rooms with no sanitation fee don't show the section", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [allocated(true, 0)] }, "GET /api/me/bills": { body: [] } });
  dashboard();
  await screen.findByRole("heading", { level: 1, name: "Tenant Dashboard" });
  await screen.findByRole("region", { name: "Your tenancy" });
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole("region", { name: "Billing / Payments" })).not.toBeInTheDocument();
});

test("a failure loading bills is shown but the dashboard still works", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [allocated(true)] }, "GET /api/me/bills": { status: 500, body: { detail: "Something broke." } } });
  dashboard();
  const billing = await section();
  expect(await billing.findByText("Something broke.")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Your home" })).toBeInTheDocument();
});

test("the dashboard picks everything owed, otherwise the latest bill", () => {
  const paid = bill({ id: 3, status: "paid", period: "2026-12" });
  const older = bill({ id: 2, status: "paid", period: "2026-11" });
  const owed = bill({ id: 1, status: "partial", period: "2026-10" });
  const deposit = bill({ id: 9, kind: "renting_deposit", status: "unpaid", period: null });
  expect(currentSanitationBills([paid, older, owed, deposit]).map((b) => b.id)).toEqual([1]);
  expect(currentSanitationBills([paid, older, deposit]).map((b) => b.id)).toEqual([3]);
  expect(currentSanitationBills([deposit])).toEqual([]);
});

test("the bills page lists everything; the booking deposit is paid from the booking instead", async () => {
  mockApi({
    ...base,
    "GET /api/me/bills": {
      body: [
        bill(),
        bill({ id: 9, number: "BILL-000009", kind: "renting_deposit", description: "Renting security deposit", period: null }),
        bill({ id: 7, number: "BILL-000007", kind: "booking_deposit", description: "Booking deposit", period: null }),
      ],
    },
  });
  billsPage();
  const list = within(await screen.findByRole("list", { name: "Your bills" }));
  expect(list.getAllByRole("listitem")).toHaveLength(3);
  expect(list.getByRole("link", { name: /^Pay Fee/ })).toHaveAttribute("href", "/bills/20/pay");
  expect(list.getByRole("link", { name: "Pay: Renting security deposit" })).toHaveAttribute("href", "/bills/9/pay");
  expect(list.queryByRole("link", { name: "Pay: Booking deposit" })).not.toBeInTheDocument();
});

test("the bills page says when there's nothing, or when loading fails", async () => {
  mockApi({ ...base, "GET /api/me/bills": { body: [] } });
  const { unmount } = billsPage();
  expect(await screen.findByText("You don't have any bills yet.")).toBeInTheDocument();
  unmount();
  mockApi({ ...base, "GET /api/me/bills": { status: 500, body: { detail: "Something broke." } } });
  billsPage();
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
});
