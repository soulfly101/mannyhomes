import { formatDate } from "../format";
import type { Agreement } from "./types";

/** The agreement as a document: white paper in light and dark mode, and prints cleanly to PDF. */
export function AgreementDocument({ agreement: a }: { agreement: Agreement }) {
  return (
    <article aria-label="Tenancy agreement" className="rounded-xl border border-border bg-white p-6 text-ink shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <h2 className="text-3xl font-bold tracking-tight">Tenancy Agreement</h2>
      {a.draft_wording && (
        <p className="mt-3 rounded-xl border-2 border-dashed border-[#8a5a12] bg-[#fdf3dc] px-4 py-3 text-sm font-semibold text-[#6b4510]">
          DRAFT WORDING: to be reviewed by a lawyer before real use.
        </p>
      )}
      <p className="mt-3 text-sm">
        {formatDate(a.lease_start)} to {formatDate(a.lease_end)}
      </p>
      <div className="mt-6 flex flex-col gap-3 text-sm leading-relaxed">
        {a.body.split("\n").map((line, i) => {
          if (!line.trim()) return null;
          if (line.startsWith("## ")) {
            return (
              <h3 key={i} className="mt-3 text-base font-bold tracking-tight">
                {line.slice(3)}
              </h3>
            );
          }
          return <p key={i}>{line}</p>;
        })}
      </div>
      <div className="mt-10 grid gap-8 border-t border-[#eadfd2] pt-6 sm:grid-cols-2">
        <section aria-label="Landlord's signature">
          <h3 className="text-sm font-bold">For the Landlord: {a.landlord_name}</h3>
          <img src={a.landlord_signature} alt={`Signature for ${a.landlord_name}`} className="mt-3 h-20 max-w-full object-contain object-left" />
        </section>
        <section aria-label="Tenant's signature">
          <h3 className="text-sm font-bold">The Tenant: {a.tenant_name}</h3>
          {a.tenant_signature_kind === "drawn" && a.tenant_signature_image && <img src={a.tenant_signature_image} alt={`Signature of ${a.tenant_name}`} className="mt-3 h-20 max-w-full object-contain object-left" />}
          {a.tenant_signature_kind === "typed" && <p className="mt-3 flex h-20 items-center text-3xl italic">{a.tenant_typed_name}</p>}
          {a.signed_at ? <p className="mt-2 text-sm">Signed electronically on {formatDate(a.signed_at)}</p> : <p className="mt-3 text-sm">Not signed yet.</p>}
        </section>
      </div>
      {a.document_hash && <p className="mt-6 break-all text-xs text-[#6b5e53]">Document check: {a.document_hash}</p>}
    </article>
  );
}
