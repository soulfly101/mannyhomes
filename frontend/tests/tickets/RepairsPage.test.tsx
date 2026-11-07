import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { RepairsPage, TICKETS_POLL_MS } from "../../src/tickets/RepairsPage";
import type { Ticket } from "../../src/tickets/tickets";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";

const base = { "GET /api/auth/me": { body: AMA }, ...googleOff };

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: "t1",
  category: "plumbing",
  description: "The kitchen tap drips all night.",
  status: "pending",
  room_number: "A12",
  building: "Manny Building",
  created_at: "2026-11-07T10:00:00",
  updated_at: "2026-11-07T10:00:00",
  ...overrides,
});

const page = () => renderAt("/repairs", <Route path="/repairs" element={<RepairsPage />} />);
const history = () => within(screen.getByRole("list", { name: "Your reports" }));

test("a tenant sends a report and it joins their history as Pending", async () => {
  const { calls } = mockApi({
    ...base,
    "GET /api/tickets": { body: { tickets: [], blocked_reason: null } },
    "POST /api/tickets": { status: 201, body: ticket() },
  });
  page();
  expect(await screen.findByText("You haven't reported anything yet.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Plumbing" }));
  await userEvent.type(screen.getByLabelText("Description"), "The kitchen tap drips all night.");
  await userEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Sent. You can follow it below.");
  expect(calls.find((c) => c.key === "POST /api/tickets")!.body).toEqual({ category: "plumbing", description: "The kitchen tap drips all night." });
  expect(history().getByText("Pending")).toBeInTheDocument();
  expect(history().getByText(/Room A12, Manny Building/)).toBeInTheDocument();
  expect(screen.getByLabelText("Description")).toHaveValue("");
});

test("a missing category or a too-short description is caught before sending", async () => {
  const { calls } = mockApi({ ...base, "GET /api/tickets": { body: { tickets: [], blocked_reason: null } } });
  page();
  await userEvent.click(await screen.findByRole("button", { name: "Send report" }));
  expect(screen.getByText("Choose what kind of problem it is.")).toBeInTheDocument();
  expect(screen.getByText("Describe the problem in a few more words.")).toBeInTheDocument();
  expect(calls.some((c) => c.key === "POST /api/tickets")).toBe(false);
});

test("history shows each report's live status in the tenant's words", async () => {
  const tickets = [ticket({ id: "a", status: "in_progress" }), ticket({ id: "b", status: "resolved", category: "electrical" }), ticket({ id: "c", status: "closed", category: "general" })];
  mockApi({ ...base, "GET /api/tickets": { body: { tickets, blocked_reason: null } } });
  page();
  await screen.findByRole("list", { name: "Your reports" });
  for (const text of ["In Progress", "Resolved", "Closed", "Electrical", "General"]) expect(history().getByText(text)).toBeInTheDocument();
});

test("the page checks again while a report is open, and picks up the admin's change", async () => {
  jest.useFakeTimers();
  try {
    const { calls } = mockApi({ ...base, "GET /api/tickets": { body: { tickets: [ticket()], blocked_reason: null } } });
    page();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    mockApi({ ...base, "GET /api/tickets": { body: { tickets: [ticket({ status: "in_progress" })], blocked_reason: null } } });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(TICKETS_POLL_MS);
    });
    expect(history().getByText("In Progress")).toBeInTheDocument();
    expect(calls.filter((c) => c.key === "GET /api/tickets").length).toBeGreaterThanOrEqual(1);
  } finally {
    jest.useRealTimers();
  }
});

test("when reports are paused for overdue bills, it says why and links to the bills", async () => {
  const reason = "New reports are paused until your overdue sanitation bills are paid. For anything urgent, contact us directly.";
  mockApi({ ...base, "GET /api/tickets": { body: { tickets: [ticket()], blocked_reason: reason } } });
  page();
  expect(await screen.findByText(reason)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "See my bills" })).toHaveAttribute("href", "/bills");
  expect(screen.queryByRole("button", { name: "Send report" })).not.toBeInTheDocument();
  expect(history().getByText("Pending")).toBeInTheDocument();
});

test("someone without a room is told when they can report", async () => {
  mockApi({ ...base, "GET /api/tickets": { body: { tickets: [], blocked_reason: "You can report issues once you've been given a room." } } });
  page();
  expect(await screen.findByText("You can report issues once you've been given a room.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "See my bills" })).not.toBeInTheDocument();
});

test("a refused report is explained", async () => {
  mockApi({
    ...base,
    "GET /api/tickets": { body: { tickets: [], blocked_reason: null } },
    "POST /api/tickets": { status: 403, body: { detail: "New reports are paused until your overdue sanitation bills are paid." } },
  });
  page();
  await userEvent.click(await screen.findByRole("button", { name: "General" }));
  await userEvent.type(screen.getByLabelText("Description"), "The corridor light is out.");
  await userEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(await screen.findByText("New reports are paused until your overdue sanitation bills are paid.")).toBeInTheDocument();
});
