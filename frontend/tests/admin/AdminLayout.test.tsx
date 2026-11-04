import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "../../src/App";
import { AuthProvider } from "../../src/auth/AuthContext";
import { AMA, googleOff, mockApi } from "../helpers";
import { asAdmin } from "./fixtures";

const renderApp = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );

const empty = { "GET /api/admin/buildings": { body: [] }, "GET /api/admin/allocations": { body: [] } };

test("admin pages have the sidebar, with the current section marked", async () => {
  mockApi({ ...asAdmin, ...empty });
  renderApp("/admin/allocations");
  const nav = within(await screen.findByRole("navigation", { name: "Admin" }));
  expect(nav.getByRole("link", { name: "Allocations" })).toHaveAttribute("aria-current", "page");
  expect(nav.getByRole("link", { name: "Buildings" })).toHaveAttribute("href", "/admin/buildings");
  expect(nav.getByRole("link", { name: "View website" })).toHaveAttribute("href", "/");
  expect(await screen.findByRole("heading", { level: 1, name: "Pending allocations" })).toBeInTheDocument();
});

test("the sidebar replaces the old top bar", async () => {
  mockApi({ ...asAdmin, ...empty });
  const { container } = renderApp("/admin/buildings");
  await screen.findByRole("navigation", { name: "Admin" });
  expect(container.querySelector(".topbar")).toBeNull();
});

test("the sidebar is on every admin page", async () => {
  mockApi({ ...asAdmin, ...empty });
  renderApp("/admin/buildings/new");
  expect(await screen.findByRole("navigation", { name: "Admin" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Add a building" })).toBeInTheDocument();
});

test("it shows initials, and logs out", async () => {
  const { calls } = mockApi({ ...asAdmin, ...empty, "POST /api/auth/logout": { status: 204 } });
  renderApp("/admin/buildings");
  await screen.findByRole("navigation", { name: "Admin" });
  await userEvent.click(screen.getByRole("button", { name: "Log out" }));
  await waitFor(() => expect(calls.some((c) => c.key === "POST /api/auth/logout")).toBe(true));
});

test("people without access get a way back instead of a dead end", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff });
  renderApp("/admin/buildings");
  expect(await screen.findByRole("heading", { name: "You don't have access to this page" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  expect(screen.queryByRole("navigation", { name: "Admin" })).not.toBeInTheDocument();
});
