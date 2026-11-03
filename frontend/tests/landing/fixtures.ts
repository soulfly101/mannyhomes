import type { ListingsResponse } from "../../src/listings/types";

export const room = (id: string, name: string, qty: number, rent: number | null) => ({
  id,
  name,
  description: null,
  quantity_available: qty,
  rent,
  sanitation_fee: rent === null ? null : 50,
});

export function listings(pricesVisible: boolean): ListingsResponse {
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
