import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { ResidenceDetailsPage } from "../../src/residences/ResidenceDetailsPage";
import { AMA, googleOff, loggedOut, mockApi, renderAt } from "../helpers";
import { listings } from "../landing/fixtures";
import { roomListing } from "./fixtures";

const renderDetails = (id = "r2") =>
  renderAt(`/residences/${id}`, <Route path="/residences/:roomTypeId" element={<ResidenceDetailsPage />} />);

const ADMIN = { ...AMA, id: "a1", name: "Kofi Admin", role: "admin" as const };

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

test("visitors see the room without its price, and Book now sends them to sign up first", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) }, "GET /api/listings/rooms/r2": { body: roomListing(false) } });
  renderDetails();
  expect(await screen.findByRole("heading", { level: 1, name: "2 bedroom" })).toBeInTheDocument();
  expect(screen.getByText("Manny Building · Oyarifa")).toBeInTheDocument();
  expect(screen.getByText("Bright corner flat.")).toBeInTheDocument();
  expect(screen.getByText("Log in to see the price")).toBeInTheDocument();
  expect(screen.getByText("2 available")).toHaveAttribute("data-tone", "success");
  expect(screen.getByRole("link", { name: "Book now" })).toHaveAttribute("href", "/register?next=%2Fresidences%2Fr2");
  expect(screen.getByRole("link", { name: /All residences/ })).toHaveAttribute("href", "/residences");
});

test("tenants see rent and sanitation, and Book now opens the booking page", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) }, "GET /api/listings/rooms/r2": { body: roomListing(true) } });
  renderDetails();
  expect(await screen.findByText("GH₵ 2,000 / month")).toBeInTheDocument();
  expect(screen.getByText("GH₵ 50 / month")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Book now" })).toHaveAttribute("href", "/book/r2");
});

test("admins can look but don't get a Book now button", async () => {
  mockApi({ "GET /api/auth/me": { body: ADMIN }, ...googleOff, "GET /api/listings": { body: listings(true) }, "GET /api/listings/rooms/r2": { body: roomListing(true) } });
  renderDetails();
  await screen.findByText("GH₵ 2,000 / month");
  expect(screen.queryByRole("link", { name: "Book now" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enquire" })).toBeInTheDocument();
});

test("fully booked rooms can't be booked, only enquired about", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) }, "GET /api/listings/rooms/r2": { body: roomListing(false, 0) } });
  renderDetails();
  expect(await screen.findByText("Fully booked")).toHaveAttribute("data-tone", "danger");
  expect(screen.queryByRole("link", { name: "Book now" })).not.toBeInTheDocument();
  expect(screen.getByText(/Fully booked right now/)).toBeInTheDocument();
});

test("Enquire fills in the contact form on the same page", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) }, "GET /api/listings/rooms/r2": { body: roomListing(false) } });
  renderDetails();
  await screen.findByRole("heading", { level: 1, name: "2 bedroom" });
  await waitFor(() => expect(screen.getByLabelText("Residence of interest")).toHaveTextContent("2 bedroom"));
  await userEvent.click(screen.getByRole("button", { name: "Enquire" }));
  await waitFor(() => expect(screen.getByLabelText("Residence of interest")).toHaveValue("r2"));
  expect(screen.getByLabelText(/Message/)).toHaveValue("I'm interested in a 2 bedroom at Manny Building, Oyarifa.");
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

test("an unknown or unlisted room says it isn't available", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) }, "GET /api/listings/rooms/gone": { status: 404, body: { detail: "That residence isn't available." } } });
  renderDetails("gone");
  expect(await screen.findByRole("heading", { level: 1, name: "This residence isn't available" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "See all residences" })).toHaveAttribute("href", "/residences");
});

test("other loading problems are shown", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) }, "GET /api/listings/rooms/r2": { status: 500, body: { detail: "Something broke." } } });
  renderDetails();
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
});
