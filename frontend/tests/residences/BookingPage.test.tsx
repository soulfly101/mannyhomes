import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { BookingPage } from "../../src/residences/BookingPage";
import { AMA, googleOff, loggedOut, mockApi, renderAt } from "../helpers";
import { listings } from "../landing/fixtures";
import { booking, roomListing } from "./fixtures";

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
      <Route path="/bookings/:id" element={<p>Booking status page</p>} />
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
  expect(screen.getByRole("heading", { name: "Pay the booking deposit" })).toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "Booking steps" })).getByText("Pay").closest("li")).toHaveAttribute("aria-current", "step");
  expect(screen.getByRole("link", { name: /Back to 2 bedroom/ })).toHaveAttribute("href", "/residences/r2");
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


const asTenant = (quantity = 2, deposit: number | null = 300) => {
  const listing = roomListing(true, quantity);
  listing.room.booking_deposit = deposit;
  return { "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) }, "GET /api/listings/rooms/r2": { body: listing } };
};
const chooseMtn = () => userEvent.click(screen.getByRole("button", { name: "MTN MoMo" }));

test("the form starts with the tenant's phone number and the amount on the button", async () => {
  mockApi(asTenant());
  renderBooking();
  expect(await screen.findByLabelText("Mobile Money number")).toHaveValue("0241234567");
  expect(screen.getByRole("button", { name: "Pay GH₵ 300" })).toBeInTheDocument();
  for (const name of ["MTN MoMo", "Telecel Cash", "AT Money"]) expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
});

test("paying creates the booking, sends the prompt and moves to the booking's own page", async () => {
  const { calls } = mockApi({ ...asTenant(), "POST /api/bookings": { status: 201, body: booking() }, "POST /api/bookings/bk1/pay": { body: booking({ payment: { status: "pending", message: null } }) } });
  renderBooking();
  const phone = await screen.findByLabelText("Mobile Money number");
  await userEvent.clear(phone);
  await userEvent.type(phone, "055 123 4987");
  await chooseMtn();
  expect(screen.getByRole("button", { name: "MTN MoMo" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "Pay GH₵ 300" }));
  expect(await screen.findByText("Booking status page")).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent("/bookings/bk1");
  expect(calls.find((c) => c.key === "POST /api/bookings")!.body).toEqual({ room_type_id: "r2" });
  expect(calls.find((c) => c.key === "POST /api/bookings/bk1/pay")!.body).toEqual({ phone: "055 123 4987", network: "mtn" });
});

test("the number and network are checked before anything is sent", async () => {
  const { calls } = mockApi(asTenant());
  renderBooking();
  const phone = await screen.findByLabelText("Mobile Money number");
  await userEvent.clear(phone);
  await userEvent.type(phone, "123");
  await userEvent.click(screen.getByRole("button", { name: "Pay GH₵ 300" }));
  expect(screen.getByText("Enter a Ghana phone number, like 024 123 4567.")).toBeInTheDocument();
  expect(screen.getByText("Choose your Mobile Money network.")).toBeInTheDocument();
  expect(calls.some((c) => c.key === "POST /api/bookings")).toBe(false);
});

test("problems from the server are shown and the form can be used again", async () => {
  mockApi({ ...asTenant(), "POST /api/bookings": { status: 409, body: { detail: "This residence has just been fully booked." } } });
  renderBooking();
  await screen.findByLabelText("Mobile Money number");
  await chooseMtn();
  await userEvent.click(screen.getByRole("button", { name: "Pay GH₵ 300" }));
  expect(await screen.findByText("This residence has just been fully booked.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pay GH₵ 300" })).toBeEnabled();
});

test("a room with no deposit set can only be enquired about, which fills in the contact form", async () => {
  mockApi(asTenant(2, 0));
  renderBooking();
  expect(await screen.findByRole("heading", { name: "Online booking isn't open for this residence yet" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Mobile Money number")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("Residence of interest")).toHaveTextContent("2 bedroom"));
  await userEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Enquire" }));
  await waitFor(() => expect(screen.getByLabelText("Residence of interest")).toHaveValue("r2"));
});
