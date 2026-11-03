import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { RegisterPage } from "../../src/pages/RegisterPage";
import { AMA, googleOff, loggedOut, mockApi, renderAt } from "../helpers";

const routes = (
  <>
    <Route path="/register" element={<RegisterPage />} />
    <Route path="*" element={<p>elsewhere</p>} />
  </>
);

async function fill(values: Partial<Record<"name" | "phone" | "email" | "password", string>>) {
  const labels = { name: "Full name", phone: "Phone number", email: "Email address", password: "Password" } as const;
  for (const [key, value] of Object.entries(values)) {
    await userEvent.type(screen.getByLabelText(labels[key as keyof typeof labels]), value);
  }
}

test("creates the account and goes to next", async () => {
  const { calls } = mockApi({ ...loggedOut, ...googleOff, "POST /api/auth/register": { status: 201, body: AMA } });
  renderAt("/register?next=/bookings", routes);
  await fill({ name: "Ama Mensah", phone: "024 123 4567", email: "ama@example.com", password: "correct horse" });
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/bookings"));
  expect(calls.find((c) => c.key === "POST /api/auth/register")!.body).toEqual({
    name: "Ama Mensah",
    phone: "024 123 4567",
    email: "ama@example.com",
    password: "correct horse",
  });
});

test("checks the fields before calling the server", async () => {
  const { calls } = mockApi({ ...loggedOut, ...googleOff });
  renderAt("/register", routes);
  await fill({ name: "A", phone: "12345", email: "nope", password: "short" });
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(screen.getByLabelText("Full name")).toHaveAccessibleDescription("Enter your full name.");
  expect(screen.getByLabelText("Phone number")).toHaveAccessibleDescription(
    expect.stringContaining("Enter a Ghana phone number, like 024 123 4567."),
  );
  expect(screen.getByLabelText("Email address")).toHaveAccessibleDescription("Enter a valid email address.");
  expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
    expect.stringContaining("Use at least 8 characters for your password."),
  );
  expect(calls.some((c) => c.key === "POST /api/auth/register")).toBe(false);
});

test("shows the server's message when the email is taken", async () => {
  mockApi({
    ...loggedOut,
    ...googleOff,
    "POST /api/auth/register": {
      status: 409,
      body: { detail: "An account with that email already exists. Log in instead." },
    },
  });
  renderAt("/register", routes);
  await fill({ name: "Ama Mensah", phone: "0241234567", email: "ama@example.com", password: "correct horse" });
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
});

test("puts the server's field errors on the right fields", async () => {
  mockApi({
    ...loggedOut,
    ...googleOff,
    "POST /api/auth/register": {
      status: 422,
      body: { detail: "Enter a valid email address.", errors: { email: "Enter a valid email address." } },
    },
  });
  renderAt("/register", routes);
  await fill({ name: "Ama Mensah", phone: "0241234567", email: "ama@localhost.lan", password: "correct horse" });
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Email address")).toHaveAccessibleDescription("Enter a valid email address."),
  );
});

test("clears a field's error once it's edited", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderAt("/register", routes);
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");
  await userEvent.type(screen.getByLabelText("Full name"), "Ama");
  expect(screen.getByLabelText("Full name")).not.toHaveAttribute("aria-invalid");
});

test("links to log in, keeping next", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderAt("/register?next=/bookings", routes);
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Fbookings"));
});

test("hints explain the phone and password rules", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderAt("/register", routes);
  expect(screen.getByLabelText("Phone number")).toHaveAccessibleDescription("For Mobile Money payments and updates about your home.");
  expect(screen.getByLabelText("Password")).toHaveAccessibleDescription("At least 8 characters.");
});
