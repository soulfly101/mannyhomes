export type AgreementSummary = {
  id: string;
  tenant_name: string;
  room_number: string;
  room: string;
  building: string;
  location: string;
  lease_start: string;
  lease_end: string;
  signed_at: string | null;
};

export type Agreement = AgreementSummary & {
  /** The frozen wording: plain text, with "## " marking headings. */
  body: string;
  draft_wording: boolean;
  landlord_name: string;
  landlord_signature: string;
  tenant_signature_kind: "drawn" | "typed" | null;
  tenant_signature_image: string | null;
  tenant_typed_name: string | null;
  document_hash: string | null;
  renting_bill_id: number;
  renting_deposit: number;
  renting_bill_status: "paid" | "partial" | "unpaid";
};
