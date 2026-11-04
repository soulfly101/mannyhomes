export type PendingAllocation = {
  booking_id: string;
  tenant: { id: string; name: string; email: string; phone: string | null };
  room: string;
  building: string;
  location: string;
  booking_deposit: number;
  paid_at: string | null;
  /** null if the room type has since been deleted. */
  rent: number | null;
  sanitation_fee: number | null;
  renting_deposit: number | null;
  rooms_left: number | null;
  taken_rooms: string[];
  /** Why it can't be allocated yet; null when it can. */
  blocked_reason: string | null;
  /** Which page fixes it. */
  blocked_fix: "buildings" | "signature" | null;
};

export type AllocatedTenancy = {
  id: string;
  tenant_name: string;
  room: string;
  building: string;
  room_number: string;
  start_date: string;
  rent: number;
  sanitation_fee: number;
  renting_deposit: number;
  renting_bill_number: string;
};
