/** A tenant leaving their room (#26), as the API returns it to admins and to the tenant. */
export type MoveOut = {
  id: string;
  tenancy_id: string;
  tenant_id: string;
  tenant_name: string;
  room_number: string;
  building: string;
  moved_out_on: string;
  deposits_held: number;
  deductions: { reason: string; amount: number; bill_number: string | null }[];
  deductions_total: number;
  refund_due: number;
  note: string | null;
  refunded_at: string | null;
  refund_method: string | null;
  refund_reference: string | null;
};

export type RefundState = "refunded" | "owed" | "none";

export const refundState = (m: MoveOut): RefundState => (m.refunded_at ? "refunded" : m.refund_due > 0 ? "owed" : "none");

export const REFUND_METHODS = [
  ["momo", "Mobile Money"],
  ["cash", "Cash"],
  ["bank", "Bank transfer"],
] as const;
