import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { BookingPage } from "../../src/residences/BookingPage";
import { AMA, googleOff, loggedOut, mockApi, renderAt } from "../helpers";
import { listings } from "../landing/fixtures";
import { roomListing } from "./fixtures";

const renderBooking = () =>
  renderAt(
    "/book/r2",
    <>
      <Route
        path="/book/:roomTypeId"
        element={
          <RequireAuth roles={["tenant"]}>
            <BookingPage />
          </RequireAuth>
        }
      />
      <Route path="/login" element={<p>Login page</p>} />
    </>,
  );

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

test("visitors are sent to log in and brought back afterwards", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderBooking();
  expect(await screen.findByText("Login page")).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent("/login?next=%2Fbook%2Fr2");
});

test("tenants see a summary of the room they're booking", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) }, "GET /api/listings/rooms/r2": { body: roomListing(true) } });
  renderBooking();
  expect(await screen.findByRole("heading", { level: 1, name: "Book a 2 bedroom" })).toBeInTheDocument();
  expect(screen.getByText("Manny Building · Oyarifa")).toBeInTheDocument();
  expect(screen.getByText("GH₵ 2,000 / month")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Online booking opens soon" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to 2 bedroom/ })).toHaveAttribute("href", "/residences/r2");
});

test("Enquire on the booking page fills in the contact form", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) }, "GET /api/listings/rooms/r2": { body: roomListing(true) } });
  renderBooking();
  await screen.findByRole("heading", { level: 1, name: "Book a 2 bedroom" });
  await waitFor(() => expect(screen.getByLabelText("Residence of interest")).toHaveTextContent("2 bedroom"));
  await userEvent.click(screen.getByRole("button", { name: "Enquire" }));
  await waitFor(() => expect(screen.getByLabelText("Residence of interest")).toHaveValue("r2"));
});

test("a fully booked room says so", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) }, "GET /api/listings/rooms/r2": { body: roomListing(true, 0) } });
  renderBooking();
  expect(await screen.findByRole("heading", { name: "Fully booked right now" })).toBeInTheDocument();
});

test("staff and admins can't book", async () => {
  mockApi({ "GET /api/auth/me": { body: { ...AMA, role: "admin" } }, ...googleOff });
  renderBooking();
  expect(await screen.findByRole("heading", { name: "You don't have access to this page" })).toBeInTheDocument();
});
