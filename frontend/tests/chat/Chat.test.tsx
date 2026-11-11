import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { AdminConversationPage, AdminMessagesPage } from "../../src/admin/MessagesPage";
import { CHAT_POLL_MS, messageTime, type ChatMessage, type Conversation } from "../../src/chat/chat";
import { MessagesPage, TenantConversationPage } from "../../src/chat/MessagesPage";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";

const ESI = { id: "a1", name: "Esi Admin", email: "esi@example.com", phone: null, role: "admin", needs_onboarding: false };
const tenantBase = { "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/chat/unread": { body: { count: 0 } } };
const adminBase = { "GET /api/auth/me": { body: ESI }, ...googleOff };

const convo = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: "c1",
  title: "General",
  ticket_id: null,
  tenant_id: "u1",
  tenant_name: "Ama Mensah",
  last_message: "Is the water off today?",
  last_message_at: "2026-11-11T10:00:00",
  unread: 0,
  ...overrides,
});
const msg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({ id: 1, body: "Is the water off today?", from_admin: false, sender_name: "Ama Mensah", created_at: "2026-11-11T10:00:00", ...overrides });

const messages = () => within(screen.getByRole("list", { name: "Messages" }));

test("a tenant's conversations list, with unread counts, each linking to its page", async () => {
  mockApi({ ...tenantBase, "GET /api/chat": { body: [convo({ unread: 2 })] } });
  renderAt("/messages", <Route path="/messages" element={<MessagesPage />} />);
  const link = await screen.findByRole("link", { name: /General/ });
  expect(link).toHaveAttribute("href", "/messages/c1");
  expect(within(link).getByLabelText("2 unread")).toHaveTextContent("2");
});

test("Message us opens the general conversation", async () => {
  const { calls } = mockApi({ ...tenantBase, "GET /api/chat": { body: [] }, "POST /api/chat/open": { body: convo() } });
  renderAt("/messages", <Route path="/messages" element={<MessagesPage />} />);
  await userEvent.click(await screen.findByRole("button", { name: "Message us" }));
  expect(calls.find((c) => c.key === "POST /api/chat/open")!.body).toEqual({ ticket_id: null });
  expect(screen.getByTestId("location")).toHaveTextContent("/messages/c1");
});

test("a tenant reads the thread, theirs on one side and the team's on the other, and sends a message", async () => {
  const { calls } = mockApi({
    ...tenantBase,
    "GET /api/chat/c1": { body: { conversation: convo(), messages: [msg(), msg({ id: 2, body: "Yes, until 3pm.", from_admin: true, sender_name: "Esi Admin" })] } },
    "POST /api/chat/c1/messages": { status: 201, body: msg({ id: 3, body: "Thanks!" }) },
  });
  renderAt("/messages/c1", <Route path="/messages/:conversationId" element={<TenantConversationPage />} />);
  expect(await screen.findByRole("heading", { level: 1, name: "General" })).toBeInTheDocument();
  expect(messages().getByText(/^You ·/)).toBeInTheDocument();
  expect(messages().getByText(/Esi Admin, Altheo Homes/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Message"), "Thanks!{Enter}");
  expect(await messages().findByText("Thanks!")).toBeInTheDocument();
  expect(calls.find((c) => c.key === "POST /api/chat/c1/messages")!.body).toEqual({ body: "Thanks!" });
  expect(screen.getByLabelText("Message")).toHaveValue("");
});

test("Shift+Enter starts a new line instead of sending, and an empty message can't be sent", async () => {
  const { calls } = mockApi({ ...tenantBase, "GET /api/chat/c1": { body: { conversation: convo(), messages: [] } } });
  renderAt("/messages/c1", <Route path="/messages/:conversationId" element={<TenantConversationPage />} />);
  expect(await screen.findByText("No messages yet. Say hello.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Message"), "Line one{Shift>}{Enter}{/Shift}Line two");
  expect(screen.getByLabelText("Message")).toHaveValue("Line one\nLine two");
  expect(calls.some((c) => c.key === "POST /api/chat/c1/messages")).toBe(false);
});

test("new messages arrive by themselves, asking only for ones after the last", async () => {
  jest.useFakeTimers();
  try {
    let reply = { conversation: convo(), messages: [msg()] };
    const { calls } = mockApi({ ...tenantBase, "GET /api/chat/c1": () => ({ body: reply }) });
    renderAt("/messages/c1", <Route path="/messages/:conversationId" element={<TenantConversationPage />} />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    reply = { conversation: convo(), messages: [msg({ id: 2, body: "Yes, until 3pm.", from_admin: true, sender_name: "Esi Admin" })] };
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CHAT_POLL_MS);
    });
    expect(messages().getByText("Yes, until 3pm.")).toBeInTheDocument();
    expect(messages().getAllByRole("listitem")).toHaveLength(2);
    const asked = calls.filter((c) => c.key === "GET /api/chat/c1");
    expect(asked.length).toBeGreaterThanOrEqual(2);
    // The URL's query isn't part of the key, so check the last fetch's address directly.
    const lastUrl = String((global.fetch as jest.Mock).mock.calls.filter(([u]) => String(u).startsWith("/api/chat/c1?")).at(-1)[0]);
    expect(lastUrl).toBe("/api/chat/c1?after=1");
  } finally {
    jest.useRealTimers();
  }
});

test("a message that can't be sent says why and keeps the text", async () => {
  mockApi({
    ...tenantBase,
    "GET /api/chat/c1": { body: { conversation: convo(), messages: [] } },
    "POST /api/chat/c1/messages": { status: 400, body: { detail: "Keep messages under 2,000 characters." } },
  });
  renderAt("/messages/c1", <Route path="/messages/:conversationId" element={<TenantConversationPage />} />);
  await userEvent.type(await screen.findByLabelText("Message"), "Hello");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("Keep messages under 2,000 characters.")).toBeInTheDocument();
  expect(screen.getByLabelText("Message")).toHaveValue("Hello");
});

test("an admin lists conversations with the tenant's name, and starts one with any tenant", async () => {
  const { calls } = mockApi({
    ...adminBase,
    "GET /api/admin/chat/unread": { body: { count: 0 } },
    "GET /api/admin/chat": { body: [convo({ title: "Plumbing report, room A12", unread: 1 })] },
    "GET /api/admin/chat/tenants": { body: [{ id: "u1", name: "Ama Mensah", phone: "+233241234567" }, { id: "u2", name: "Kofi Boateng", phone: null }] },
    "POST /api/admin/chat/open": { body: convo({ id: "c2", tenant_id: "u2", tenant_name: "Kofi Boateng" }) },
  });
  renderAt("/admin/messages", <Route path="/admin/messages" element={<AdminMessagesPage />} />);
  expect(await screen.findByRole("link", { name: /Ama Mensah · Plumbing report, room A12/ })).toHaveAttribute("href", "/admin/messages/c1");
  await userEvent.click(screen.getByRole("button", { name: "Start chat" }));
  expect(screen.getByText("Choose a tenant.")).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Message a tenant"), "Kofi Boateng");
  await userEvent.click(screen.getByRole("button", { name: "Start chat" }));
  expect(calls.find((c) => c.key === "POST /api/admin/chat/open")!.body).toEqual({ tenant_id: "u2", ticket_id: null });
  expect(screen.getByTestId("location")).toHaveTextContent("/admin/messages/c2");
});

test("on the admin side, the admin's own messages are theirs", async () => {
  mockApi({ ...adminBase, "GET /api/admin/chat/c1": { body: { conversation: convo(), messages: [msg(), msg({ id: 2, body: "Yes, until 3pm.", from_admin: true, sender_name: "Esi Admin" })] } } });
  renderAt("/admin/messages/c1", <Route path="/admin/messages/:conversationId" element={<AdminConversationPage />} />);
  expect(await screen.findByRole("heading", { level: 1, name: "Ama Mensah · General" })).toBeInTheDocument();
  expect(messages().getByText(/^You ·/)).toBeInTheDocument();
  expect(messages().getByText(/^Ama Mensah ·/)).toBeInTheDocument();
});

test.each([
  ["2026-11-11T09:05:00", "09:05"],
  ["2026-11-07T14:30:00", "7 Nov, 14:30"],
])("%s shows as %s", (iso, expected) => {
  expect(messageTime(iso, new Date("2026-11-11T12:00:00"))).toBe(expected);
});
