export type RoomType = {
  id: string;
  name: string;
  rent: number;
  quantity_available: number;
  sanitation_fee_override: number | null;
  /** The fee that applies: the override, or the building's. */
  sanitation_fee: number;
  /** Paid when booking; 0 = not set yet. */
  booking_deposit: number;
  /** Charged when the room is allocated; 0 = not set yet. */
  renting_deposit: number;
  description: string | null;
};

export type Building = {
  id: string;
  name: string;
  location: string;
  description: string | null;
  sanitation_fee: number;
  listed: boolean;
  room_types: RoomType[];
  total_available: number;
};

export type RoomTypeInput = {
  id?: string;
  name: string;
  rent: number;
  quantity_available: number;
  sanitation_fee_override: number | null;
  booking_deposit: number;
  renting_deposit: number;
  description: string | null;
};

export type BuildingInput = {
  name: string;
  location: string;
  sanitation_fee: number;
  description: string | null;
  listed: boolean;
  room_types: RoomTypeInput[];
};

export const availabilityLabel = (n: number) => (n === 0 ? "Fully booked" : `${n} available`);
