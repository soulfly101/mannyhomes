import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { FormError } from "@/components/ui/sign-in";
import { sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { BillRow, type TenantBill } from "./bills";

/** Every bill a tenant has had (/bills), newest first. */
export function BillsPage() {
  const [bills, setBills] = useState<TenantBill[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<TenantBill[]>("/api/me/bills")
      .then(setBills)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load your bills. Try again."));
  }, []);

  return (
    <SitePage>
      <section aria-labelledby="bills-title" className={`${sectionClass} py-12 md:py-16`}>
        <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
        <h1 id="bills-title" className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
          Billing / Payments
        </h1>
        <div className="mt-8 max-w-3xl">
          {error && <FormError>{error}</FormError>}
          {!bills && !error && <p className="text-muted-foreground">Loading your bills…</p>}
          {bills?.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">You don't have any bills yet.</p>}
          {bills && bills.length > 0 && (
            <ul aria-label="Your bills" className="rounded-xl border border-border bg-card p-6 shadow-sm">
              {bills.map((b) => (
                <BillRow key={b.id} bill={b} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </SitePage>
  );
}
