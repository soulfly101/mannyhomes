import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import * as authBrand from "../../src/pages/AuthBrand";
import { LoginPage } from "../../src/pages/LoginPage";
import { AMA, googleOff, googleOn, loggedOut, mockApi, renderAt } from "../helpers";

const routes = (
  <>
    <Route path="/login" element={<LoginPage />} />
    <Route path="*" element={<p>elsewhere</p>} />
  </>
);

test("logs in and goes to the page in next", async () => {
  const { calls } = mockApi({ ...loggedOut, ...googleOff, "POST /api/auth/login": { body: AMA } });
  renderAt("/login?next=/bookings", routes);

  await userEvent.type(screen.getByLabelText("Email address"), "ama@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/bookings"));
  const login = calls.find((c) => c.key === "POST /api/auth/login")!;
  expect(login.body).toEqual({ email: "ama@example.com", password: "correct horse" });
  expect(login.headers["X-Requested-With"]).toBe("altheo");
});

test("shows the server's error when the password is wrong", async () => {
  mockApi({
    ...loggedOut,
    ...googleOff,
    "POST /api/auth/login": { status: 401, body: { detail: "That email and password don't match. Try again." } },
  });
  renderAt("/login", routes);

  await userEvent.type(screen.getByLabelText("Email address"), "ama@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "wrong one");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("That email and password don't match. Try again.");
  expect(screen.getByTestId("location")).toHaveTextContent("/login");
});

test("asks for both fields before calling the server", async () => {
  const { calls } = mockApi({ ...loggedOut, ...googleOff });
  renderAt("/login", routes);
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter your email and password.");
  expect(calls.some((c) => c.key === "POST /api/auth/login")).toBe(false);
});

test("ignores next values that leave the site", async () => {
  mockApi({ ...loggedOut, ...googleOff, "POST /api/auth/login": { body: AMA } });
  renderAt("/login?next=//evil.example", routes);
  await userEvent.type(screen.getByLabelText("Email address"), "ama@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/"));
});

test("sends Google users without a phone to onboarding", async () => {
  mockApi({ ...loggedOut, ...googleOff, "POST /api/auth/login": { body: { ...AMA, needs_onboarding: true } } });
  renderAt("/login?next=/bookings", routes);
  await userEvent.type(screen.getByLabelText("Email address"), "ama@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() =>
    expect(screen.getByTestId("location")).toHaveTextContent("/onboarding?next=%2Fbookings"),
  );
});

test("Continue with Google is shown when set up and starts Google sign-in", async () => {
  const start = jest.spyOn(authBrand, "startGoogleSignIn").mockImplementation(() => {});
  mockApi({ ...loggedOut, ...googleOn });
  renderAt("/login?next=/bookings", routes);
  await userEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
  expect(start).toHaveBeenCalledWith("/bookings");
  start.mockRestore();
});

test("hides Continue with Google when it isn't set up", async () => {
  const { fetchMock } = mockApi({ ...loggedOut, ...googleOff });
  renderAt("/login", routes);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
});

test.each([
  ["google", "Google sign-in didn't work."],
  ["google_cancelled", "Google sign-in was cancelled."],
])("explains a failed Google sign-in (%s)", async (code, message) => {
  mockApi({ ...loggedOut, ...googleOn });
  renderAt(`/login?error=${code}`, routes);
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
});

test("links to sign up, keeping next", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderAt("/login?next=/bookings", routes);
  await userEvent.click(await screen.findByRole("button", { name: "Create an account" }));
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/register?next=%2Fbookings"));
});

test("the password can be shown and hidden", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderAt("/login", routes);
  const password = screen.getByLabelText("Password");
  expect(password).toHaveAttribute("type", "password");
  await userEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(password).toHaveAttribute("type", "text");
  await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect(password).toHaveAttribute("type", "password");
});

test("the log in button shows it's working and can't be pressed twice", async () => {
  let finish: (v: unknown) => void = () => {};
  mockApi({ ...loggedOut, ...googleOff, "POST /api/auth/login": () => ({ body: AMA }) });
  const realFetch = global.fetch;
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    String(input) === "/api/auth/login" ? new Promise((r) => (finish = () => r(realFetch(input, init)))) : realFetch(input, init),
  ) as unknown as typeof fetch;
  renderAt("/login", routes);
  await userEvent.type(screen.getByLabelText("Email address"), "ama@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  const busy = await screen.findByRole("button", { name: "Please wait…" });
  expect(busy).toBeDisabled();
  finish(undefined);
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/dashboard"));
});

test("tenants with no next go to their dashboard; others go home", async () => {
  mockApi({ "GET /api/auth/me": { status: 401 }, ...googleOff, "POST /api/auth/login": { body: AMA } });
  const { unmount } = renderAt("/login", routes);
  await userEvent.type(await screen.findByLabelText("Email address"), "ama@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/dashboard"));
  unmount();
  mockApi({ "GET /api/auth/me": { status: 401 }, ...googleOff, "POST /api/auth/login": { body: { ...AMA, role: "admin" } } });
  renderAt("/login", routes);
  await userEvent.type(await screen.findByLabelText("Email address"), "admin@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/"));
});
