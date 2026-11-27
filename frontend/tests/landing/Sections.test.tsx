import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AuthProvider } from "../../src/auth/AuthContext";
import { CallToAction } from "../../src/landing/CallToAction";
import { EXPERIENCE, FACILITIES, GALLERY } from "../../src/landing/content";
import { Experience } from "../../src/landing/Experience";
import { Facilities } from "../../src/landing/Facilities";
import { Footer } from "../../src/landing/Footer";
import { Gallery } from "../../src/landing/Gallery";
import { LandingPage } from "../../src/landing/LandingPage";
import { LocationSection } from "../../src/landing/LocationSection";
import { calls as mapCalls, reset as resetMap } from "../mocks/leaflet";
import { googleOff, loggedOut, mockApi } from "../helpers";
import { listings } from "./fixtures";

beforeEach(() => {
  resetMap();
  window.matchMedia = jest.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollIntoView = jest.fn();
});

test("the experience section shows the four selling points", () => {
  render(<Experience />);
  for (const p of EXPERIENCE.points) expect(screen.getByRole("heading", { name: p.title })).toBeInTheDocument();
});

test("facilities show every item with its caption", () => {
  render(<Facilities />);
  for (const f of FACILITIES.items) expect(screen.getByRole("heading", { name: f.title })).toBeInTheDocument();
});

test("the gallery switches photos by room type", async () => {
  render(<Gallery />);
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map((t) => t.textContent)).toEqual(GALLERY.tabs.map((t) => t.label));
  expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  await userEvent.click(tabs[1]);
  expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  expect(within(screen.getByRole("tabpanel")).getAllByRole("img")[0]).toHaveAccessibleName(`${GALLERY.tabs[1].label}, photo 1`);
});

test("the call to action leads to the contact form", () => {
  render(<CallToAction />);
  expect(screen.getByRole("link", { name: "Book a viewing" })).toHaveAttribute("href", "#contact");
});

test("the location section pins known areas and lists their buildings", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  render(<LocationSection />);
  expect(await screen.findByRole("button", { name: "Oyarifa" })).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByRole("list", { name: "Buildings in Oyarifa" })).getByText("Manny Building")).toBeInTheDocument();
  await waitFor(() => expect(mapCalls.markers.map((m) => m.title).sort()).toEqual(["Aburi", "Oyarifa"]));
  expect(mapCalls.tiles[0]).toContain("tile.openstreetmap.org");

  await userEvent.click(screen.getByRole("button", { name: "Aburi" }));
  expect(within(screen.getByRole("list", { name: "Buildings in Aburi" })).getByText("Fully booked")).toBeInTheDocument();
  expect(mapCalls.setView.at(-1)).toEqual([5.8484, -0.1746]);
});

test("clicking a map pin selects that area", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  render(<LocationSection />);
  await waitFor(() => expect(mapCalls.markers.length).toBeGreaterThan(0));
  const aburi = mapCalls.markers.find((m) => m.title === "Aburi")!;
  aburi.click!();
  await waitFor(() => expect(screen.getByRole("button", { name: "Aburi" })).toHaveAttribute("aria-pressed", "true"));
});

test("the whole landing page renders, with a preview of the residences linking to their own pages", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  render(
    <MemoryRouter>
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    </MemoryRouter>,
  );
  for (const id of ["residences", "facilities", "location", "contact"]) expect(document.getElementById(id)).not.toBeNull();
  const preview = within(await screen.findByRole("list", { name: "Featured residences" }));
  const cards = preview.getAllByRole("link");
  // Rooms that are free come first; the fully booked 3 bedroom is last.
  expect(cards.map((c) => c.getAttribute("href"))).toEqual(["/residences/r1", "/residences/r2", "/residences/r3"]);
  expect(preview.getByText("2 available")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View all residences" })).toHaveAttribute("href", "/residences");
  expect(screen.queryByRole("button", { name: /View details/ })).not.toBeInTheDocument();
  const footer = within(screen.getByRole("navigation", { name: "Footer" }));
  expect(footer.getByRole("link", { name: "Residences" })).toHaveAttribute("href", "/residences");
  expect(footer.getByRole("link", { name: "Facilities" })).toHaveAttribute("href", "/#facilities");
});

test("the preview shows rooms that are free before fully booked ones, three at most", async () => {
  const many = listings(false);
  many.buildings[1].room_types.push(
    { id: "r4", name: "Studio", description: null, quantity_available: 3, rent: null, sanitation_fee: null, booking_deposit: null },
    { id: "r5", name: "Penthouse", description: null, quantity_available: 1, rent: null, sanitation_fee: null, booking_deposit: null },
  );
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: many } });
  render(
    <MemoryRouter>
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    </MemoryRouter>,
  );
  const cards = within(await screen.findByRole("list", { name: "Featured residences" })).getAllByRole("link");
  expect(cards).toHaveLength(3);
  expect(cards.map((c) => c.getAttribute("href"))).not.toContain("/residences/r3");
});

test("the footer ends with the copyright line, with no decorative drawing", () => {
  mockApi({ ...loggedOut, ...googleOff });
  const { container } = render(
    <MemoryRouter>
      <AuthProvider>
        <Footer residences={[]} enquiry={null} />
      </AuthProvider>
    </MemoryRouter>,
  );
  const footer = container.querySelector("footer")!;
  expect(footer.querySelector('svg[viewBox="0 0 1200 120"]')).toBeNull();
  expect(footer.lastElementChild).toHaveTextContent(/© \d{4} Altheo Homes\. All rights reserved\./);
});
