import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { AdminLayout } from "../../src/admin/AdminLayout";
import { TicketsPage } from "../../src/admin/TicketsPage";
import { SiteHeader } from "../../src/landing/SiteHeader";
import { RepairsPage } from "../../src/tickets/RepairsPage";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";

const ESI = { id: "a1", name: "Esi Admin", email: "esi@example.com", phone: null, role: "admin", needs_onboarding: false };

test("tenants see how many messages are waiting next to Messages", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/chat/unread": { body: { count: 3 } } });
  renderAt("/", <Route path="/" element={<SiteHeader />} />);
  const link = (await screen.findAllByRole("link", { name: /Messages/ }))[0];
  expect(link).toHaveAttribute("href", "/messages");
  expect(await within(link).findByLabelText("3 unread messages")).toBeInTheDocument();
});

test("no badge when nothing is waiting, and visitors aren't asked at all", async () => {
  const { calls } = mockApi({ "GET /api/auth/me": { status: 401, body: {} }, ...googleOff });
  renderAt("/", <Route path="/" element={<SiteHeader />} />);
  await screen.findAllByRole("link", { name: "Log in" });
  expect(calls.some((c) => c.key === "GET /api/chat/unread")).toBe(false);
});

test("admins see the unread count on Messages in the sidebar", async () => {
  mockApi({ "GET /api/auth/me": { body: ESI }, ...googleOff, "GET /api/admin/chat/unread": { body: { count: 5 } } });
  renderAt("/admin", <Route element={<AdminLayout />}><Route path="/admin" element={<p>Home</p>} /></Route>);
  const link = await screen.findByRole("link", { name: /Messages/ });
  expect(link).toHaveAttribute("href", "/admin/messages");
  expect(await within(link).findByLabelText("5 unread messages")).toBeInTheDocument();
});

const ticket = { id: "t1", category: "plumbing", description: "The kitchen tap drips all night.", status: "pending", room_number: "A12", building: "Manny Building", created_at: "2026-11-07T10:00:00", updated_at: "2026-11-07T10:00:00" };

test("a tenant opens a chat straight from a repair report", async () => {
  const { calls } = mockApi({
    "GET /api/auth/me": { body: AMA },
    ...googleOff,
    "GET /api/chat/unread": { body: { count: 0 } },
    "GET /api/tickets": { body: { tickets: [ticket], blocked_reason: null } },
    "POST /api/chat/open": { body: { id: "c9" } },
  });
  renderAt("/repairs", <Route path="/repairs" element={<RepairsPage />} />);
  await userEvent.click(await screen.findByRole("button", { name: /Chat about this: Plumbing/ }));
  expect(calls.find((c) => c.key === "POST /api/chat/open")!.body).toEqual({ ticket_id: "t1" });
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/messages/c9"));
});

test("an admin opens a chat with the tenant from their report", async () => {
  const { calls } = mockApi({
    "GET /api/auth/me": { body: ESI },
    ...googleOff,
    "GET /api/admin/tickets": { body: [{ ...ticket, tenant_id: "u1", tenant_name: "Ama Mensah", tenant_phone: null }] },
    "POST /api/admin/chat/open": { body: { id: "c9" } },
  });
  renderAt("/admin/tickets", <Route path="/admin/tickets" element={<TicketsPage />} />);
  await userEvent.click(await screen.findByRole("button", { name: "Chat with Ama Mensah about this report" }));
  expect(calls.find((c) => c.key === "POST /api/admin/chat/open")!.body).toEqual({ tenant_id: "u1", ticket_id: "t1" });
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/messages/c9"));
});

test("one waiting message reads as one message", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/chat/unread": { body: { count: 1 } } });
  renderAt("/", <Route path="/" element={<SiteHeader />} />);
  const link = (await screen.findAllByRole("link", { name: /Messages/ }))[0];
  expect(await within(link).findByLabelText("1 unread message")).toBeInTheDocument();
});
