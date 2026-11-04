import type { RoomListing } from "../../src/listings/types";
import type { Booking } from "../../src/residences/bookings";
import { room } from "../landing/fixtures";

/** GET /api/listings/rooms/:id answer for the 2 bedroom at Manny Building (or a fully booked one). */
export function roomListing(pricesVisible: boolean, quantity = 2): RoomListing {
  return {
    prices_visible: pricesVisible,
    room: { ...room("r2", "2 bedroom", quantity, pricesVisible ? 2000 : null), description: "Bright corner flat." },
    building: { id: "b1", name: "Manny Building", location: "Oyarifa", description: "Quiet compound near the main road." },
  };
}

export const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "bk1",
  status: "pending_payment",
  room_type_id: "r2",
  room: "2 bedroom",
  building: "Manny Building",
  location: "Oyarifa",
  deposit: 300,
  bill_number: "BILL-000007",
  bill_status: "unpaid",
  payment: null,
  test_mode: false,
  ...overrides,
});
