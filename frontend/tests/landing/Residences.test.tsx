import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AuthProvider } from "../../src/auth/AuthContext";
import { Residences } from "../../src/landing/Residences";
import { AMA, googleOff, loggedOut, mockApi } from "../helpers";
import { listings } from "./fixtures";

const renderResidences = (onEnquire = jest.fn()) =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Residences onEnquire={onEnquire} />
      </AuthProvider>
    </MemoryRouter>,
  );

const row = (name: string) => screen.getByRole("heading", { name }).closest("li")!;

test("lists every room type with its building, collapsed at first", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderResidences();
  expect(await screen.findByRole("heading", { name: "1 bedroom" })).toBeInTheDocument();
  expect(within(row("2 bedroom")).getByText("Manny Building · Oyarifa")).toBeInTheDocument();
  expect(within(row("3 bedroom")).getByText("Apartment B · Aburi")).toBeInTheDocument();
  expect(screen.queryByText("Availability")).not.toBeInTheDocument();
});

test("visitors see details without the price and are asked to sign up", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderResidences();
  await screen.findByRole("heading", { name: "2 bedroom" });
  const toggle = within(row("2 bedroom")).getByRole("button", { name: /View details/ });
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const details = within(row("2 bedroom"));
  expect(details.getByText("Log in to see the price")).toBeInTheDocument();
  expect(details.getByText("2 available")).toHaveAttribute("data-tone", "success");
  expect(details.getByRole("link", { name: "Check availability" })).toHaveAttribute("href", "/register?next=%2F%23residences");
});

test("logged-in users see rent and sanitation", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff, "GET /api/listings": { body: listings(true) } });
  renderResidences();
  await screen.findByRole("heading", { name: "2 bedroom" });
  await userEvent.click(within(row("2 bedroom")).getByRole("button", { name: /View details/ }));
  const details = within(row("2 bedroom"));
  expect(details.getByText("GH₵ 2,000 / month")).toBeInTheDocument();
  expect(details.getByText("GH₵ 50 / month")).toBeInTheDocument();
  expect(details.queryByRole("link", { name: "Check availability" })).not.toBeInTheDocument();
  expect(details.getByText(/Online booking opens soon/)).toBeInTheDocument();
});

test("fully booked rooms say so", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderResidences();
  await screen.findByRole("heading", { name: "3 bedroom" });
  await userEvent.click(within(row("3 bedroom")).getByRole("button", { name: /View details/ }));
  expect(within(row("3 bedroom")).getByText("Fully booked")).toHaveAttribute("data-tone", "danger");
});

test("only one residence is open at a time and it can be closed", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderResidences();
  await screen.findByRole("heading", { name: "1 bedroom" });
  await userEvent.click(within(row("1 bedroom")).getByRole("button", { name: /View details/ }));
  await userEvent.click(within(row("2 bedroom")).getByRole("button", { name: /View details/ }));
  expect(within(row("1 bedroom")).getByRole("button", { name: /View details/ })).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(within(row("2 bedroom")).getByRole("button", { name: /Close/ }));
  expect(screen.queryByText("Availability")).not.toBeInTheDocument();
});

test("Enquire passes the residence on", async () => {
  const onEnquire = jest.fn();
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderResidences(onEnquire);
  await screen.findByRole("heading", { name: "2 bedroom" });
  await userEvent.click(within(row("2 bedroom")).getByRole("button", { name: /View details/ }));
  await userEvent.click(within(row("2 bedroom")).getByRole("button", { name: "Enquire" }));
  expect(onEnquire).toHaveBeenCalledWith(expect.objectContaining({ id: "r2", name: "2 bedroom", building: "Manny Building" }));
});

test("location chips ask the server for that location", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: listings(false) } });
  renderResidences();
  await screen.findByRole("heading", { name: "1 bedroom" });
  await userEvent.click(screen.getByRole("button", { name: "Aburi" }));
  expect(screen.getByRole("button", { name: "Aburi" })).toHaveAttribute("aria-pressed", "true");
  await waitFor(() =>
    expect((global.fetch as jest.Mock).mock.calls.some(([u]) => u === "/api/listings?location=Aburi")).toBe(true),
  );
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

  renderResidences();
  await screen.findByRole("heading", { name: "3 bedroom" });
  await userEvent.click(screen.getByRole("button", { name: "Aburi" }));
  await userEvent.click(screen.getByRole("button", { name: "Oyarifa" }));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "3 bedroom" })).not.toBeInTheDocument());
  releaseAburi();
  await waitFor(() => expect(aburiRead).toBe(true));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(screen.queryByRole("heading", { name: "3 bedroom" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "2 bedroom" })).toBeInTheDocument();
});

test("explains when nothing is listed or loading fails", async () => {
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { body: { buildings: [], filters: { locations: [], room_types: [] }, prices_visible: false } } });
  const { unmount } = renderResidences();
  expect(await screen.findByText(/No residences are listed yet/)).toBeInTheDocument();
  unmount();
  mockApi({ ...loggedOut, ...googleOff, "GET /api/listings": { status: 500, body: { detail: "Something broke." } } });
  renderResidences();
  expect(await screen.findByRole("alert")).toHaveTextContent("Something broke.");
});
