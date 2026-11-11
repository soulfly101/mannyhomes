import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "../../src/App";
import { AuthProvider } from "../../src/auth/AuthContext";
import { formatMonth, timeAgo } from "../../src/format";
import { mockApi } from "../helpers";
import { asAdmin } from "./fixtures";

const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString().slice(0, 19);

const overview = (overrides = {}) => ({
  figures: { active_tenants: 3, rooms_available: 7, buildings: 2, waiting_for_room: 1, waiting_to_sign: 2, collected_this_month: 1500, collected_last_month: 1000, still_owed: 8000 },
  revenue: [
    { month: "2026-10", amount: 1000 },
    { month: "2026-11", amount: 1500 },
  ],
  stages: [
    { key: "payment", label: "Waiting for payment", count: 1 },
    { key: "room", label: "Waiting for a room", count: 1 },
    { key: "sign", label: "Waiting to sign", count: 2 },
    { key: "signed", label: "Signed", count: 0 },
  ],
  recent_tenants: [{ id: "t1", name: "Ama Mensah", email: "ama@example.com", status: "Room A12", tone: "success" }],
  activity: [{ kind: "payment", text: "Ama Mensah paid GH₵ 300 booking deposit", at: recent }],
  ...overrides,
});

const empty = overview({
  figures: { active_tenants: 0, rooms_available: 0, buildings: 0, waiting_for_room: 0, waiting_to_sign: 0, collected_this_month: 0, collected_last_month: 0, still_owed: 0 },
  revenue: [{ month: "2026-11", amount: 0 }],
  stages: [{ key: "payment", label: "Waiting for payment", count: 0 }],
  recent_tenants: [],
  activity: [],
});

const noPayments = {
  "GET /api/admin/overview/payments": {
    body: {
      period: "2026-11",
      fee: "all",
      building_id: null,
      groups: [
        { key: "paid", label: "Fully paid", count: 0, owed: 0 },
        { key: "partial", label: "Still owes something", count: 0, owed: 0 },
        { key: "unpaid", label: "Nothing paid", count: 0, owed: 0 },
      ],
      tenants: [],
      not_billed: 0,
      buildings: [],
    },
  },
};

const renderApp = (path = "/admin") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

test("the figures come from the API, with the change from last month in words", async () => {
  mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: overview() } });
  renderApp();
  expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  await screen.findByText("Active tenants");
  const stat = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement!;
  expect(within(stat("Active tenants")).getByText("3")).toBeInTheDocument();
  expect(within(stat("Active tenants")).getByText("2 waiting to sign")).toBeInTheDocument();
  expect(within(stat("Rooms available")).getByText("Across 2 buildings")).toBeInTheDocument();
  expect(within(stat("Waiting for a room")).getByRole("link", { name: "Open the queue" })).toHaveAttribute("href", "/admin/allocations");
  expect(within(stat("Collected this month")).getByText("GH₵ 1,500")).toBeInTheDocument();
  expect(screen.getByText("+50% from last month")).toBeInTheDocument();
  expect(screen.getByText("GH₵ 8,000 still owed")).toBeInTheDocument();
});

test("a fall from last month shows with a minus", async () => {
  const figures = { ...overview().figures, collected_this_month: 500, collected_last_month: 1000 };
  mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: overview({ figures }) } });
  renderApp();
  expect(await screen.findByText("-50% from last month")).toBeInTheDocument();
});

test("no change from last month isn't shown as good or bad", async () => {
  const figures = { ...overview().figures, collected_this_month: 1000, collected_last_month: 1000 };
  mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: overview({ figures }) } });
  renderApp();
  expect(await screen.findByText("Same as last month")).toBeInTheDocument();
});

test("the chart has a table for screen readers and a tooltip on hover", async () => {
  mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: overview() } });
  renderApp();
  const chart = await screen.findByRole("img", { name: "Money collected per month" });
  const table = within(screen.getByRole("table", { name: "Money collected per month" }));
  expect(table.getByText("Nov 2026")).toBeInTheDocument();
  expect(table.getByText("GH₵ 1,500")).toBeInTheDocument();
  fireEvent.pointerMove(chart); // jsdom has no pointer position, so this lands on the first month
  expect(within(screen.getByRole("status")).getByText("GH₵ 1,000")).toBeInTheDocument();
  fireEvent.pointerLeave(chart);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("changing the range asks for that many months", async () => {
  const { calls } = mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: overview() } });
  renderApp();
  await userEvent.selectOptions(await screen.findByLabelText("Time range"), "12");
  await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(([u]) => String(u).includes("months=12"))).toBe(true));
  expect(calls.length).toBeGreaterThan(0);
});

test("the ring labels every stage with its count, so colour is never alone", async () => {
  mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: overview() } });
  const { container } = renderApp();
  const stages = within(await screen.findByRole("list", { name: "Bookings by stage" }));
  expect(stages.getByText("Waiting to sign").closest("li")).toHaveTextContent("2 (50%)");
  expect(stages.getByText("Signed").closest("li")).toHaveTextContent("0 (0%)");
  // Stages with nothing in them don't draw a segment.
  expect(container.querySelector('[data-stage="signed"]')).toBeNull();
  fireEvent.pointerEnter(container.querySelector('[data-stage="sign"]')!);
  expect(within(screen.getByRole("img", { name: /Bookings by stage/ })).getByText("Waiting to sign")).toBeInTheDocument();
});

test("recent tenants show initials, not stock photos, and activity shows when", async () => {
  mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: overview() } });
  renderApp();
  const tenants = within(await screen.findByRole("region", { name: "Recent tenants" }));
  expect(tenants.getByRole("img", { name: "Ama Mensah" })).toHaveTextContent("AM");
  expect(tenants.getByText("Room A12")).toHaveAttribute("data-tone", "success");
  const activity = within(screen.getByRole("region", { name: "Recent activity" }));
  expect(activity.getByText("Ama Mensah paid GH₵ 300 booking deposit")).toBeInTheDocument();
  expect(activity.getByText("2 hours ago")).toBeInTheDocument();
});

test("with nothing yet it says so, rather than showing empty charts or made-up figures", async () => {
  mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: empty } });
  renderApp();
  expect(await screen.findByText(/No payments in this period yet/)).toBeInTheDocument();
  expect(screen.getByText(/No bookings yet/)).toBeInTheDocument();
  expect(screen.getByText(/No tenants have signed up yet/)).toBeInTheDocument();
  expect(screen.getByText(/Nothing yet\. Payments/)).toBeInTheDocument();
  expect(screen.getByText("Nothing collected yet")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Money collected per month" })).not.toBeInTheDocument();
});

test("problems loading are shown", async () => {
  mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { status: 500, body: { detail: "Something broke." } } });
  renderApp();
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
});

test("the sidebar has the dashboard, marked only on its own page", async () => {
  mockApi({ ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: overview() }, "GET /api/admin/buildings": { body: [] } });
  const { unmount } = renderApp();
  const nav = within(await screen.findByRole("navigation", { name: "Admin" }));
  expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  unmount();
  renderApp("/admin/buildings");
  const other = within(await screen.findByRole("navigation", { name: "Admin" }));
  expect(other.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
});

describe("dark and light", () => {
  const body = { ...asAdmin, ...noPayments, "GET /api/admin/overview": { body: overview() } };

  test("it starts dark, and the toggle switches and remembers", async () => {
    mockApi(body);
    const { unmount } = renderApp();
    await userEvent.click(await screen.findByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
    expect(localStorage.getItem("altheo-admin-theme")).toBe("light");
    unmount();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    renderApp();
    await screen.findByRole("button", { name: "Switch to dark mode" });
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  test("the first visit is dark", async () => {
    mockApi(body);
    renderApp();
    await screen.findByRole("button", { name: "Switch to light mode" });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  test("it only applies inside the admin area", async () => {
    mockApi({ ...body, "GET /api/listings": { body: { buildings: [], filters: { locations: [], room_types: [] }, prices_visible: true } } });
    const { unmount } = renderApp();
    await screen.findByRole("button", { name: "Switch to light mode" });
    unmount();
    renderApp("/residences");
    await screen.findByRole("heading", { level: 1, name: "Find a place you'll love" });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  test("it still works where the browser blocks saving", async () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mockApi(body);
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    setItem.mockRestore();
  });
});

test("time and month words", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  expect(timeAgo("2026-11-04T11:59:40", now)).toBe("Just now");
  expect(timeAgo("2026-11-04T11:59:00", now)).toBe("1 minute ago");
  expect(timeAgo("2026-11-04T09:00:00", now)).toBe("3 hours ago");
  expect(timeAgo("2026-11-02T12:00:00", now)).toBe("2 days ago");
  expect(timeAgo("2026-01-02T12:00:00", now)).toBe("2 Jan 2026");
  expect(formatMonth("2026-11")).toBe("Nov");
  expect(formatMonth("2026-11", true)).toBe("Nov 2026");
});
