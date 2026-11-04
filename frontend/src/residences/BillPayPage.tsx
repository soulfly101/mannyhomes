import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { FormError } from "@/components/ui/sign-in";
import { formatCedis } from "../format";
import { buttonClass, outlineButtonClass, sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { POLL_MS } from "./BookingStatusPage";
import type { Network } from "./bookings";
import { MomoForm } from "./MomoForm";

type Bill = {
  id: number;
  number: string;
  description: string;
  amount: number;
  paid: number;
  balance: number;
  status: "paid" | "partial" | "unpaid";
  payments: { status: "pending" | "success" | "failed"; note: string | null }[];
  locked_reason: string | null;
  test_mode: boolean;
};

const cardClass = "rounded-xl border border-border bg-card p-6 shadow-sm";

/** Paying one bill by Mobile Money (/bills/:id/pay), e.g. the renting deposit once the agreement is signed. */
export function BillPayPage() {
  const { billId } = useParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const url = `/api/me/bills/${billId}`;

  const load = useCallback(
    () =>
      apiFetch<Bill>(url)
        .then(setBill)
        .catch((e) => {
          if (e instanceof ApiError && e.status === 404) setNotFound(true);
          else setError(e instanceof ApiError ? e.message : "Couldn't load this bill. Try again.");
        }),
    [url],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const latest = bill?.payments[bill.payments.length - 1];
  const waiting = latest?.status === "pending";
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  const pay = async (phone: string, network: Network) => {
    setBill(await apiFetch<Bill>(`${url}/pay`, { method: "POST", body: { phone, network } }));
  };
  const simulate = async (outcome: "success" | "failed") => {
    setError("");
    try {
      setBill(await apiFetch<Bill>(`${url}/simulate`, { method: "POST", body: { outcome } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't work. Try again.");
    }
  };

  return (
    <SitePage>
      <section aria-labelledby="bill-title" className={`${sectionClass} py-12 md:py-16`}>
        <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
        <div className="mt-4 flex max-w-2xl flex-col gap-6">
          {notFound && <h1 className="text-4xl font-bold tracking-tight">We can't find that bill</h1>}
          {error && <FormError>{error}</FormError>}
          {!bill && !notFound && !error && <p className="text-muted-foreground">Loading your bill…</p>}
          {bill && (
            <>
              <div>
                <h1 id="bill-title" className="text-4xl font-bold tracking-tight md:text-5xl">
                  {bill.status === "paid" ? "Payment received" : waiting ? "Approve the prompt on your phone" : `Pay ${formatCedis(bill.balance)}`}
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {bill.description} · {bill.number}
                </p>
              </div>
              {bill.status === "paid" && (
                <div role="status" className={cardClass}>
                  <p>Thank you. We've received {formatCedis(bill.amount)} in full.</p>
                  <Link to="/dashboard" className={`${buttonClass} mt-5`}>
                    Back to my dashboard
                  </Link>
                </div>
              )}
              {bill.status !== "paid" && bill.locked_reason && (
                <div role="alert" className={cardClass}>
                  <p>{bill.locked_reason}</p>
                  <Link to="/dashboard" className={`${buttonClass} mt-5`}>
                    Back to my dashboard
                  </Link>
                </div>
              )}
              {bill.status !== "paid" && !bill.locked_reason && waiting && (
                <div role="status" className={cardClass}>
                  <p>{latest?.note ?? "Enter your Mobile Money PIN on your phone."} You have about 3 minutes. Keep this page open; it updates by itself.</p>
                  {bill.test_mode && (
                    <div className="mt-5 rounded-xl border border-dashed border-border p-4">
                      <h2 className="font-semibold">Test mode</h2>
                      <p className="mt-1 text-sm text-muted-foreground">No real prompt was sent and nothing is charged. Choose what the customer does:</p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" onClick={() => void simulate("success")} className={buttonClass}>
                          Test: approve payment
                        </button>
                        <button type="button" onClick={() => void simulate("failed")} className={outlineButtonClass}>
                          Test: decline payment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {bill.status !== "paid" && !bill.locked_reason && !waiting && (
                <div className={cardClass}>
                  {latest?.status === "failed" && (
                    <div className="mb-5">
                      <FormError>The last payment didn't go through. {latest.note ?? "Try again."}</FormError>
                    </div>
                  )}
                  <MomoForm amount={bill.balance} onPay={pay} />
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </SitePage>
  );
}
