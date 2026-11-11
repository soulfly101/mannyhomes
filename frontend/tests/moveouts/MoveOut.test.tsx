import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { MoveOutPage } from "../../src/admin/MoveOutPage";
import { TenantsPage } from "../../src/admin/TenantsPage";
import { RequireAuth } from "../../src/auth/RequireAuth";
import type { MoveOut } from "../../src/moveouts/moveouts";
import { TenantDashboardPage } from "../../src/residences/TenantDashboardPage";
import { asAdmin } from "../admin/fixtures";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";
import { listings } from "../landing/fixtures";
import { booking } from "../residences/fixtures";

const PREVIEW = "GET /api/admin/tenancies/t1/move-out";
const CONFIRM = "POST /api/admin/tenancies/t1/move-out";

const preview = (overrides = {}) => ({
  tenancy_id: "t1",
  tenant_name: "Kwame Leaving",
  room_number: "A1",
  building: "Manny Building",
  start_date: "2026-01-04",
  deposits: [
    { label: "Booking deposit", number: "BILL-000001", amount: 300, paid: 300 },
    { label: "Renting deposit", number: "BILL-000002", amount: 4000, paid: 4000 },
  ],
  deposits_held: 4300,
  arrears: [{ bill_id: 7, number: "BILL-000007", description: "Sanitation fee, November 2026", due_date: "2026-11-04", balance: 50 }],
  blocked_reason: null,
  ...overrides,
});

const moveOut = (overrides: Partial<MoveOut> = {}): MoveOut => ({
  id: "m1",
  tenancy_id: "t1",
  tenant_id: "u9",
  tenant_name: "Kwame Leaving",
  room_number: "A1",
  building: "Manny Building",
  moved_out_on: "2026-11-10",
  deposits_held: 4300,
  deductions: [
    { reason: "Broken window", amount: 250, bill_number: null },
    { reason: "Arrears: Sanitation fee, November 2026", amount: 50, bill_number: "BILL-000007" },
  ],
  deductions_total: 300,
  refund_due: 4000,
  note: "Keys returned",
  refunded_at: null,
  refund_method: null,
  refund_reference: null,
  ...overrides,
});

const openPage = () =>
  renderAt("/admin/tenants/t1/move-out", <Route path="/admin/tenants/:tenancyId/move-out" element={<MoveOutPage />} />);
const refund = () => within(screen.getByRole("region", { name: "Refund" }));

test("the move-out shows deposits held, ticks unpaid bills and works out the refund", async () => {
  mockApi({ ...asAdmin, [PREVIEW]: { body: preview() } });
  openPage();
  expect(await screen.findByRole("heading", { name: "Move out Kwame Leaving" })).toBeInTheDocument();
  const held = within(screen.getByRole("region", { name: "Deposits held" }));
  expect(held.getByText("GH₵ 4,300")).toBeInTheDocument();
  const bill = screen.getByRole("checkbox", { name: /Sanitation fee, November 2026/ });
  expect(bill).toBeChecked();
  expect(screen.getByLabelText("Amount from the deposit for BILL-000007")).toHaveValue("50");
  expect(refund().getByText("GH₵ 4,250")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Add a deduction" }));
  await userEvent.type(screen.getByLabelText("Reason 1"), "Broken window");
  await userEvent.type(screen.getByLabelText("Amount 1"), "250");
  expect(refund().getByText("GH₵ 4,000")).toBeInTheDocument();
  await userEvent.click(bill);
  expect(refund().getByText("GH₵ 4,050")).toBeInTheDocument();
});

test("confirming sends the day, the deductions and the note, then says the room is free", async () => {
  const { calls } = mockApi({ ...asAdmin, [PREVIEW]: { body: preview() }, [CONFIRM]: { status: 201, body: moveOut() } });
  openPage();
  await userEvent.click(await screen.findByRole("button", { name: "Add a deduction" }));
  await userEvent.type(screen.getByLabelText("Reason 1"), " Broken window ");
  await userEvent.type(screen.getByLabelText("Amount 1"), "250");
  await userEvent.type(screen.getByLabelText("Note (optional, for admins)"), "Keys returned");
  await userEvent.click(screen.getByRole("button", { name: "Confirm move-out" }));
  expect(await screen.findByRole("heading", { name: "Kwame Leaving has moved out" })).toBeInTheDocument();
  expect(screen.getByText(/Pay the GH₵ 4,000 refund back to them/)).toBeInTheDocument();
  const sent = calls.find((c) => c.key === CONFIRM)!.body as { moved_out_on: string; note: string; deductions: unknown[] };
  expect(sent.moved_out_on).toBe(new Date().toISOString().slice(0, 10));
  expect(sent.note).toBe("Keys returned");
  expect(sent.deductions).toEqual([
    { reason: "Arrears: Sanitation fee, November 2026", amount: 50, bill_id: 7 },
    { reason: "Broken window", amount: 250, bill_id: null },
  ]);
});

test("deductions over the deposit, missing reasons and bad amounts are caught before sending", async () => {
  const { calls } = mockApi({ ...asAdmin, [PREVIEW]: { body: preview() } });
  openPage();
  await userEvent.click(await screen.findByRole("button", { name: "Add a deduction" }));
  await userEvent.type(screen.getByLabelText("Amount 1"), "100");
  await userEvent.click(screen.getByRole("button", { name: "Confirm move-out" }));
  expect(screen.getByText("Say what each deduction is for.")).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText("Reason 1"), "Damage");
  await userEvent.clear(screen.getByLabelText("Amount 1"));
  await userEvent.type(screen.getByLabelText("Amount 1"), "12.5");
  await userEvent.click(screen.getByRole("button", { name: "Confirm move-out" }));
  expect(screen.getByText("Enter an amount in whole cedis for Damage.")).toBeInTheDocument();

  await userEvent.clear(screen.getByLabelText("Amount 1"));
  await userEvent.type(screen.getByLabelText("Amount 1"), "5000");
  await userEvent.click(screen.getByRole("button", { name: "Confirm move-out" }));
  expect(screen.getByText("The deductions come to more than the GH₵ 4,300 held in deposits.")).toBeInTheDocument();

  await userEvent.clear(screen.getByLabelText("Amount from the deposit for BILL-000007"));
  await userEvent.type(screen.getByLabelText("Amount from the deposit for BILL-000007"), "60");
  await userEvent.click(screen.getByRole("button", { name: "Remove deduction 1" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirm move-out" }));
  expect(screen.getByText("That's more than the GH₵ 50 owed on BILL-000007.")).toBeInTheDocument();
  expect(calls.some((c) => c.key === CONFIRM)).toBe(false);
});

test("the deposit covers arrears only as far as it goes", async () => {
  const arrears = [
    { bill_id: 7, number: "BILL-000007", description: "Sanitation fee, October", due_date: "2026-10-04", balance: 200 },
    { bill_id: 8, number: "BILL-000008", description: "Sanitation fee, November", due_date: "2026-11-04", balance: 200 },
  ];
  mockApi({ ...asAdmin, [PREVIEW]: { body: preview({ deposits_held: 300, arrears }) } });
  openPage();
  expect(await screen.findByLabelText("Amount from the deposit for BILL-000007")).toHaveValue("200");
  expect(screen.getByLabelText("Amount from the deposit for BILL-000008")).toHaveValue("100");
  expect(refund().getAllByText("GH₵ 0")).toHaveLength(1);
});

test("a server refusal is shown", async () => {
  mockApi({ ...asAdmin, [PREVIEW]: { body: preview() }, [CONFIRM]: { status: 409, body: { detail: "Kwame Leaving has already moved out." } } });
  openPage();
  await userEvent.click(await screen.findByRole("button", { name: "Confirm move-out" }));
  expect(await screen.findByText("Kwame Leaving has already moved out.")).toBeInTheDocument();
});

test("while a payment is waiting it can't be confirmed", async () => {
  mockApi({ ...asAdmin, [PREVIEW]: { body: preview({ blocked_reason: "A payment from this tenant is still waiting." }) } });
  openPage();
  expect(await screen.findByText("A payment from this tenant is still waiting.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm move-out" })).toBeDisabled();
});

test("an unknown or finished tenancy says why", async () => {
  mockApi({ ...asAdmin, [PREVIEW]: { status: 409, body: { detail: "Kwame Leaving has already moved out." } } });
  openPage();
  expect(await screen.findByText("Kwame Leaving has already moved out.")).toBeInTheDocument();
});

const tenancyRow = { id: "t1", tenant_name: "Ama Mensah", room_number: "A12", building: "Manny Building", sanitation_fee: 50, move_in_date: null, set_by_admin: false, this_month: null };
const tenantsPage = () => renderAt("/admin/tenants", <Route path="/admin/tenants" element={<TenantsPage />} />);

test("each tenant can be moved out, and past tenants show their refund", async () => {
  mockApi({
    ...asAdmin,
    "GET /api/admin/tenancies": { body: [tenancyRow] },
    "GET /api/admin/move-outs": {
      body: [moveOut(), moveOut({ id: "m2", tenant_name: "Yaw Done", refunded_at: "2026-11-09T10:00:00", refund_method: "Mobile Money", refund_reference: "MM1" })],
    },
  });
  tenantsPage();
  expect(await screen.findByRole("link", { name: "Move out Ama Mensah" })).toHaveAttribute("href", "/admin/tenants/t1/move-out");
  const moved = within(await screen.findByRole("list", { name: "Moved out" }));
  const [owed, done] = moved.getAllByRole("listitem");
  expect(owed).toHaveTextContent("Refund to pay");
  expect(owed).toHaveTextContent("GH₵ 4,300 held, GH₵ 300 kept back (Broken window: GH₵ 250; Arrears: Sanitation fee, November 2026: GH₵ 50), GH₵ 4,000 refund.");
  expect(owed).toHaveTextContent("Note: Keys returned");
  expect(done).toHaveTextContent("Refunded");
  expect(done).toHaveTextContent("Paid back 9 Nov 2026 by Mobile Money, reference MM1.");
  expect(within(done).queryByRole("button", { name: "Record refund" })).not.toBeInTheDocument();
});

test("recording a refund asks how it was paid", async () => {
  const { calls } = mockApi({
    ...asAdmin,
    "GET /api/admin/tenancies": { body: [] },
    "GET /api/admin/move-outs": { body: [moveOut()] },
    "POST /api/admin/move-outs/m1/refund": { body: moveOut({ refunded_at: "2026-11-11T09:00:00", refund_method: "Cash" }) },
  });
  tenantsPage();
  const card = within(await screen.findByRole("list", { name: "Moved out" }));
  await userEvent.click(card.getByRole("button", { name: "Record refund" }));
  expect(card.getByText("Choose how the refund was paid.")).toBeInTheDocument();
  await userEvent.selectOptions(card.getByLabelText("Paid back by"), "Cash");
  await userEvent.type(card.getByLabelText("Reference (optional)"), "R-22");
  await userEvent.click(card.getByRole("button", { name: "Record refund" }));
  expect(await card.findByText("Refunded")).toBeInTheDocument();
  expect(calls.find((c) => c.key === "POST /api/admin/move-outs/m1/refund")!.body).toEqual({ method: "cash", reference: "R-22" });
});

const movedOutBooking = booking({ status: "moved_out", bill_status: "paid", payment: { status: "success", message: null, otp_required: false } });
const dashboard = () =>
  renderAt("/dashboard", <Route path="/dashboard" element={<RequireAuth roles={["tenant"]}><TenantDashboardPage /></RequireAuth>} />);
const tenantBase = { "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) } };

test("after moving out the tenant sees the refund and can book again", async () => {
  mockApi({ ...tenantBase, "GET /api/bookings": { body: [movedOutBooking] }, "GET /api/me/move-outs": { body: [moveOut()] } });
  dashboard();
  expect(await screen.findByRole("heading", { level: 1, name: "Welcome back, Ama" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Find a place you'll love" })).toHaveAttribute("href", "/residences");
  const card = within(await screen.findByRole("region", { name: "Your move-out" }));
  expect(card.getByText("You moved out of room A1 at Manny Building on 10 Nov 2026.")).toBeInTheDocument();
  expect(card.getByText("Kept back: Broken window")).toBeInTheDocument();
  expect(card.getByText("GH₵ 4,000")).toBeInTheDocument();
  expect(card.getByText("Being paid back")).toBeInTheDocument();
  expect(card.getByRole("link", { name: "Message us" })).toHaveAttribute("href", "/messages");
});

test("a paid refund says when and how", async () => {
  const paid = moveOut({ refunded_at: "2026-11-11T09:00:00", refund_method: "Mobile Money", refund_reference: "MM9" });
  mockApi({ ...tenantBase, "GET /api/bookings": { body: [movedOutBooking] }, "GET /api/me/move-outs": { body: [paid] } });
  dashboard();
  const card = within(await screen.findByRole("region", { name: "Your move-out" }));
  expect(card.getByText("Refunded")).toBeInTheDocument();
  expect(card.getByText(/Paid back on 11 Nov 2026 by Mobile Money \(reference MM9\)\./)).toBeInTheDocument();
});

test("nothing to refund is said plainly", async () => {
  const kept = moveOut({ deductions_total: 4300, refund_due: 0, deductions: [{ reason: "Damage", amount: 4300, bill_number: null }] });
  mockApi({ ...tenantBase, "GET /api/bookings": { body: [movedOutBooking] }, "GET /api/me/move-outs": { body: [kept] } });
  dashboard();
  const card = within(await screen.findByRole("region", { name: "Your move-out" }));
  expect(card.getByText("Nothing to refund")).toBeInTheDocument();
  expect(card.getByText(/took the whole deposit/)).toBeInTheDocument();
});
