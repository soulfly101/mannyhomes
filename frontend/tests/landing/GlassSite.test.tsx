// The public site's liquid glass (DESIGN.md → Glass): dark glass menu and headline, glass captions on
// residence cards, the room page over its own photo, and the call to action.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route } from "react-router";
import { AuthProvider } from "../../src/auth/AuthContext";
import { CallToAction } from "../../src/landing/CallToAction";
import { CALL_TO_ACTION } from "../../src/landing/content";
import { Hero } from "../../src/landing/Hero";
import { SiteHeader } from "../../src/landing/SiteHeader";
import { ResidenceCard } from "../../src/residences/ResidenceCard";
import { ResidenceDetailsPage } from "../../src/residences/ResidenceDetailsPage";
import { ResidencesPage } from "../../src/residences/ResidencesPage";
import { LandingPage } from "../../src/landing/LandingPage";
import { LoginPage } from "../../src/pages/LoginPage";
import { StatusPage } from "../../src/pages/StatusPage";
import { resetScenePhoto } from "../../src/residences/scenePhoto";
import type { Residence } from "../../src/residences/data";
import { googleOff, loggedOut, mockApi, renderAt } from "../helpers";
import { listings } from "./fixtures";
import { roomListing } from "../residences/fixtures";

const inRouter = (ui: React.ReactElement) =>
  render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );

const TWO_BED: Residence = { id: "r2", name: "2 bedroom", description: "Bright corner flat.", quantity: 2, rent: 2000, sanitation: 50, bookingDeposit: 300, building: "Manny Building", location: "Oyarifa", photos: ["cover2"] };

beforeEach(() => {
  resetScenePhoto();
  Element.prototype.scrollIntoView = jest.fn();
});

test("the menu bar is dark glass, so its white text stays readable over the page", () => {
  mockApi({ ...loggedOut, ...googleOff });
  const { container } = inRouter(<SiteHeader />);
  expect(container.querySelector("header")).toHaveClass("glass-rail", "glass-ink", "sticky");
});

test("the home headline sits on dark glass over the owner's own building photo once uploaded", async () => {
  const data = listings(false);
  data.buildings[0].photos = ["outside1"];
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: data } });
  const { container } = inRouter(<Hero />);
  const headline = screen.getByRole("heading", { level: 1 });
  expect(headline.closest(".glass-panel")).toHaveClass("glass-ink");
  await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("poster", "/api/photos/outside1/large.jpg"));
});

test("a residence card's details sit on a glass caption over its cover photo", () => {
  const { container } = render(
    <MemoryRouter>
      <ul>
        <ResidenceCard r={TWO_BED} index={0} />
      </ul>
    </MemoryRouter>,
  );
  const link = screen.getByRole("link");
  expect(link.querySelector("img")).toHaveAttribute("src", "/api/photos/cover2/thumb.jpg");
  const caption = container.querySelector(".glass-panel.glass-strong")!;
  expect(within(caption as HTMLElement).getByRole("heading", { name: "2 bedroom" })).toBeInTheDocument();
  expect(caption).toHaveTextContent("2 available");
  expect(caption).toHaveTextContent("GH₵ 2,000 / month");
  expect(caption).toHaveTextContent("Manny Building · Oyarifa");
});

test("the room page sits on a frosted stage over the room's own photo", async () => {
  const listing = roomListing(true);
  listing.room.photos = ["inside", "outside"];
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) }, "GET /api/listings/rooms/r2": { body: listing } });
  const { container } = renderAt("/residences/r2", <Route path="/residences/:roomTypeId" element={<ResidenceDetailsPage />} />);
  const title = await screen.findByRole("heading", { level: 1, name: "2 bedroom" });
  expect(title.closest(".glass-stage")).not.toBeNull();
  expect(container.querySelector(".glass-scene-photo")).toHaveAttribute("src", "/api/photos/inside/large.jpg");
  expect(screen.getByRole("complementary", { name: "Price and booking" })).toHaveClass("glass-panel");
});

test("the call to action is a glass panel over the lounge photo, still leading to the contact form", () => {
  const { container } = render(<CallToAction />);
  const heading = screen.getByRole("heading", { name: CALL_TO_ACTION.title });
  expect(heading.closest(".glass-panel")).not.toBeNull();
  expect(container.querySelector(".glass-scene-photo")).toHaveAttribute("src", CALL_TO_ACTION.photo);
  expect(screen.getByRole("link", { name: CALL_TO_ACTION.button })).toHaveAttribute("href", "#contact");
});

test("every other public page sits on a frosted stage over the building photo, footer included", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  const { container } = renderAt("/residences", <Route path="/residences" element={<ResidencesPage />} />);
  const heading = await screen.findByRole("heading", { level: 1 });
  expect(heading.closest(".glass-stage")).not.toBeNull();
  expect(container.querySelector(".glass-scene-fixed > .glass-scene-photo")).toHaveAttribute("src", "/photos/hero.jpg");
  expect(container.querySelector("footer")).toHaveClass("glass-panel", "glass-stage");
});

test("log in is a glass form over the building photo", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderAt("/login", <Route path="/login" element={<LoginPage />} />);
  const heading = await screen.findByRole("heading", { level: 1 });
  expect(heading.closest(".glass-panel")).toHaveClass("glass-strong");
  expect(document.querySelector(".glass-scene-photo")).toHaveAttribute("src", "/photos/hero.jpg");
});

test("the home page's sections each sit on their own glass pane", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderAt("/", <Route path="/" element={<LandingPage />} />);
  for (const id of ["experience-title", "facilities-title", "gallery-title"]) {
    await waitFor(() => expect(document.getElementById(id)?.closest(".glass-stage")).not.toBeNull());
  }
});

test("the status page shows its card over the building photo", () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) }, "GET /api/health": { body: { status: "ok" } }, "GET /api/health/db": { body: { database: "ok" } } });
  renderAt("/status", <Route path="/status" element={<StatusPage />} />);
  expect(screen.getByRole("region", { name: "System status" })).toHaveClass("glass-panel");
  expect(document.querySelector(".glass-scene-photo")).not.toBeNull();
});

test("the home hero stays above the pinned building photo behind the sections", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderAt("/", <Route path="/" element={<LandingPage />} />);
  const hero = await screen.findByRole("heading", { level: 1, name: "Your next chapter starts here." });
  // The sections' photo is position: fixed, so without its own layer the hero would be painted under it.
  expect(hero.closest("header")).toHaveClass("relative", "z-10");
});
