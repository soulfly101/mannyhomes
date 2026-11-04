import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { ResidencesPage } from "../../src/residences/ResidencesPage";
import { AMA, googleOff, loggedOut, mockApi, renderAt } from "../helpers";
import { listings } from "../landing/fixtures";

const renderPage = (path = "/residences") =>
  renderAt(path, <Route path="/residences" element={<ResidencesPage />} />);

const list = () => within(screen.getByRole("list", { name: "Residences" }));
const roomLink = (name: string) => list().getByRole("link", { name: new RegExp(`^${name}`) });
const listingCalls = () => (global.fetch as jest.Mock).mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/listings"));

test("lists every room type with its building, each linking to its own page", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderPage();
  expect(await screen.findByRole("heading", { level: 2, name: "1 bedroom" })).toBeInTheDocument();
  expect(within(roomLink("2 bedroom")).getByText("Manny Building · Oyarifa")).toBeInTheDocument();
  expect(roomLink("2 bedroom")).toHaveAttribute("href", "/residences/r2");
  expect(roomLink("3 bedroom")).toHaveAttribute("href", "/residences/r3");
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
});

test("visitors see availability but no prices, with a way to log in", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderPage();
  await screen.findByRole("heading", { level: 2, name: "2 bedroom" });
  expect(within(roomLink("2 bedroom")).getByText("2 available")).toHaveAttribute("data-tone", "success");
  expect(within(roomLink("3 bedroom")).getByText("Fully booked")).toHaveAttribute("data-tone", "danger");
  expect(screen.queryByText(/GH₵/)).not.toBeInTheDocument();
  const prompt = screen.getByText(/to see prices\./);
  expect(within(prompt).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Fresidences");
});

test("logged-in users see the rent on each room", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) } });
  renderPage();
  await screen.findByRole("heading", { level: 2, name: "2 bedroom" });
  expect(within(roomLink("2 bedroom")).getByText("GH₵ 2,000 / month")).toBeInTheDocument();
  expect(screen.queryByText("to see prices.")).not.toBeInTheDocument();
});

test("location chips filter through the server and are kept in the address", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderPage();
  await screen.findByRole("heading", { level: 2, name: "1 bedroom" });
  await userEvent.click(screen.getByRole("button", { name: "Aburi" }));
  expect(screen.getByRole("button", { name: "Aburi" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("location")).toHaveTextContent("/residences?location=Aburi");
  await waitFor(() => expect(listingCalls()).toContain("/api/listings?location=Aburi"));
  await userEvent.click(screen.getByRole("button", { name: "All locations" }));
  expect(screen.getByTestId("location")).toHaveTextContent(/^\/residences$/);
});

test("the room type filter works with the location, and both stay in the address", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderPage("/residences?location=Aburi");
  await userEvent.click(await screen.findByRole("button", { name: "2 bedroom" }));
  expect(screen.getByRole("button", { name: "2 bedroom" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("location")).toHaveTextContent("/residences?location=Aburi&room_type=2+bedroom");
  await waitFor(() => expect(listingCalls()).toContain("/api/listings?location=Aburi&room_type=2+bedroom"));
  await userEvent.click(screen.getByRole("button", { name: "All room types" }));
  expect(screen.getByTestId("location")).toHaveTextContent(/^\/residences\?location=Aburi$/);
});

test("filters that match nothing say so", async () => {
  const empty = { ...listings(false), buildings: [] };
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: empty } });
  renderPage("/residences?room_type=Penthouse");
  expect(await screen.findByText(/Nothing matches those filters/)).toBeInTheDocument();
});

test("visitors are told how to see prices on each card", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderPage();
  await screen.findByRole("heading", { level: 2, name: "2 bedroom" });
  expect(within(roomLink("2 bedroom")).getByText("Log in for the price")).toBeInTheDocument();
});

test("opening a shared link keeps its location filter", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderPage("/residences?location=Oyarifa");
  await waitFor(() => expect(screen.getByRole("button", { name: "Oyarifa" })).toHaveAttribute("aria-pressed", "true"));
  expect(listingCalls()).toContain("/api/listings?location=Oyarifa");
});

test("a slow answer for an older location can't overwrite a newer one", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  const all = listings(false);
  const reply = (buildings: typeof all.buildings) => ({ ok: true, status: 200, json: async () => ({ ...all, buildings }) }) as Response;
  let releaseAburi: () => void = () => {};
  let aburiRead = false;
  const authFetch = global.fetch as jest.Mock;
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/listings") return Promise.resolve(reply(all.buildings));
    if (url === "/api/listings?location=Aburi") {
      const late = { ok: true, status: 200, json: async () => ((aburiRead = true), { ...all, buildings: [all.buildings[1]] }) } as Response;
      return new Promise<Response>((r) => (releaseAburi = () => r(late)));
    }
    if (url === "/api/listings?location=Oyarifa") return Promise.resolve(reply([all.buildings[0]]));
    return authFetch(input, init);
  }) as unknown as typeof fetch;

  renderPage();
  await screen.findByRole("heading", { level: 2, name: "3 bedroom" });
  await userEvent.click(screen.getByRole("button", { name: "Aburi" }));
  await userEvent.click(screen.getByRole("button", { name: "Oyarifa" }));
  await waitFor(() => expect(screen.queryByRole("heading", { level: 2, name: "3 bedroom" })).not.toBeInTheDocument());
  releaseAburi();
  await waitFor(() => expect(aburiRead).toBe(true));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(screen.queryByRole("heading", { level: 2, name: "3 bedroom" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "2 bedroom" })).toBeInTheDocument();
});

test("explains when nothing is listed or loading fails", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: { buildings: [], filters: { locations: [], room_types: [] }, prices_visible: false } } });
  const { unmount } = renderPage();
  expect(await screen.findByText(/No residences are listed yet/)).toBeInTheDocument();
  unmount();
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { status: 500, body: { detail: "Something broke." } } });
  renderPage();
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
});

test("location chips pop out on hover only when the device allows motion", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderPage();
  const chips = within(await screen.findByRole("group", { name: "Choose a location" })).getAllByRole("button");
  for (const chip of chips) {
    expect(chip.className).toContain("hover:shadow-sm");
    const moves = chip.className.split(/\s+/).filter((c) => /translate|scale/.test(c));
    expect(moves).toEqual(expect.arrayContaining(["motion-safe:hover:scale-105", "motion-safe:hover:-translate-y-0.5"]));
    for (const c of moves) expect(c).toMatch(/^motion-safe:/);
  }
});

test("the page title is the page's main heading", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderPage();
  expect(screen.getByRole("heading", { level: 1, name: "Find a place you'll love" })).toBeInTheDocument();
  await screen.findByRole("heading", { level: 2, name: "1 bedroom" });
});
