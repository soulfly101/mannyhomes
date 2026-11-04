import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { AgreementDocument } from "../agreements/AgreementDocument";
import type { Agreement, AgreementSummary } from "../agreements/types";
import { Reveal } from "../components/Reveal";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/sign-in";
import { formatDate } from "../format";
import { outlineButtonClass, sectionClass } from "../landing/parts";

/** Every tenancy agreement (/admin/agreements), newest first. */
export function AgreementsPage() {
  const [agreements, setAgreements] = useState<AgreementSummary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<AgreementSummary[]>("/api/admin/agreements")
      .then(setAgreements)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the agreements. Try again."));
  }, []);

  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Agreements</h1>
      <p className="mt-2 text-muted-foreground">A permanent copy of every tenancy agreement.</p>
      {error && (
        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>
      )}
      {!agreements && !error && <p className="mt-6 text-muted-foreground">Loading agreements…</p>}
      {agreements?.length === 0 && <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No agreements yet. One is created each time you allocate a room.</p>}
      {agreements && agreements.length > 0 && (
        <ul className="mt-8 grid gap-4" aria-label="Agreements">
          {agreements.map((a, i) => (
            <Reveal as="li" key={a.id} delay={Math.min(i, 5) * 60}>
              <Link to={`/admin/agreements/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5 text-foreground shadow-sm transition duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5">
                <span className="min-w-0">
                  <span className="block text-xl font-bold tracking-tight">{a.tenant_name}</span>
                  <span className="block text-sm text-muted-foreground">
                    Room {a.room_number} · {a.building}, {a.location} · {formatDate(a.lease_start)} to {formatDate(a.lease_end)}
                  </span>
                </span>
                <Badge tone={a.signed_at ? "success" : "warning"}>{a.signed_at ? `Signed ${formatDate(a.signed_at)}` : "Waiting for signature"}</Badge>
              </Link>
            </Reveal>
          ))}
        </ul>
      )}
    </main>
  );
}

/** One agreement as the admin sees it (/admin/agreements/:id). */
export function AdminAgreementPage() {
  const { agreementId } = useParams();
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<Agreement>(`/api/admin/agreements/${agreementId}`)
      .then(setAgreement)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the agreement. Try again."));
  }, [agreementId]);

  return (
    <main className={`${sectionClass} py-8 md:py-10 print:py-0`}>
      <Link to="/admin/agreements" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Agreements
      </Link>
      {error && (
        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>
      )}
      {!agreement && !error && <p className="mt-4 text-muted-foreground">Loading the agreement…</p>}
      {agreement && (
        <div className="mt-4 flex max-w-3xl flex-col gap-6">
          <AgreementDocument agreement={agreement} />
          <div className="print:hidden">
            <button type="button" onClick={() => window.print()} className={outlineButtonClass}>
              Print or save as PDF
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
