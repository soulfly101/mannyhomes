import type { Agreement } from "../../src/agreements/types";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

export const agreement = (overrides: Partial<Agreement> = {}): Agreement => ({
  id: "ag1",
  tenant_name: "Ama Mensah",
  room_number: "A12",
  room: "2 bedroom",
  building: "Manny Building",
  location: "Oyarifa",
  lease_start: "2026-11-04",
  lease_end: "2027-11-04",
  signed_at: null,
  body: "This Tenancy Agreement is made with Ama Mensah.\n\n## 1. The home\nRoom A12 at Manny Building.",
  draft_wording: true,
  landlord_name: "Altheo Homes",
  landlord_signature: PNG,
  tenant_signature_kind: null,
  tenant_signature_image: null,
  tenant_typed_name: null,
  document_hash: null,
  renting_bill_id: 9,
  renting_deposit: 4000,
  renting_bill_status: "unpaid",
  ...overrides,
});

export const signedTyped = (overrides: Partial<Agreement> = {}) =>
  agreement({ signed_at: "2026-11-05T09:00:00", tenant_signature_kind: "typed", tenant_typed_name: "Ama Mensah", document_hash: "abc123", ...overrides });

export { PNG };
