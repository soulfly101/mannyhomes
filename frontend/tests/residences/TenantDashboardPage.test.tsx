import { act, screen, within } from "@testing-library/react";
import { Route } from "react-router";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { currentBooking, DASHBOARD_POLL_MS, TenantDashboardPage } from "../../src/residences/TenantDashboardPage";
import { AMA, googleOff, loggedOut, mockApi, renderAt } from "../helpers";
import { listings } from "../landing/fixtures";
import { booking } from "./fixtures";

const base = { "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) } };

const awaiting = booking({ status: "awaiting_allocation", bill_status: "paid", payment: { status: "success", message: null } });
const allocated = booking({
  status: "allocated",
  bill_status: "paid",
  payment: { status: "success", message: null },
  tenancy: { room_number: "A12", start_date: "2026-11-04", rent: 2000, sanitation_fee: 50, renting_deposit: 4000, renting_bill_number: "BILL-000009", renting_bill_status: "unpaid", renting_bill_id: 9, agreement_id: "ag1", agreement_signed: false },
});

const renderDashboard = () =>
  renderAt(
    "/dashboard",
    <>
      <Route path="/dashboard" element={<RequireAuth roles={["tenant"]}><TenantDashboardPage /></RequireAuth>} />
      <Route path="/login" element={<p>Login page</p>} />
    </>,
  );

test("before allocation it says so, in the card's words, with what was booked", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [awaiting] } });
  renderDashboard();
  expect(await screen.findByRole("heading", { level: 1, name: "Booking Confirmed - Awaiting Room Allocation" })).toBeInTheDocument();
  const details = within(screen.getByRole("region", { name: "Your booking" }));
  expect(details.getByText("Manny Building")).toBeInTheDocument();
  expect(details.getByText("Oyarifa")).toBeInTheDocument();
  expect(details.getByText("2 bedroom")).toBeInTheDocument();
  expect(details.queryByText("Your room")).not.toBeInTheDocument();
});

test("once allocated it's the Tenant Dashboard with building, location, room type and room", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [allocated] } });
  renderDashboard();
  expect(await screen.findByRole("heading", { level: 1, name: "Tenant Dashboard" })).toBeInTheDocument();
  const home = within(screen.getByRole("region", { name: "Your home" }));
  expect(home.getByText("Manny Building")).toBeInTheDocument();
  expect(home.getByText("Oyarifa")).toBeInTheDocument();
  expect(home.getByText("2 bedroom")).toBeInTheDocument();
  expect(home.getByText("A12")).toBeInTheDocument();
  const tenancy = within(screen.getByRole("region", { name: "Your tenancy" }));
  expect(tenancy.getByText("4 Nov 2026")).toBeInTheDocument();
  expect(tenancy.getByText("GH₵ 2,000 / month")).toBeInTheDocument();
  expect(tenancy.getByText("Unpaid")).toHaveAttribute("data-tone", "danger");
  // Opening a page that's already allocated isn't news.
  expect(screen.queryByText(/has just been allocated/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View booking details" })).toHaveAttribute("href", "/bookings/bk1");
});

test("after allocation the next step is signing, and paying isn't offered yet", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [allocated] } });
  renderDashboard();
  expect(await screen.findByRole("link", { name: "Read and sign your agreement" })).toHaveAttribute("href", "/agreements/ag1");
  expect(screen.queryByRole("link", { name: "Pay renting deposit" })).not.toBeInTheDocument();
});

test("once signed the next step is paying the deposit", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [{ ...allocated, tenancy: { ...allocated.tenancy!, agreement_signed: true } }] } });
  renderDashboard();
  expect(await screen.findByRole("link", { name: "Pay renting deposit" })).toHaveAttribute("href", "/bills/9/pay");
  expect(screen.getByRole("link", { name: "View your agreement" })).toHaveAttribute("href", "/agreements/ag1");
  expect(screen.queryByRole("link", { name: "Read and sign your agreement" })).not.toBeInTheDocument();
});

test("with the deposit paid only the agreement remains", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [{ ...allocated, tenancy: { ...allocated.tenancy!, agreement_signed: true, renting_bill_status: "paid" } }] } });
  renderDashboard();
  expect(await screen.findByText("Paid")).toHaveAttribute("data-tone", "success");
  expect(screen.queryByRole("link", { name: "Pay renting deposit" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View your agreement" })).toBeInTheDocument();
});

test("an older tenancy with no agreement says the team will be in touch", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [{ ...allocated, tenancy: { ...allocated.tenancy!, agreement_id: null } }] } });
  renderDashboard();
  expect(await screen.findByText(/Our team will contact you/)).toBeInTheDocument();
});

describe("live update", () => {
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => jest.useRealTimers());

  const tick = () =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(DASHBOARD_POLL_MS);
    });

  test("it turns into the Tenant Dashboard by itself, with a notification, then stops checking", async () => {
    let reply = [awaiting];
    const { calls } = mockApi({ ...base, "GET /api/bookings": () => ({ body: reply }) });
    renderDashboard();
    await screen.findByRole("heading", { level: 1, name: "Booking Confirmed - Awaiting Room Allocation" });
    await tick();
    expect(screen.getByRole("heading", { level: 1, name: "Booking Confirmed - Awaiting Room Allocation" })).toBeInTheDocument();
    reply = [allocated];
    await tick();
    expect(await screen.findByRole("heading", { level: 1, name: "Tenant Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Good news: room A12 has just been allocated to you.")).toHaveAttribute("role", "status");
    const asked = calls.filter((c) => c.key === "GET /api/bookings").length;
    await tick();
    await tick();
    expect(calls.filter((c) => c.key === "GET /api/bookings").length).toBe(asked);
  });

  test("coming back to the tab checks straight away", async () => {
    let reply = [awaiting];
    mockApi({ ...base, "GET /api/bookings": () => ({ body: reply }) });
    renderDashboard();
    await screen.findByRole("heading", { level: 1, name: "Booking Confirmed - Awaiting Room Allocation" });
    reply = [allocated];
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Tenant Dashboard" })).toBeInTheDocument();
  });

  test("a failed check keeps the page as it is and tries again", async () => {
    let fail = false;
    mockApi({ ...base, "GET /api/bookings": () => (fail ? { status: 500, body: { detail: "Something broke." } } : { body: [awaiting] }) });
    renderDashboard();
    await screen.findByRole("heading", { level: 1, name: "Booking Confirmed - Awaiting Room Allocation" });
    fail = true;
    await tick();
    expect(screen.getByRole("heading", { level: 1, name: "Booking Confirmed - Awaiting Room Allocation" })).toBeInTheDocument();
    expect(screen.queryByText("Something broke.")).not.toBeInTheDocument();
  });

  test("nothing is checked when there's nothing to wait for", async () => {
    const { calls } = mockApi({ ...base, "GET /api/bookings": { body: [] } });
    renderDashboard();
    await screen.findByRole("heading", { level: 1, name: "Welcome, Ama" });
    const asked = calls.filter((c) => c.key === "GET /api/bookings").length;
    await tick();
    expect(calls.filter((c) => c.key === "GET /api/bookings").length).toBe(asked);
  });
});

test("an unpaid booking points to finishing it", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [booking()] } });
  renderDashboard();
  expect(await screen.findByRole("heading", { level: 1, name: "Finish your booking" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Continue your booking" })).toHaveAttribute("href", "/bookings/bk1");
});

test("no booking yet welcomes them and points to the residences", async () => {
  mockApi({ ...base, "GET /api/bookings": { body: [booking({ status: "cancelled" })] } });
  renderDashboard();
  expect(await screen.findByRole("heading", { level: 1, name: "Welcome, Ama" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Find a place you'll love" })).toHaveAttribute("href", "/residences");
});

test("problems loading are shown", async () => {
  mockApi({ ...base, "GET /api/bookings": { status: 500, body: { detail: "Something broke." } } });
  renderDashboard();
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
});

test("visitors are sent to log in", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderDashboard();
  expect(await screen.findByText("Login page")).toBeInTheDocument();
});

test("the most important booking is the one shown", () => {
  const cancelled = booking({ id: "c", status: "cancelled" });
  const unpaid = booking({ id: "u" });
  expect(currentBooking([cancelled, unpaid, awaiting])?.status).toBe("awaiting_allocation");
  expect(currentBooking([awaiting, allocated])?.status).toBe("allocated");
  expect(currentBooking([cancelled, unpaid])?.id).toBe("u");
  expect(currentBooking([cancelled])).toBeNull();
});
