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
  expect(mapCalls.tiles[0]).toContain("basemaps.cartocdn.com/light_all");

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

test("the whole landing page renders, and Enquire fills in the contact form", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  render(
    <MemoryRouter>
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    </MemoryRouter>,
  );
  for (const id of ["residences", "facilities", "location", "contact"]) expect(document.getElementById(id)).not.toBeNull();
  const twoBed = (await screen.findByRole("heading", { name: "2 bedroom" })).closest("li")!;
  await userEvent.click(within(twoBed).getByRole("button", { name: /View details/ }));
  await userEvent.click(within(twoBed).getByRole("button", { name: "Enquire" }));
  await waitFor(() => expect(screen.getByLabelText("Residence of interest")).toHaveValue("r2"));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  expect(within(screen.getByRole("navigation", { name: "Footer" })).getByRole("link", { name: "Residences" })).toHaveAttribute("href", "#residences");
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
