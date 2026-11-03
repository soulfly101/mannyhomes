import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AuthProvider } from "../../src/auth/AuthContext";
import { Hero } from "../../src/landing/Hero";
import { HERO } from "../../src/landing/content";
import { AMA, googleOff, loggedOut, mockApi } from "../helpers";

const renderHero = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Hero />
      </AuthProvider>
    </MemoryRouter>,
  );

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = jest.fn().mockImplementation((q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
};

beforeEach(() => setReducedMotion(false));

test("shows the headline, subtitle and a button to the residences", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderHero();
  expect(screen.getByRole("heading", { level: 1, name: "Your next chapter starts here." })).toBeInTheDocument();
  expect(screen.getByText(HERO.subtitle)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Explore residences" })).toHaveAttribute("href", "/residences");
  const nav = screen.getByRole("navigation", { name: "Main" });
  for (const [name, href] of [["Residences", "/residences"], ["Facilities", "/#facilities"], ["Location", "/#location"], ["Contact", "/#contact"]]) {
    expect(nav.querySelector(`a[href="${href}"]`)).toHaveTextContent(name);
  }
});

test("plays the building video muted and looping, with the photo as poster", () => {
  mockApi({ ...loggedOut, ...googleOff });
  const { container } = renderHero();
  const video = container.querySelector("video")!;
  expect(video).toHaveAttribute("src", HERO.video);
  expect(video).toHaveAttribute("poster", HERO.poster);
  expect(video.muted).toBe(true);
  expect(video).toHaveAttribute("loop");
  expect(video).toHaveAttribute("playsinline");
});

test("falls back to the photo when the video file is missing", () => {
  mockApi({ ...loggedOut, ...googleOff });
  const { container } = renderHero();
  fireEvent.error(container.querySelector("video")!);
  expect(container.querySelector("video")).toBeNull();
  expect(container.querySelector("img")).toHaveAttribute("src", HERO.poster);
});

test("shows the photo instead of the video for people who prefer less motion", () => {
  setReducedMotion(true);
  mockApi({ ...loggedOut, ...googleOff });
  const { container } = renderHero();
  expect(container.querySelector("video")).toBeNull();
  expect(container.querySelector("img")).toHaveAttribute("src", HERO.poster);
});

test("visitors see log in and sign up", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderHero();
  expect(await screen.findAllByRole("link", { name: "Sign up" })).not.toHaveLength(0);
  expect(screen.getAllByRole("link", { name: "Log in" })[0]).toHaveAttribute("href", "/login");
});

test("logged-in tenants see their name and can log out", async () => {
  const { calls } = mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "POST /api/auth/logout": { status: 204 } });
  renderHero();
  expect((await screen.findAllByText("Ama Mensah"))[0]).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Buildings" })).not.toBeInTheDocument();
  await userEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]);
  await waitFor(() => expect(calls.some((c) => c.key === "POST /api/auth/logout")).toBe(true));
});

test("admins also get a link to Buildings", async () => {
  mockApi({ "GET /api/auth/me": { body: { ...AMA, role: "admin" } }, ...googleOff });
  renderHero();
  expect((await screen.findAllByRole("link", { name: "Buildings" }))[0]).toHaveAttribute("href", "/admin/buildings");
});

test("on phones the menu opens and closes", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderHero();
  const toggle = screen.getByRole("button", { name: "Open menu" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
  expect(document.getElementById("mobile-menu")).toHaveTextContent("Facilities");
  await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
  expect(document.getElementById("mobile-menu")).toBeNull();
});

test("menu links and buttons move on hover only when the device allows motion", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  renderHero();
  const nav = screen.getByRole("navigation", { name: "Main" });
  const links = [...nav.querySelectorAll("ul a"), await screen.findByRole("link", { name: "Log in" })];
  for (const link of links) {
    expect(link.className).toContain("hover:after:scale-x-100");
    expect(link.className).toContain("focus-visible:after:scale-x-100");
  }
  for (const el of [...links, screen.getByRole("link", { name: "Sign up" }), screen.getByRole("link", { name: "Explore residences" })]) {
    const moves = el.className.split(/\s+/).filter((c) => /translate|rotate/.test(c));
    expect(moves.length).toBeGreaterThan(0);
    for (const c of moves) expect(c).toMatch(/^motion-safe:/);
  }
});
