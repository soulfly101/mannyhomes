export type ListingRoomType = {
  id: string;
  name: string;
  description: string | null;
  quantity_available: number;
  /** null for visitors: prices are for logged-in users. */
  rent: number | null;
  sanitation_fee: number | null;
};

export type Listing = {
  id: string;
  name: string;
  location: string;
  description: string | null;
  total_available: number;
  fully_booked: boolean;
  room_types: ListingRoomType[];
};

export type ListingsResponse = {
  buildings: Listing[];
  filters: { locations: string[]; room_types: string[] };
  prices_visible: boolean;
};
