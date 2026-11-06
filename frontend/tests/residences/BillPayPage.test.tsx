import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { BillPayPage } from "../../src/residences/BillPayPage";
import { POLL_MS } from "../../src/residences/BookingStatusPage";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";
import { listings } from "../landing/fixtures";

const base = { "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) } };

const bill = (overrides = {}) => ({
  id: 9,
  number: "BILL-000009",
  description: "Renting security deposit, room A12 at Manny Building",
  amount: 4000,
  paid: 0,
  balance: 4000,
  status: "unpaid",
  payments: [] as { status: string; note: string | null }[],
  locked_reason: null,
  otp_required: false,
  test_mode: false,
  ...overrides,
});
const pending = { status: "pending", note: "Approve on your phone" };

const renderPage = () => renderAt("/bills/9/pay", <Route path="/bills/:billId/pay" element={<BillPayPage />} />);

test("an unsigned agreement locks the bill", async () => {
  mockApi({ ...base, "GET /api/me/bills/9": { body: bill({ locked_reason: "Sign your tenancy agreement first, then you can pay the renting deposit." }) } });
  renderPage();
  expect(await screen.findByText(/Sign your tenancy agreement first/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Mobile Money number")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to my dashboard" })).toHaveAttribute("href", "/dashboard");
});

test("paying sends the prompt and waits", async () => {
  const { calls } = mockApi({ ...base, "GET /api/me/bills/9": { body: bill() }, "POST /api/me/bills/9/pay": { body: bill({ payments: [pending] }) } });
  renderPage();
  await screen.findByLabelText("Mobile Money number");
  await userEvent.click(screen.getByRole("button", { name: "MTN MoMo" }));
  await userEvent.click(screen.getByRole("button", { name: "Pay GH₵ 4,000" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Approve the prompt on your phone" })).toBeInTheDocument();
  expect(screen.getByText(/Approve on your phone/)).toBeInTheDocument();
  expect(calls.find((c) => c.key === "POST /api/me/bills/9/pay")!.body).toEqual({ phone: "0241234567", network: "mtn" });
});

test("only what's left is asked for", async () => {
  mockApi({ ...base, "GET /api/me/bills/9": { body: bill({ paid: 1500, balance: 2500, status: "partial" }) } });
  renderPage();
  expect(await screen.findByRole("button", { name: "Pay GH₵ 2,500" })).toBeInTheDocument();
});

test("it notices when the money arrives, then stops checking", async () => {
  jest.useFakeTimers({ advanceTimers: true });
  try {
    let reply = bill({ payments: [pending] });
    const { calls } = mockApi({ ...base, "GET /api/me/bills/9": () => ({ body: reply }) });
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Approve the prompt on your phone" });
    reply = bill({ status: "paid", paid: 4000, balance: 0, payments: [{ status: "success", note: null }] });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Payment received" })).toBeInTheDocument();
    const asked = calls.filter((c) => c.key === "GET /api/me/bills/9").length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(calls.filter((c) => c.key === "GET /api/me/bills/9").length).toBe(asked);
  } finally {
    jest.useRealTimers();
  }
});

test("a failed payment says why and offers the form again", async () => {
  mockApi({ ...base, "GET /api/me/bills/9": { body: bill({ payments: [{ status: "failed", note: "Insufficient funds" }] }) } });
  renderPage();
  expect(await screen.findByText(/The last payment didn't go through. Insufficient funds/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pay GH₵ 4,000" })).toBeInTheDocument();
});

test("test mode shows the buttons", async () => {
  const { calls } = mockApi({ ...base, "GET /api/me/bills/9": { body: bill({ payments: [pending], test_mode: true }) }, "POST /api/me/bills/9/simulate": { body: bill({ status: "paid", paid: 4000, balance: 0, payments: [{ status: "success", note: null }] }) } });
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Test: approve payment" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Payment received" })).toBeInTheDocument();
  expect(calls.find((c) => c.key === "POST /api/me/bills/9/simulate")!.body).toEqual({ outcome: "success" });
});

test("a bill that isn't theirs isn't found", async () => {
  mockApi({ ...base, "GET /api/me/bills/9": { status: 404, body: { detail: "That bill doesn't exist." } } });
  renderPage();
  expect(await screen.findByRole("heading", { name: "We can't find that bill" })).toBeInTheDocument();
});

const askingForCode = { status: "pending", note: "Enter the code sent by SMS to that number." };

test("a first payment can ask for the SMS code, and the code sends the prompt", async () => {
  const { calls } = mockApi({
    ...base,
    "GET /api/me/bills/9": { body: bill() },
    "POST /api/me/bills/9/pay": { body: bill({ payments: [askingForCode], otp_required: true }) },
    "POST /api/me/bills/9/otp": { body: bill({ payments: [pending] }) },
  });
  renderPage();
  await screen.findByLabelText("Mobile Money number");
  await userEvent.click(screen.getByRole("button", { name: "MTN MoMo" }));
  await userEvent.click(screen.getByRole("button", { name: "Pay GH₵ 4,000" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Enter the code from your SMS" })).toBeInTheDocument();
  expect(screen.queryByText(/You have about 3 minutes/)).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("SMS code"), "1234");
  await userEvent.click(screen.getByRole("button", { name: "Confirm code" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Approve the prompt on your phone" })).toBeInTheDocument();
  expect(calls.find((c) => c.key === "POST /api/me/bills/9/otp")!.body).toEqual({ code: "1234" });
});

test("an empty code is caught before asking the server, and a refused one is explained", async () => {
  const { calls } = mockApi({
    ...base,
    "GET /api/me/bills/9": { body: bill({ payments: [askingForCode], otp_required: true }) },
    "POST /api/me/bills/9/otp": { status: 502, body: { detail: "Online payment isn't working right now." } },
  });
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Confirm code" }));
  expect(await screen.findByText("Enter the code from the SMS.")).toBeInTheDocument();
  expect(calls.some((c) => c.key === "POST /api/me/bills/9/otp")).toBe(false);
  await userEvent.type(screen.getByLabelText("SMS code"), "1234");
  await userEvent.click(screen.getByRole("button", { name: "Confirm code" }));
  expect(await screen.findByText("Online payment isn't working right now.")).toBeInTheDocument();
});

test("a tenant stuck on the code can use a different number", async () => {
  const { calls } = mockApi({
    ...base,
    "GET /api/me/bills/9": { body: bill({ payments: [askingForCode], otp_required: true }) },
    "POST /api/me/bills/9/pay": { body: bill({ payments: [pending] }) },
  });
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Use a different number" }));
  expect(screen.queryByLabelText("SMS code")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Telecel Cash" }));
  await userEvent.click(screen.getByRole("button", { name: "Pay GH₵ 4,000" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Approve the prompt on your phone" })).toBeInTheDocument();
  expect(calls.find((c) => c.key === "POST /api/me/bills/9/pay")!.body).toEqual({ phone: "0241234567", network: "vod" });
});
