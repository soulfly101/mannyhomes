import { act, render, screen } from "@testing-library/react";
import { Reveal, sideFor } from "../../src/components/Reveal";

type Callback = (entries: { isIntersecting: boolean }[]) => void;
let trigger: Callback = () => {};
const observe = jest.fn();
const disconnect = jest.fn();

const installObserver = () => {
  global.IntersectionObserver = jest.fn((cb: Callback) => {
    trigger = cb;
    return { observe, disconnect, unobserve: jest.fn() };
  }) as unknown as typeof IntersectionObserver;
};
const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = jest.fn().mockImplementation((q: string) => ({ matches: reduce && q.includes("reduce"), media: q }));
};

beforeEach(() => {
  observe.mockClear();
  disconnect.mockClear();
  installObserver();
  setReducedMotion(false);
});
afterEach(() => {
  delete (global as { IntersectionObserver?: unknown }).IntersectionObserver;
});

const shown = () => screen.getByText("Photo").getAttribute("data-visible");

test("stays waiting until it scrolls into view, then animates once", () => {
  render(<Reveal>Photo</Reveal>);
  expect(shown()).toBe("false");
  expect(observe).toHaveBeenCalledTimes(1);
  act(() => trigger([{ isIntersecting: false }]));
  expect(shown()).toBe("false");
  act(() => trigger([{ isIntersecting: true }]));
  expect(shown()).toBe("true");
  expect(disconnect).toHaveBeenCalled();
});

test.each([
  ["left", "reveal-left"],
  ["right", "reveal-right"],
  ["up", "reveal-up"],
] as const)("from %s uses %s", (from, cls) => {
  render(<Reveal from={from}>Photo</Reveal>);
  expect(screen.getByText("Photo")).toHaveClass("reveal", cls);
});

test("comes up from below by default, and can wait to stagger a row", () => {
  render(<Reveal delay={160}>Photo</Reveal>);
  const el = screen.getByText("Photo");
  expect(el).toHaveClass("reveal-up");
  expect(el.style.getPropertyValue("--reveal-delay")).toBe("160ms");
});

test("shows straight away for people who ask for reduced motion", () => {
  setReducedMotion(true);
  render(<Reveal>Photo</Reveal>);
  expect(shown()).toBe("true");
  expect(observe).not.toHaveBeenCalled();
});

test("shows straight away where the browser can't watch scrolling", () => {
  delete (global as { IntersectionObserver?: unknown }).IntersectionObserver;
  render(<Reveal>Photo</Reveal>);
  expect(shown()).toBe("true");
});

test("can render as another element", () => {
  render(
    <ul>
      <Reveal as="li">Photo</Reveal>
    </ul>,
  );
  expect(screen.getByRole("listitem")).toHaveTextContent("Photo");
});

test("photos alternate sides", () => {
  expect([0, 1, 2, 3].map(sideFor)).toEqual(["left", "right", "left", "right"]);
});
