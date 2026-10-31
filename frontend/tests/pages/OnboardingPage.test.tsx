import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { OnboardingPage } from "../../src/pages/OnboardingPage";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";

const KOFI = { ...AMA, name: "Kofi Asante", phone: null, needs_onboarding: true };

const routes = (
  <>
    <Route
      path="/onboarding"
      element={
        <RequireAuth>
          <OnboardingPage />
        </RequireAuth>
      }
    />
    <Route path="*" element={<p>elsewhere</p>} />
  </>
);

test("saves the phone number and continues", async () => {
  const { calls } = mockApi({
    "GET /api/auth/me": { body: KOFI },
    ...googleOff,
    "PATCH /api/auth/me": { body: { ...KOFI, phone: "+233241234567", needs_onboarding: false } },
  });
  renderAt("/onboarding?next=/bookings", routes);
  expect(await screen.findByRole("heading", { name: "Welcome, Kofi" })).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText("Phone number"), "024 123 4567");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/bookings"));
  expect(calls.find((c) => c.key === "PATCH /api/auth/me")!.body).toEqual({ phone: "024 123 4567" });
});

test("rejects numbers that aren't Ghanaian", async () => {
  const { calls } = mockApi({ "GET /api/auth/me": { body: KOFI }, ...googleOff });
  renderAt("/onboarding", routes);
  await userEvent.type(await screen.findByLabelText("Phone number"), "999");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a Ghana phone number");
  expect(calls.some((c) => c.key === "PATCH /api/auth/me")).toBe(false);
});

test("logged-out visitors are sent to log in", async () => {
  mockApi({ "GET /api/auth/me": { status: 401 }, ...googleOff });
  renderAt("/onboarding?next=/bookings", routes);
  await waitFor(() =>
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/login?next=%2Fonboarding%3Fnext%3D%2Fbookings",
    ),
  );
});
