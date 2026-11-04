import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { AuthField, FormError } from "@/components/ui/sign-in";
import { formatCedis } from "../format";
import { buttonClass, chipClass, outlineButtonClass, sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { AgreementDocument } from "./AgreementDocument";
import { SignaturePad } from "./SignaturePad";
import type { Agreement } from "./types";

function SignForm({ agreement, onSigned }: { agreement: Agreement; onSigned: (a: Agreement) => void }) {
  const [kind, setKind] = useState<"drawn" | "typed">("drawn");
  const [image, setImage] = useState<string | null>(null);
  const [typedName, setTypedName] = useState(agreement.tenant_name);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (kind === "drawn" && !image) return setError("Draw your signature first.");
    if (kind === "typed" && typedName.trim().length < 2) return setError("Type your full legal name.");
    if (!agreed) return setError("Tick the box to confirm you've read and agree to this.");
    setError("");
    setBusy(true);
    try {
      onSigned(
        await apiFetch<Agreement>(`/api/agreements/${agreement.id}/sign`, {
          method: "POST",
          body: kind === "drawn" ? { kind, image, agreed } : { kind, typed_name: typedName, agreed },
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your signature. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm print:hidden">
      <h2 className="text-2xl font-bold tracking-tight">Sign the agreement</h2>
      {error && <FormError>{error}</FormError>}
      <div role="group" aria-label="How to sign" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={kind === "drawn"} onClick={() => setKind("drawn")} className={chipClass(kind === "drawn")}>
          Draw
        </button>
        <button type="button" aria-pressed={kind === "typed"} onClick={() => setKind("typed")} className={chipClass(kind === "typed")}>
          Type my name
        </button>
      </div>
      {kind === "drawn" ? (
        <SignaturePad onChange={setImage} />
      ) : (
        <AuthField label="Your full legal name" name="typed_name" autoComplete="name" hint="This will appear as your signature." value={typedName} onChange={(e) => setTypedName(e.target.value)} />
      )}
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
        I have read this agreement and agree to its terms.
      </label>
      <div>
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-progress disabled:opacity-80`}>
          {busy ? "Please wait…" : "Sign agreement"}
        </button>
      </div>
    </form>
  );
}

/** A tenant's tenancy agreement (/agreements/:id): read and sign it, then keep it or go on to pay the deposit. */
export function AgreementPage() {
  const { agreementId } = useParams();
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiFetch<Agreement>(`/api/agreements/${agreementId}`)
      .then(setAgreement)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof ApiError ? e.message : "Couldn't load the agreement. Try again.");
      });
  }, [agreementId]);

  return (
    <SitePage>
      <section aria-labelledby="agreement-title" className={`${sectionClass} py-10 md:py-14 print:py-0`}>
        <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground print:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
        <h1 id="agreement-title" className="mt-4 text-4xl font-bold tracking-tight md:text-5xl print:hidden">
          {agreement?.signed_at ? "Your signed agreement" : "Read and sign your agreement"}
        </h1>
        {notFound && <p className="mt-4 text-muted-foreground">We can't find that agreement.</p>}
        {error && (
          <div className="mt-4">
            <FormError>{error}</FormError>
          </div>
        )}
        {!agreement && !notFound && !error && <p className="mt-4 text-muted-foreground">Loading your agreement…</p>}
        {agreement && (
          <div className="mt-8 flex max-w-3xl flex-col gap-6">
            <AgreementDocument agreement={agreement} />
            {!agreement.signed_at && <SignForm agreement={agreement} onSigned={setAgreement} />}
            {agreement.signed_at && (
              <div className="flex flex-wrap items-center gap-3 print:hidden" role="status">
                {agreement.renting_bill_status !== "paid" && (
                  <Link to={`/bills/${agreement.renting_bill_id}/pay`} className={buttonClass}>
                    Pay renting deposit ({formatCedis(agreement.renting_deposit)})
                  </Link>
                )}
                <button type="button" onClick={() => window.print()} className={outlineButtonClass}>
                  Print or save as PDF
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </SitePage>
  );
}
