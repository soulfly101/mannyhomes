import { screen, waitFor } from "@testing-library/react";
import { Route } from "react-router";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { safeNext } from "../../src/auth/safeNext";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";

const routes = (
  <>
    <Route
      path="/account"
      element={
        <RequireAuth>
          <p>private page</p>
        </RequireAuth>
      }
    />
    <Route path="*" element={<p>elsewhere</p>} />
  </>
);

test("shows the page to logged-in people", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff });
  renderAt("/account", routes);
  expect(await screen.findByText("private page")).toBeInTheDocument();
});

test("sends logged-out visitors to log in and back afterwards", async () => {
  mockApi({ "GET /api/auth/me": { status: 401 }, ...googleOff });
  renderAt("/account?tab=bills", routes);
  await waitFor(() =>
    expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Faccount%3Ftab%3Dbills"),
  );
  expect(screen.queryByText("private page")).not.toBeInTheDocument();
});

test("sends people without a phone to onboarding first", async () => {
  mockApi({ "GET /api/auth/me": { body: { ...AMA, phone: null, needs_onboarding: true } }, ...googleOff });
  renderAt("/account", routes);
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/onboarding?next=%2Faccount"));
});

test.each([
  ["/bookings", "/bookings"],
  ["/a?b=c", "/a?b=c"],
  ["//evil.example", "/"],
  ["https://evil.example", "/"],
  ["/\\evil", "/"],
  [null, "/"],
])("safeNext(%s) is %s", (value, expected) => {
  expect(safeNext(value)).toBe(expected);
});
