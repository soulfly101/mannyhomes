import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { BookingsPage } from "../../src/residences/BookingsPage";
import { BookingStatusPage, POLL_MS } from "../../src/residences/BookingStatusPage";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";
import { listings } from "../landing/fixtures";
import { booking } from "./fixtures";

const base = { "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) } };
const waiting = booking({ payment: { status: "pending", message: "Please complete authorization on your phone" } });
const paid = booking({ status: "awaiting_allocation", bill_status: "paid", payment: { status: "success", message: null } });

const renderStatus = () => renderAt("/bookings/bk1", <Route path="/bookings/:bookingId" element={<BookingStatusPage />} />);

test("while waiting it tells the tenant to approve, and notices when the money arrives", async () => {
  jest.useFakeTimers({ advanceTimers: true });
  try {
    let reply = waiting;
    const { calls } = mockApi({ ...base, "GET /api/bookings/bk1": () => ({ body: reply }) });
    renderStatus();
    expect(await screen.findByRole("heading", { name: "Approve the prompt on your phone" })).toBeInTheDocument();
    expect(screen.getByText(/Please complete authorization on your phone/)).toBeInTheDocument();
    expect(screen.queryByText("Test mode")).not.toBeInTheDocument();
    reply = paid;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(await screen.findByRole("heading", { name: "Booking confirmed" })).toBeInTheDocument();
    expect(screen.getByText("Awaiting room allocation")).toHaveAttribute("data-tone", "success");
    expect(screen.getByRole("link", { name: "Go to my dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("BILL-000007")).toBeInTheDocument();
    const asked = calls.filter((c) => c.key === "GET /api/bookings/bk1").length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(calls.filter((c) => c.key === "GET /api/bookings/bk1").length).toBe(asked); // stops asking
  } finally {
    jest.useRealTimers();
  }
});

test("once allocated the tenant sees their room and what's next", async () => {
  const allocated = booking({
    status: "allocated",
    bill_status: "paid",
    payment: { status: "success", message: null },
    tenancy: { room_number: "A12", start_date: "2026-11-04", rent: 2000, sanitation_fee: 50, renting_deposit: 4000, renting_bill_number: "BILL-000009", renting_bill_status: "unpaid" },
  });
  mockApi({ ...base, "GET /api/bookings/bk1": { body: allocated } });
  renderStatus();
  expect(await screen.findByRole("heading", { name: "Your room is ready: A12" })).toBeInTheDocument();
  expect(screen.getByText("Room allocated")).toHaveAttribute("data-tone", "success");
  expect(screen.getByText("4 Nov 2026")).toBeInTheDocument();
  expect(screen.getByText("GH₵ 2,000 / month")).toBeInTheDocument();
  expect(screen.getByText("GH₵ 4,000")).toBeInTheDocument();
  expect(screen.getByText("Unpaid")).toHaveAttribute("data-tone", "danger");
  expect(screen.getByText("BILL-000009")).toBeInTheDocument();
});

const step = () => document.querySelector('[aria-current="step"]');

test.each([
  ["waiting for payment", waiting, "Pay"],
  ["confirmed", paid, "Confirmed"],
])("the steps show where the tenant is when %s", async (_name, reply, label) => {
  mockApi({ ...base, "GET /api/bookings/bk1": { body: reply } });
  renderStatus();
  await screen.findByRole("list", { name: "Booking steps" });
  expect(step()).toHaveTextContent(label);
});

test("a cancelled booking has no steps", async () => {
  mockApi({ ...base, "GET /api/bookings/bk1": { body: booking({ status: "cancelled" }) } });
  renderStatus();
  await screen.findByRole("heading", { name: "Booking cancelled" });
  expect(screen.queryByRole("list", { name: "Booking steps" })).not.toBeInTheDocument();
});

test("a failed payment says why and offers another try or cancelling", async () => {
  const cancelled = booking({ status: "cancelled" });
  mockApi({ ...base, "GET /api/bookings/bk1": { body: booking({ payment: { status: "failed", message: "Insufficient funds" } }) }, "POST /api/bookings/bk1/cancel": { body: cancelled } });
  renderStatus();
  expect(await screen.findByRole("heading", { name: "The payment didn't go through" })).toBeInTheDocument();
  expect(screen.getByText("Insufficient funds")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/book/r2");
  await userEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
  expect(await screen.findByRole("heading", { name: "Booking cancelled" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "See all residences" })[0]).toHaveAttribute("href", "/residences");
});

test("an unpaid booking offers to pay", async () => {
  mockApi({ ...base, "GET /api/bookings/bk1": { body: booking() } });
  renderStatus();
  expect(await screen.findByRole("link", { name: "Pay the deposit" })).toHaveAttribute("href", "/book/r2");
});

test("test mode shows the buttons, and they decide the payment", async () => {
  const { calls } = mockApi({ ...base, "GET /api/bookings/bk1": { body: { ...waiting, test_mode: true } }, "POST /api/bookings/bk1/simulate": { body: paid } });
  renderStatus();
  expect(await screen.findByText("Test mode")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Test: approve payment" }));
  expect(await screen.findByRole("heading", { name: "Booking confirmed" })).toBeInTheDocument();
  expect(calls.find((c) => c.key === "POST /api/bookings/bk1/simulate")!.body).toEqual({ outcome: "success" });
});

test("problems are shown, and an unknown booking says so", async () => {
  mockApi({ ...base, "GET /api/bookings/bk1": { status: 404, body: { detail: "That booking doesn't exist." } } });
  const { unmount } = renderStatus();
  expect(await screen.findByRole("heading", { name: "We can't find that booking" })).toBeInTheDocument();
  unmount();
  mockApi({ ...base, "GET /api/bookings/bk1": { status: 500, body: { detail: "Something broke." } } });
  renderStatus();
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
});

const renderList = () => renderAt("/bookings", <Route path="/bookings" element={<RequireAuth roles={["tenant"]}><BookingsPage /></RequireAuth>} />);

test("the list links to each booking with its status", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [paid, booking({ id: "bk2", status: "cancelled" })] } });
  renderList();
  const link = await screen.findByRole("link", { name: /2 bedroom.*Awaiting room allocation/ });
  expect(link).toHaveAttribute("href", "/bookings/bk1");
  expect(screen.getByText("Cancelled")).toHaveAttribute("data-tone", "neutral");
});

test("the list explains when there are no bookings", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [] } });
  renderList();
  expect(await screen.findByText(/No bookings yet/)).toBeInTheDocument();
});
