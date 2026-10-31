import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AuthProvider } from "../../src/auth/AuthContext";
import { TopBar } from "../../src/components";
import { AMA, googleOff, mockApi } from "../helpers";
import { asAdmin } from "./fixtures";

const renderBar = () =>
  render(
    <MemoryRouter initialEntries={["/admin/buildings"]}>
      <AuthProvider>
        <TopBar />
      </AuthProvider>
    </MemoryRouter>,
  );

test("admins get a Buildings link, marked as the current page", async () => {
  mockApi(asAdmin);
  renderBar();
  const link = await screen.findByRole("link", { name: "Buildings" });
  expect(link).toHaveAttribute("href", "/admin/buildings");
  expect(link).toHaveAttribute("aria-current", "page");
});

test("tenants don't see admin links", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff });
  renderBar();
  await screen.findByText("Ama Mensah");
  expect(screen.queryByRole("link", { name: "Buildings" })).not.toBeInTheDocument();
});
