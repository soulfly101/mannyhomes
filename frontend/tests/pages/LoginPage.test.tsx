import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
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

  await userEvent.type(screen.getByLabelText("Email"), "ama@example.com");
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

  await userEvent.type(screen.getByLabelText("Email"), "ama@example.com");
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
  await userEvent.type(screen.getByLabelText("Email"), "ama@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/"));
});

test("sends Google users without a phone to onboarding", async () => {
  mockApi({ ...loggedOut, ...googleOff, "POST /api/auth/login": { body: { ...AMA, needs_onboarding: true } } });
  renderAt("/login?next=/bookings", routes);
  await userEvent.type(screen.getByLabelText("Email"), "ama@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() =>
    expect(screen.getByTestId("location")).toHaveTextContent("/onboarding?next=%2Fbookings"),
  );
});

test("shows Continue with Google only when it's set up", async () => {
  mockApi({ ...loggedOut, ...googleOn });
  renderAt("/login?next=/bookings", routes);
  const google = await screen.findByRole("link", { name: "Continue with Google" });
  expect(google).toHaveAttribute("href", "/api/auth/google/start?next=%2Fbookings");
});

test("hides Continue with Google when it isn't set up", async () => {
  const { fetchMock } = mockApi({ ...loggedOut, ...googleOff });
  renderAt("/login", routes);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("link", { name: "Continue with Google" })).not.toBeInTheDocument();
});

test.each([
  ["google", "Google sign-in didn't work."],
  ["google_cancelled", "Google sign-in was cancelled."],
])("explains a failed Google sign-in (%s)", async (code, message) => {
  mockApi({ ...loggedOut, ...googleOn });
  renderAt(`/login?error=${code}`, routes);
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
});
