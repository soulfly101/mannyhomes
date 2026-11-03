import { act, render } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { ScrollManager } from "../src/ScrollManager";

let sectionTop = 24;

beforeEach(() => {
  jest.useFakeTimers();
  sectionTop = 24;
  Element.prototype.scrollIntoView = jest.fn();
  document.documentElement.scrollTo = jest.fn();
});
afterEach(() => jest.useRealTimers());

const scroll = () => Element.prototype.scrollIntoView as jest.Mock;
const toTop = () => document.documentElement.scrollTo as jest.Mock;

function page(path: string) {
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollManager />
      <section id="facilities">Facilities</section>
      <Link to="/residences">Residences</Link>
      <Link to="/#facilities">Facilities link</Link>
      <Link to="/residences?location=Aburi">Aburi</Link>
    </MemoryRouter>,
  );
  const section = document.getElementById("facilities")!;
  section.getBoundingClientRect = () => ({ top: sectionTop }) as DOMRect;
  return utils;
}

const tick = (ms: number) => act(() => jest.advanceTimersByTime(ms));

test("arriving on a /#section link jumps to the section and re-aims when content above it loads", () => {
  page("/#facilities");
  expect(scroll()).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  tick(200);
  scroll().mockClear();
  tick(300);
  expect(scroll()).not.toHaveBeenCalled(); // nothing moved, so nothing to do
  sectionTop = 900; // the residences preview loaded above it and pushed it down
  tick(100);
  expect(scroll()).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
});

test("it stops following the section once the person scrolls", () => {
  page("/#facilities");
  tick(200);
  act(() => {
    window.dispatchEvent(new Event("wheel"));
  });
  scroll().mockClear();
  sectionTop = 900;
  tick(300);
  expect(scroll()).not.toHaveBeenCalled();
});

test("it stops following the section after a moment", () => {
  page("/#facilities");
  tick(1600);
  scroll().mockClear();
  sectionTop = 900;
  tick(300);
  expect(scroll()).not.toHaveBeenCalled();
});

test("a section link on the same page scrolls smoothly", async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  page("/");
  await user.click(document.querySelector('a[href="/#facilities"]')!);
  expect(scroll()).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
});

test("new pages start at the top, but changing a filter on the same page doesn't jump", async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  page("/");
  expect(toTop()).toHaveBeenCalledWith({ top: 0 });
  toTop().mockClear();
  await user.click(document.querySelector('a[href="/residences"]')!);
  expect(toTop()).toHaveBeenCalledWith({ top: 0 });
  toTop().mockClear();
  await user.click(document.querySelector('a[href="/residences?location=Aburi"]')!);
  expect(toTop()).not.toHaveBeenCalled();
});
