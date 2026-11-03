import { screen, waitFor, within } from "@testing-library/react";
import userEventLib from "@testing-library/user-event";
import { Route } from "react-router";
import { BuildingFormPage } from "../../src/admin/BuildingFormPage";
import { mockApi, renderAt } from "../helpers";
import { MANNY, asAdmin } from "./fixtures";

// Type instantly: these tests fill many fields and must not depend on machine speed.
const userEvent = userEventLib.setup({ delay: null });

const routes = (
  <>
    <Route path="/admin/buildings/new" element={<BuildingFormPage />} />
    <Route path="/admin/buildings/:id" element={<BuildingFormPage />} />
    <Route path="/admin/buildings" element={<p>buildings list</p>} />
  </>
);

const rows = () => within(screen.getByRole("list", { name: "Room types" })).getAllByRole("listitem");
const inRow = (i: number, label: string) => within(rows()[i]).getByLabelText(label);

async function fillRow(i: number, name: string, rent: string, quantity: string) {
  await userEvent.type(inRow(i, "Room type"), name);
  await userEvent.type(inRow(i, "Rent per month"), rent);
  await userEvent.type(inRow(i, "Available now"), quantity);
}

test("adds a building with several room types", async () => {
  const { calls } = mockApi({ ...asAdmin, "POST /api/admin/buildings": { status: 201, body: MANNY } });
  renderAt("/admin/buildings/new", routes);

  await userEvent.type(screen.getByLabelText("Building name"), "Manny Building");
  await userEvent.type(screen.getByLabelText("Location"), "Oyarifa");
  await userEvent.clear(screen.getByLabelText("Monthly sanitation fee"));
  await userEvent.type(screen.getByLabelText("Monthly sanitation fee"), "50");
  await fillRow(0, "1 bedroom", "1,200", "1");
  await userEvent.click(screen.getByRole("button", { name: "+ Add room type" }));
  await fillRow(1, "2 bedroom", "2000", "2");
  await userEvent.type(inRow(1, "Sanitation fee (optional)"), "80");
  await userEvent.click(screen.getByRole("button", { name: "Save building" }));

  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/buildings"));
  expect(calls.find((c) => c.key === "POST /api/admin/buildings")!.body).toEqual({
    name: "Manny Building",
    location: "Oyarifa",
    sanitation_fee: 50,
    description: null,
    listed: true,
    room_types: [
      { name: "1 bedroom", rent: 1200, quantity_available: 1, sanitation_fee_override: null, description: null },
      { name: "2 bedroom", rent: 2000, quantity_available: 2, sanitation_fee_override: 80, description: null },
    ],
  });
});

test("won't save without a room type", async () => {
  const { calls } = mockApi(asAdmin);
  renderAt("/admin/buildings/new", routes);
  await userEvent.type(screen.getByLabelText("Building name"), "Manny Building");
  await userEvent.type(screen.getByLabelText("Location"), "Oyarifa");
  await userEvent.click(within(rows()[0]).getByRole("button", { name: /Remove room type/ }));
  await userEvent.click(screen.getByRole("button", { name: "Save building" }));

  expect(await screen.findByText("Add at least one room type.")).toBeInTheDocument();
  expect(calls.some((c) => c.key === "POST /api/admin/buildings")).toBe(false);
});

test("checks each room type's fields", async () => {
  const { calls } = mockApi(asAdmin);
  renderAt("/admin/buildings/new", routes);
  await userEvent.type(screen.getByLabelText("Building name"), "Manny Building");
  await userEvent.type(screen.getByLabelText("Location"), "Oyarifa");
  await fillRow(0, "2 bedroom", "0", "-1");
  await userEvent.click(screen.getByRole("button", { name: "+ Add room type" }));
  await fillRow(1, "2 Bedroom", "2000", "1");
  await userEvent.click(screen.getByRole("button", { name: "Save building" }));

  expect(inRow(0, "Rent per month")).toHaveAccessibleDescription("Rent must be more than GH₵ 0.");
  expect(inRow(0, "Available now")).toHaveAccessibleDescription("Enter how many are available, like 2.");
  expect(inRow(1, "Room type")).toHaveAccessibleDescription("Each room type in a building needs a different name.");
  expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Check the highlighted fields.");
  expect(calls.some((c) => c.key === "POST /api/admin/buildings")).toBe(false);
});

test("checks the building's own fields", async () => {
  mockApi(asAdmin);
  renderAt("/admin/buildings/new", routes);
  await userEvent.clear(screen.getByLabelText("Monthly sanitation fee"));
  await userEvent.type(screen.getByLabelText("Monthly sanitation fee"), "fifty");
  await userEvent.click(screen.getByRole("button", { name: "Save building" }));
  expect(screen.getByLabelText("Building name")).toHaveAccessibleDescription("Enter the building name.");
  expect(screen.getByLabelText("Location")).toHaveAccessibleDescription("Enter the location, like Oyarifa.");
  expect(screen.getByLabelText("Monthly sanitation fee")).toHaveAccessibleDescription(
    expect.stringContaining("Enter the fee in whole cedis"),
  );
});

test("edits an existing building, keeping ids and removing a room type", async () => {
  const { calls } = mockApi({
    ...asAdmin,
    "GET /api/admin/buildings/b1": { body: MANNY },
    "PUT /api/admin/buildings/b1": { body: MANNY },
  });
  renderAt("/admin/buildings/b1", routes);

  expect(await screen.findByRole("heading", { name: "Edit Manny Building" })).toBeInTheDocument();
  expect(inRow(2, "Sanitation fee (optional)")).toHaveValue("80");
  await userEvent.clear(inRow(1, "Rent per month"));
  await userEvent.type(inRow(1, "Rent per month"), "2100");
  await userEvent.click(within(rows()[0]).getByRole("button", { name: "Remove room type 1 bedroom" }));
  await userEvent.click(screen.getByLabelText("Show this building to tenants"));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/admin/buildings"));
  const body = calls.find((c) => c.key === "PUT /api/admin/buildings/b1")!.body as {
    listed: boolean;
    room_types: { id?: string; rent: number }[];
  };
  expect(body.listed).toBe(false);
  expect(body.room_types.map((r) => [r.id, r.rent])).toEqual([
    ["r2", 2100],
    ["r3", 2800],
  ]);
});

test("shows the server's errors on the right fields", async () => {
  mockApi({
    ...asAdmin,
    "POST /api/admin/buildings": {
      status: 409,
      body: { detail: "A building with that name already exists. Use a different name." },
    },
  });
  renderAt("/admin/buildings/new", routes);
  await userEvent.type(screen.getByLabelText("Building name"), "Manny Building");
  await userEvent.type(screen.getByLabelText("Location"), "Oyarifa");
  await fillRow(0, "1 bedroom", "1200", "1");
  await userEvent.click(screen.getByRole("button", { name: "Save building" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
  expect(screen.getByTestId("location")).toHaveTextContent("/admin/buildings/new");
});

test("maps server field errors onto room type rows", async () => {
  mockApi({
    ...asAdmin,
    "POST /api/admin/buildings": {
      status: 422,
      body: { detail: "That amount looks too high.", errors: { "room_types.0.rent": "That amount looks too high." } },
    },
  });
  renderAt("/admin/buildings/new", routes);
  await userEvent.type(screen.getByLabelText("Building name"), "Manny Building");
  await userEvent.type(screen.getByLabelText("Location"), "Oyarifa");
  await fillRow(0, "1 bedroom", "99999999", "1");
  await userEvent.click(screen.getByRole("button", { name: "Save building" }));
  await waitFor(() => expect(inRow(0, "Rent per month")).toHaveAccessibleDescription("That amount looks too high."));
});

test("says so when the building can't be loaded", async () => {
  mockApi({
    ...asAdmin,
    "GET /api/admin/buildings/gone": { status: 404, body: { detail: "That building doesn't exist. It may have been deleted." } },
  });
  renderAt("/admin/buildings/gone", routes);
  expect(await screen.findByRole("alert")).toHaveTextContent("doesn't exist");
});
