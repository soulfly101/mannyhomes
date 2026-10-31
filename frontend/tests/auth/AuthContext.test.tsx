import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AuthProvider } from "../../src/auth/AuthContext";
import { TopBar } from "../../src/components";
import { AMA, googleOff, mockApi } from "../helpers";

function renderTopBar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TopBar />
      </AuthProvider>
    </MemoryRouter>,
  );
}

test("shows log in and sign up to visitors", async () => {
  mockApi({ "GET /api/auth/me": { status: 401 }, ...googleOff });
  renderTopBar();
  expect(await screen.findByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
  expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
});

test("shows the user's name and logs them out", async () => {
  const { calls } = mockApi({
    "GET /api/auth/me": { body: AMA },
    ...googleOff,
    "POST /api/auth/logout": { status: 204 },
  });
  renderTopBar();
  expect(await screen.findByText("Ama Mensah")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Log out" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument());
  expect(calls.some((c) => c.key === "POST /api/auth/logout")).toBe(true);
});

test("treats a network failure while checking login as logged out", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
  renderTopBar();
  expect(await screen.findByRole("link", { name: "Log in" })).toBeInTheDocument();
  warn.mockRestore();
});
