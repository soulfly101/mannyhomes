import type { Building } from "../../src/admin/types";
import { AMA } from "../helpers";

export const ADMIN = { ...AMA, id: "admin1", name: "Property Manager", role: "admin" as const };

export const MANNY: Building = {
  id: "b1",
  name: "Manny Building",
  location: "Oyarifa",
  description: null,
  sanitation_fee: 50,
  listed: true,
  total_available: 4,
  room_types: [
    { id: "r1", name: "1 bedroom", rent: 1200, quantity_available: 1, sanitation_fee_override: null, sanitation_fee: 50, description: null },
    { id: "r2", name: "2 bedroom", rent: 2000, quantity_available: 3, sanitation_fee_override: null, sanitation_fee: 50, description: null },
    { id: "r3", name: "3 bedroom", rent: 2800, quantity_available: 0, sanitation_fee_override: 80, sanitation_fee: 80, description: null },
  ],
};

export const asAdmin = {
  "GET /api/auth/me": { body: ADMIN },
  "GET /api/auth/config": { body: { google: false } },
};
