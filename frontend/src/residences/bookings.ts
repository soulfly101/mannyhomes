export type Booking = {
  id: string;
  status: "pending_payment" | "awaiting_allocation" | "cancelled";
  room_type_id: string | null;
  room: string;
  building: string;
  location: string;
  deposit: number;
  bill_number: string;
  bill_status: "paid" | "partial" | "unpaid";
  payment: { status: "pending" | "success" | "failed"; message: string | null } | null;
  /** Pretend payments (local development only): nothing is charged. */
  test_mode: boolean;
};

export const NETWORKS = [
  { code: "mtn", label: "MTN MoMo" },
  { code: "vod", label: "Telecel Cash" },
  { code: "atl", label: "AT Money" },
] as const;

export type Network = (typeof NETWORKS)[number]["code"];

export const BOOKING_LABEL: Record<Booking["status"], { text: string; tone: "success" | "warning" | "neutral" }> = {
  pending_payment: { text: "Waiting for payment", tone: "warning" },
  awaiting_allocation: { text: "Awaiting room allocation", tone: "success" },
  cancelled: { text: "Cancelled", tone: "neutral" },
};
