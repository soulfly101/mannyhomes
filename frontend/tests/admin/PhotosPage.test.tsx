import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { PhotosPage } from "../../src/admin/PhotosPage";
import type { AdminPhoto } from "../../src/admin/photos";
import { RequireAuth } from "../../src/auth/RequireAuth";
import { mockApi, renderAt } from "../helpers";
import { MANNY, asAdmin } from "./fixtures";

const routes = (
  <Route
    path="/admin/buildings/:id/photos"
    element={
      <RequireAuth roles={["admin"]}>
        <PhotosPage />
      </RequireAuth>
    }
  />
);

const photo = (id: string, roomTypeId: string | null, position: number): AdminPhoto => ({ id, room_type_id: roomTypeId, position, width: 1600, height: 1200 });

const PHOTOS = [photo("p2", null, 1), photo("p1", null, 0), photo("p3", "r2", 0)];
const jpeg = (name: string) => new File(["x"], name, { type: "image/jpeg" });

const base = (photos: AdminPhoto[] = PHOTOS) => ({
  ...asAdmin,
  "GET /api/admin/buildings/b1": { body: MANNY },
  "GET /api/admin/buildings/b1/photos": { body: photos },
});

const open = () => renderAt("/admin/buildings/b1/photos", routes);
const imagesIn = (set: HTMLElement) => within(set).queryAllByRole("img").map((img) => img.getAttribute("src"));

test("shows the building's photos and each room type's, in order, with the cover marked", async () => {
  mockApi(base());
  open();
  expect(await screen.findByRole("heading", { level: 1, name: "Photos of Manny Building" })).toBeInTheDocument();
  const building = screen.getByRole("region", { name: "The building" });
  expect(imagesIn(building)).toEqual(["/api/photos/p1/thumb.jpg", "/api/photos/p2/thumb.jpg"]);
  expect(within(building).getAllByText("Cover")).toHaveLength(1);
  expect(within(building).getByText(/2 photos\./)).toBeInTheDocument();
  expect(imagesIn(screen.getByRole("region", { name: "2 bedroom" }))).toEqual(["/api/photos/p3/thumb.jpg"]);
  expect(within(screen.getByRole("region", { name: "1 bedroom" })).getByText(/No photos yet\./)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to buildings/ })).toHaveAttribute("href", "/admin/buildings");
});

test("uploads several photos to a room type, sending each file as it is", async () => {
  let n = 0;
  const { calls } = mockApi({
    ...base(),
    "POST /api/admin/buildings/b1/photos": () => ({ status: 201, body: photo(`new${++n}`, "r1", n - 1) }),
  });
  open();
  const set = await screen.findByRole("region", { name: "1 bedroom" });
  const files = [jpeg("lounge.jpg"), jpeg("kitchen.jpg")];
  await userEvent.upload(within(set).getByLabelText("Add photos"), files);

  await waitFor(() => expect(imagesIn(set)).toEqual(["/api/photos/new1/thumb.jpg", "/api/photos/new2/thumb.jpg"]));
  const uploads = calls.filter((c) => c.key === "POST /api/admin/buildings/b1/photos");
  expect(uploads.map((c) => c.body)).toEqual(files);
  expect(uploads[0].search).toBe("?room_type_id=r1");
  expect(uploads[0].headers).toMatchObject({ "Content-Type": "image/jpeg", "X-Requested-With": "altheo" });
});

test("explains which files weren't added, and still adds the rest", async () => {
  mockApi({
    ...base([]),
    "POST /api/admin/buildings/b1/photos": () => ({ status: 422, body: { detail: "That file couldn't be read as a photo." } }),
  });
  open();
  const set = await screen.findByRole("region", { name: "The building" });
  const gif = new File(["x"], "animation.gif", { type: "image/gif" });
  const huge = new File(["x"], "huge.jpg", { type: "image/jpeg" });
  Object.defineProperty(huge, "size", { value: 16 * 1024 * 1024 });
  await userEvent.upload(within(set).getByLabelText("Add photos"), [gif, huge, jpeg("broken.jpg")], { applyAccept: false });

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("animation.gif: use a JPEG, PNG or WebP photo.");
  expect(alert).toHaveTextContent("huge.jpg: too large. Use one under 15 MB.");
  expect(alert).toHaveTextContent("broken.jpg: That file couldn't be read as a photo.");
});

test("moving a photo saves the new order", async () => {
  const { calls } = mockApi({ ...base(), "PUT /api/admin/buildings/b1/photos/order": { body: [] } });
  open();
  const set = await screen.findByRole("region", { name: "The building" });
  await userEvent.click(within(set).getByRole("button", { name: "Move photo 1 later" }));

  await waitFor(() => expect(imagesIn(set)).toEqual(["/api/photos/p2/thumb.jpg", "/api/photos/p1/thumb.jpg"]));
  expect(calls.find((c) => c.key === "PUT /api/admin/buildings/b1/photos/order")?.body).toEqual({ room_type_id: null, photo_ids: ["p2", "p1"] });
  expect(within(set).getByRole("button", { name: "Move photo 1 earlier" })).toBeDisabled();
});

test("puts the order back if saving it fails", async () => {
  mockApi({ ...base(), "PUT /api/admin/buildings/b1/photos/order": { status: 409, body: { detail: "The photos changed in the meantime. Reload the page and try again." } } });
  open();
  const set = await screen.findByRole("region", { name: "The building" });
  await userEvent.click(within(set).getByRole("button", { name: "Move photo 2 earlier" }));
  expect(await screen.findByText(/changed in the meantime/)).toBeInTheDocument();
  expect(imagesIn(set)).toEqual(["/api/photos/p1/thumb.jpg", "/api/photos/p2/thumb.jpg"]);
});

test("deleting asks first, then removes the photo", async () => {
  const { calls } = mockApi({ ...base(), "DELETE /api/admin/buildings/b1/photos/p1": { status: 204 } });
  open();
  const set = await screen.findByRole("region", { name: "The building" });
  await userEvent.click(within(set).getByRole("button", { name: "Delete photo 1" }));
  await userEvent.click(within(set).getByRole("button", { name: "Keep it" }));
  expect(calls.some((c) => c.key.startsWith("DELETE"))).toBe(false);

  await userEvent.click(within(set).getByRole("button", { name: "Delete photo 1" }));
  await userEvent.click(within(set).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(imagesIn(set)).toEqual(["/api/photos/p2/thumb.jpg"]));
  expect(within(set).getByText("Cover")).toBeInTheDocument();
});

test("says so when the building can't be loaded", async () => {
  mockApi({ ...asAdmin, "GET /api/admin/buildings/b1": { status: 404, body: { detail: "That building doesn't exist. It may have been deleted." } }, "GET /api/admin/buildings/b1/photos": { status: 404, body: {} } });
  open();
  expect(await screen.findByText("That building doesn't exist. It may have been deleted.")).toBeInTheDocument();
});
