import type { RoomListing } from "../../src/listings/types";
import { room } from "../landing/fixtures";

/** GET /api/listings/rooms/:id answer for the 2 bedroom at Manny Building (or a fully booked one). */
export function roomListing(pricesVisible: boolean, quantity = 2): RoomListing {
  return {
    prices_visible: pricesVisible,
    room: { ...room("r2", "2 bedroom", quantity, pricesVisible ? 2000 : null), description: "Bright corner flat." },
    building: { id: "b1", name: "Manny Building", location: "Oyarifa", description: "Quiet compound near the main road." },
  };
}
