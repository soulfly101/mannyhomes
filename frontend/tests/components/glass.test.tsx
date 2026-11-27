// The shared liquid-glass pieces (DESIGN.md → Glass).
import { act, render, screen, waitFor } from "@testing-library/react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { GlassPanel } from "@/components/ui/glass-panel";
import { GlassScene } from "@/components/ui/glass-scene";
import { PHOTOS } from "../../src/landing/content";
import { loadScenePhoto, resetScenePhoto } from "../../src/residences/scenePhoto";
import { mockApi } from "../helpers";
import { listings } from "../landing/fixtures";

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
};

afterEach(() => {
  // @ts-expect-error jsdom has no matchMedia; put it back the way it was.
  delete window.matchMedia;
  resetScenePhoto();
});

test("a glass panel can be any landmark, and can be made stronger for text over a photo", () => {
  render(
    <GlassPanel as="section" aria-label="Prices" strong className="p-4">
      Rent
    </GlassPanel>,
  );
  const panel = screen.getByRole("region", { name: "Prices" });
  expect(panel).toHaveClass("glass-panel", "glass-strong", "p-4");
});

test("a scene puts the photo and a tint behind the content, hidden from screen readers", () => {
  const { container } = render(
    <GlassScene photo="/photos/hero.jpg" fixed>
      <p>Content</p>
    </GlassScene>,
  );
  const scene = container.firstElementChild!;
  expect(scene).toHaveClass("glass-scene", "glass-scene-fixed");
  expect(scene.querySelector("img")).toHaveAttribute("src", "/photos/hero.jpg");
  expect(scene.querySelector("img")).toHaveAttribute("aria-hidden", "true");
  expect(scene.querySelector(".glass-scene-tint")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText("Content")).toBeInTheDocument();
});

test("numbers count up on screen, but screen readers and reduced-motion users get the value at once", async () => {
  setReducedMotion(true);
  const { container, rerender } = render(<AnimatedNumber value={1500} format={(n) => `GH₵ ${n}`} />);
  expect(screen.getByText("GH₵ 1500", { selector: ".sr-only" })).toBeInTheDocument();
  expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent("GH₵ 1500");
  rerender(<AnimatedNumber value={2000} format={(n) => `GH₵ ${n}`} />);
  expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent("GH₵ 2000");

  setReducedMotion(false);
  const counting = render(<AnimatedNumber value={40} />);
  expect(screen.getByText("40", { selector: ".sr-only" })).toBeInTheDocument();
  await waitFor(() => expect(counting.container.querySelector('[aria-hidden="true"]')).toHaveTextContent("40"), { timeout: 2000 });
});

test("the backdrop is the owner's first uploaded building photo", async () => {
  const data = listings(false);
  data.buildings[0].photos = ["outside1", "outside2"];
  mockApi({ "GET /api/listings": { body: data } });
  await expect(loadScenePhoto()).resolves.toBe("/api/photos/outside1/large.jpg");
});

test("without building photos it uses a room photo, and without any the stock photo", async () => {
  const rooms = listings(false);
  rooms.buildings[1].room_types[0].photos = ["lounge"];
  mockApi({ "GET /api/listings": { body: rooms } });
  await expect(loadScenePhoto()).resolves.toBe("/api/photos/lounge/large.jpg");

  resetScenePhoto();
  mockApi({ "GET /api/listings": { body: listings(false) } });
  await expect(loadScenePhoto()).resolves.toBe(PHOTOS.hero);

  resetScenePhoto();
  mockApi({ "GET /api/listings": { status: 500, body: {} } });
  await act(async () => {
    await expect(loadScenePhoto()).resolves.toBe(PHOTOS.hero);
  });
});
