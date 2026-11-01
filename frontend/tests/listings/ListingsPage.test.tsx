import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import type { ListingsResponse } from "../../src/listings/types";
import { ListingsPage } from "../../src/listings/ListingsPage";
import { AMA, googleOff, loggedOut, mockApi, renderAt } from "../helpers";

const routes = <Route path="/" element={<ListingsPage />} />;

const room = (id: string, name: string, qty: number, rent: number | null) => ({
  id,
  name,
  description: null,
  quantity_available: qty,
  rent,
  sanitation_fee: rent === null ? null : 50,
});

function response(pricesVisible: boolean): ListingsResponse {
  const price = (n: number) => (pricesVisible ? n : null);
  return {
    prices_visible: pricesVisible,
    filters: { locations: ["Aburi", "Oyarifa"], room_types: ["1 bedroom", "2 bedroom", "3 bedroom"] },
    buildings: [
      {
        id: "b1",
        name: "Manny Building",
        location: "Oyarifa",
        description: "Quiet compound near the main road.",
        total_available: 3,
        fully_booked: false,
        room_types: [room("r1", "1 bedroom", 1, price(1200)), room("r2", "2 bedroom", 2, price(2000))],
      },
      {
        id: "b2",
        name: "Apartment B",
        location: "Aburi",
        description: null,
        total_available: 0,
        fully_booked: true,
        room_types: [room("r3", "3 bedroom", 0, price(2600))],
      },
    ],
  };
}

test("visitors see buildings, locations and availability but not prices", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: response(false) } });
  renderAt("/", routes);

  const manny = await screen.findByRole("article", { name: "Manny Building" });
  expect(within(manny).getByText("Oyarifa")).toBeInTheDocument();
  expect(within(manny).getByText("Quiet compound near the main road.")).toBeInTheDocument();
  const rows = within(manny).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("1 bedroom");
  expect(within(rows[0]).getByText("Log in for price")).toBeInTheDocument();
  expect(within(rows[1]).getByText("2 available")).toHaveClass("pill-ok");
  expect(within(manny).getByText("3 available")).toHaveClass("pill-ok");
  expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
  expect(screen.getByText("2 buildings · 3 apartments available")).toBeInTheDocument();
});

test("logged-in users see monthly rent", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: response(true) } });
  renderAt("/", routes);
  const manny = await screen.findByRole("article", { name: "Manny Building" });
  expect(within(manny).getAllByRole("listitem")[1]).toHaveTextContent("GH₵ 2,000/mo");
  expect(screen.queryByText("Log in for price")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
});

test("fully booked buildings are flagged, not hidden", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: response(false) } });
  renderAt("/", routes);
  const aburi = await screen.findByRole("article", { name: "Apartment B" });
  expect(aburi).toHaveClass("is-full");
  expect(within(aburi).getAllByText("Fully booked")[0]).toHaveClass("pill-danger");
});

test("filters ask the server and are kept in the address", async () => {
  const { calls } = mockApi({
    ...loggedOut,
    ...googleOff,
    "GET /api/listings": { body: response(false) },
  });
  renderAt("/", routes);
  await screen.findByRole("article", { name: "Manny Building" });

  await userEvent.selectOptions(screen.getByLabelText("Location"), "Aburi");
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/?location=Aburi"));
  await userEvent.selectOptions(screen.getByLabelText("Room type"), "2 bedroom");
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("type=2+bedroom"));

  const urls = calls.filter((c) => c.key === "GET /api/listings").length;
  expect(urls).toBe(3);
  const last = (global.fetch as jest.Mock).mock.calls.at(-1)![0] as string;
  expect(last).toBe("/api/listings?location=Aburi&room_type=2+bedroom");

  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/"));
});

test("filters in the address are applied on load", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: response(false) } });
  renderAt("/?location=Oyarifa", routes);
  await screen.findByRole("article", { name: "Manny Building" });
  expect(screen.getByLabelText("Location")).toHaveValue("Oyarifa");
  expect((global.fetch as jest.Mock).mock.calls.some(([u]) => u === "/api/listings?location=Oyarifa")).toBe(true);
});

test("explains when filters match nothing", async () => {
  mockApi({
    ...loggedOut,
    ...googleOff,
    "GET /api/listings": { body: { ...response(false), buildings: [] } },
  });
  renderAt("/?location=Aburi&type=1+bedroom", routes);
  expect(await screen.findByRole("heading", { name: "Nothing matches those filters" })).toBeInTheDocument();
});

test("explains when nothing is listed yet", async () => {
  mockApi({
    ...loggedOut,
    ...googleOff,
    "GET /api/listings": { body: { buildings: [], filters: { locations: [], room_types: [] }, prices_visible: false } },
  });
  renderAt("/", routes);
  expect(await screen.findByRole("heading", { name: "No apartments listed yet" })).toBeInTheDocument();
});

test("shows an error if listings can't load", async () => {
  mockApi({
    ...loggedOut,
    ...googleOff,
    "GET /api/listings": { status: 500, body: { detail: "Something broke." } },
  });
  renderAt("/", routes);
  expect(await screen.findByRole("alert")).toHaveTextContent("Something broke.");
});

test("a slow answer to an older filter can't overwrite a newer one", async () => {
  mockApi({ ...loggedOut, ...googleOff });
  const all = response(false);
  const reply = (buildings: typeof all.buildings) =>
    ({ ok: true, status: 200, json: async () => ({ ...all, buildings }) }) as Response;
  let releaseAburi: () => void = () => {};
  let aburiRead = false;
  const authFetch = global.fetch as jest.Mock;
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/listings") return Promise.resolve(reply(all.buildings));
    // The Aburi answer is slow; Oyarifa answers at once.
    if (url === "/api/listings?location=Aburi") {
      const late = {
        ok: true,
        status: 200,
        json: async () => {
          aburiRead = true;
          return { ...all, buildings: [all.buildings[1]] };
        },
      } as Response;
      return new Promise<Response>((r) => (releaseAburi = () => r(late)));
    }
    if (url === "/api/listings?location=Oyarifa") return Promise.resolve(reply([all.buildings[0]]));
    return authFetch(input, init);
  }) as unknown as typeof fetch;

  renderAt("/", routes);
  await screen.findByRole("article", { name: "Apartment B" });
  await userEvent.selectOptions(screen.getByLabelText("Location"), "Aburi");
  await userEvent.selectOptions(screen.getByLabelText("Location"), "Oyarifa");
  await waitFor(() => expect(screen.queryByRole("article", { name: "Apartment B" })).not.toBeInTheDocument());

  releaseAburi();
  await waitFor(() => expect(aburiRead).toBe(true));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(screen.getByRole("article", { name: "Manny Building" })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "Apartment B" })).not.toBeInTheDocument();
});
