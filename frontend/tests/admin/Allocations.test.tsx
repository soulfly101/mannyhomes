import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { AllocatePage } from "../../src/admin/AllocatePage";
import { AllocationsPage } from "../../src/admin/AllocationsPage";
import type { PendingAllocation } from "../../src/admin/allocations";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { AMA, googleOff, mockApi, renderAt } from "../helpers";
import { asAdmin } from "./fixtures";

const pending = (overrides: Partial<PendingAllocation> = {}): PendingAllocation => ({
  booking_id: "bk1",
  tenant: { id: "t1", name: "Ama Mensah", email: "ama@example.com", phone: "+233241234567" },
  room: "2 bedroom",
  building: "Manny Building",
  location: "Oyarifa",
  booking_deposit: 300,
  paid_at: "2026-11-03T10:00:00",
  rent: 2000,
  sanitation_fee: 50,
  renting_deposit: 4000,
  rooms_left: 2,
  taken_rooms: ["A1", "A2"],
  blocked_reason: null,
  blocked_fix: null,
  ...overrides,
});

const routes = (
  <>
    <Route path="/admin/allocations" element={<RequireAuth roles={["admin"]}><AllocationsPage /></RequireAuth>} />
    <Route path="/admin/allocations/:bookingId" element={<RequireAuth roles={["admin"]}><AllocatePage /></RequireAuth>} />
  </>
);

test("the queue lists who's waiting, each linking to its own page", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/allocations": { body: [pending(), pending({ booking_id: "bk2", blocked_reason: "Set the renting deposit first." })] } });
  renderAt("/admin/allocations", routes);
  const list = within(await screen.findByRole("list", { name: "Pending allocations" }));
  const links = list.getAllByRole("link");
  expect(links[0]).toHaveAttribute("href", "/admin/allocations/bk1");
  expect(links[0]).toHaveTextContent("Ama Mensah");
  expect(links[0]).toHaveTextContent("2 bedroom · Manny Building, Oyarifa");
  expect(links[0]).toHaveTextContent("GH₵ 300 paid on 3 Nov 2026");
  expect(links[0]).toHaveTextContent("Allocate room");
  expect(within(links[1]).getByText("Needs attention")).toBeInTheDocument();
});

test("an empty queue says so, and problems are shown", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/allocations": { body: [] } });
  const { unmount } = renderAt("/admin/allocations", routes);
  expect(await screen.findByText(/No one is waiting/)).toBeInTheDocument();
  unmount();
  mockApi({ ...asAdmin, "GET /api/admin/allocations": { status: 500, body: { detail: "Something broke." } } });
  renderAt("/admin/allocations", routes);
  expect(await screen.findByText("Something broke.")).toBeInTheDocument();
});

test("only admins get in", async () => {
  mockApi({ "GET /api/auth/me": { body: AMA }, ...googleOff });
  renderAt("/admin/allocations", routes);
  expect(await screen.findByRole("heading", { name: "You don't have access to this page" })).toBeInTheDocument();
});

const fill = async (value: string) => {
  await userEvent.type(await screen.findByLabelText("Room"), value);
  await userEvent.click(screen.getByRole("button", { name: "Allocate room" }));
};

test("the page shows what will happen, and allocating returns to the queue with a confirmation", async () => {
  const { calls } = mockApi({
    ...asAdmin,
    "GET /api/admin/allocations/bk1": { body: pending() },
    "POST /api/admin/allocations/bk1": { status: 201, body: { id: "x", tenant_name: "Ama Mensah", room: "2 bedroom", building: "Manny Building", room_number: "A12", start_date: "2026-11-04", rent: 2000, sanitation_fee: 50, renting_deposit: 4000, renting_bill_number: "BILL-000009" } },
    "GET /api/admin/allocations": { body: [] },
  });
  renderAt("/admin/allocations/bk1", routes);
  expect(await screen.findByRole("heading", { name: "Allocate a room to Ama Mensah" })).toBeInTheDocument();
  expect(screen.getByText("GH₵ 2,000 / month")).toBeInTheDocument();
  expect(screen.getByText(/Already lived in at Manny Building: A1, A2\./)).toBeInTheDocument();
  expect(screen.getByText(/bills the GH₵ 4,000 renting deposit/)).toBeInTheDocument();
  await fill("A12");
  expect(await screen.findByText("Room A12 allocated to Ama Mensah. Renting deposit of GH₵ 4,000 billed (BILL-000009).")).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent(/^\/admin\/allocations$/);
  expect(calls.find((c) => c.key === "POST /api/admin/allocations/bk1")!.body).toEqual({ room_number: "A12" });
});

test("a room is required before anything is sent", async () => {
  const { calls } = mockApi({ ...asAdmin, "GET /api/admin/allocations/bk1": { body: pending() } });
  renderAt("/admin/allocations/bk1", routes);
  await screen.findByLabelText("Room");
  await userEvent.click(screen.getByRole("button", { name: "Allocate room" }));
  expect(screen.getByText("Enter the room, like A12.")).toBeInTheDocument();
  expect(calls.some((c) => c.key === "POST /api/admin/allocations/bk1")).toBe(false);
});

test("a room already lived in shows on the field, and the form can be used again", async () => {
  mockApi({
    ...asAdmin,
    "GET /api/admin/allocations/bk1": { body: pending() },
    "POST /api/admin/allocations/bk1": { status: 409, body: { detail: "Room A1 at Manny Building already has a tenant.", errors: { room_number: "Room A1 at Manny Building already has a tenant." } } },
  });
  renderAt("/admin/allocations/bk1", routes);
  await fill("A1");
  expect(await screen.findByText("Room A1 at Manny Building already has a tenant.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Allocate room" })).toBeEnabled();
});

test("other refusals show as a message", async () => {
  mockApi({
    ...asAdmin,
    "GET /api/admin/allocations/bk1": { body: pending() },
    "POST /api/admin/allocations/bk1": { status: 409, body: { detail: "This booking already has room A9." } },
  });
  renderAt("/admin/allocations/bk1", routes);
  await fill("A12");
  expect(await screen.findByText("This booking already has room A9.")).toBeInTheDocument();
});

test("a booking that can't be allocated yet says why instead of showing the form", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/allocations/bk1": { body: pending({ blocked_reason: "Set the renting deposit for 2 bedroom at Manny Building first.", blocked_fix: "buildings" }) } });
  renderAt("/admin/allocations/bk1", routes);
  expect(await screen.findByRole("heading", { name: "This can't be allocated yet" })).toBeInTheDocument();
  expect(screen.getByText("Set the renting deposit for 2 bedroom at Manny Building first.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to buildings" })).toHaveAttribute("href", "/admin/buildings");
  expect(screen.queryByLabelText("Room")).not.toBeInTheDocument();
});

test("no signature yet points to adding one", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/allocations/bk1": { body: pending({ blocked_reason: "Upload your signature first.", blocked_fix: "signature" }) } });
  renderAt("/admin/allocations/bk1", routes);
  expect(await screen.findByRole("link", { name: "Add your signature" })).toHaveAttribute("href", "/admin/signature");
});

test("a deleted room type hides the prices", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/allocations/bk1": { body: pending({ rent: null, sanitation_fee: null, renting_deposit: null, rooms_left: null, taken_rooms: [], blocked_reason: "This room type has been deleted." }) } });
  renderAt("/admin/allocations/bk1", routes);
  expect(await screen.findByText("This room type has been deleted.")).toBeInTheDocument();
  expect(screen.queryByText("Rent")).not.toBeInTheDocument();
});

test("a booking no longer waiting says so", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/allocations/bk1": { status: 404, body: { detail: "That booking isn't waiting for a room." } } });
  renderAt("/admin/allocations/bk1", routes);
  expect(await screen.findByRole("heading", { name: "This booking isn't waiting for a room" })).toBeInTheDocument();
});
