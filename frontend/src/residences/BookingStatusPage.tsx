import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, apiFetch } from "../api";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/sign-in";
import { formatCedis } from "../format";
import { buttonClass, outlineButtonClass, sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { BOOKING_LABEL, type Booking } from "./bookings";

export const POLL_MS = 4000;

/** One booking (/bookings/:id): waits for the Mobile Money approval, then shows how it ended. */
export function BookingStatusPage() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/bookings/${bookingId}`;

  const load = useCallback(
    () =>
      apiFetch<Booking>(url)
        .then(setBooking)
        .catch((e) => {
          if (e instanceof ApiError && e.status === 404) setNotFound(true);
          else setError(e instanceof ApiError ? e.message : "Couldn't load this booking. Try again.");
        }),
    [url],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const waiting = booking?.status === "pending_payment" && booking.payment?.status === "pending";
  // Keep asking while the tenant approves the prompt on their phone.
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      setBooking(await apiFetch<Booking>(`${url}/${path}`, { method: "POST", body }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SitePage>
      <section aria-labelledby="booking-title" className={`${sectionClass} py-12 md:py-16`}>
        <Link to="/bookings" className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground">
          My bookings
        </Link>
        <div className="mt-6 max-w-2xl">
          {notFound && <h1 className="font-serif text-4xl font-medium">We can't find that booking</h1>}
          {!booking && !notFound && !error && <p className="text-muted-foreground">Loading your booking…</p>}
          {error && <FormError>{error}</FormError>}
          {booking && (
            <div className="mt-2 flex flex-col gap-6">
              <Headline booking={booking} waiting={waiting} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-10 gap-y-3 rounded-md border border-border bg-card p-6 text-sm">
                <dt className="text-muted-foreground">Residence</dt>
                <dd>
                  {booking.room}, {booking.building}, {booking.location}
                </dd>
                <dt className="text-muted-foreground">Booking deposit</dt>
                <dd className="font-semibold">{formatCedis(booking.deposit)}</dd>
                <dt className="text-muted-foreground">Bill</dt>
                <dd>{booking.bill_number}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge tone={BOOKING_LABEL[booking.status].tone}>{BOOKING_LABEL[booking.status].text}</Badge>
                </dd>
              </dl>
              {waiting && booking.test_mode && (
                <div className="rounded-md border border-dashed border-border p-6">
                  <h2 className="font-semibold">Test mode</h2>
                  <p className="mt-1 text-sm text-muted-foreground">No real prompt was sent and nothing is charged. Choose what the customer does:</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" disabled={busy} onClick={() => void act("simulate", { outcome: "success" })} className={buttonClass}>
                      Test: approve payment
                    </button>
                    <button type="button" disabled={busy} onClick={() => void act("simulate", { outcome: "failed" })} className={outlineButtonClass}>
                      Test: decline payment
                    </button>
                  </div>
                </div>
              )}
              {booking.status === "pending_payment" && !waiting && (
                <div className="flex flex-wrap gap-3">
                  {booking.room_type_id && (
                    <Link to={`/book/${booking.room_type_id}`} className={buttonClass}>
                      {booking.payment ? "Try again" : "Pay the deposit"}
                    </Link>
                  )}
                  <button type="button" disabled={busy} onClick={() => void act("cancel")} className={outlineButtonClass}>
                    Cancel booking
                  </button>
                </div>
              )}
              {booking.status === "cancelled" && (
                <div>
                  <Link to="/residences" className={buttonClass}>
                    See all residences
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </SitePage>
  );
}

function Headline({ booking, waiting }: { booking: Booking; waiting: boolean }) {
  const title = (text: string) => (
    <h1 id="booking-title" className="font-serif text-5xl font-medium leading-tight">
      {text}
    </h1>
  );
  if (booking.status === "awaiting_allocation") {
    return (
      <div role="status">
        {title("Booking confirmed")}
        <p className="mt-3 text-muted-foreground">
          We've received your {formatCedis(booking.deposit)} deposit. Our team will now allocate your room and let you know which one is yours.
        </p>
      </div>
    );
  }
  if (booking.status === "cancelled") {
    return (
      <div role="status">
        {title("Booking cancelled")}
        <p className="mt-3 text-muted-foreground">Nothing was charged. The room has gone back on the list.</p>
      </div>
    );
  }
  if (waiting) {
    return (
      <div role="status">
        {title("Approve the prompt on your phone")}
        <p className="mt-3 text-muted-foreground">
          {booking.payment?.message ?? "Enter your Mobile Money PIN on your phone."} You have about 3 minutes to pay {formatCedis(booking.deposit)}. Keep this page open; it updates by itself.
        </p>
      </div>
    );
  }
  if (booking.payment?.status === "failed") {
    return (
      <div role="alert">
        {title("The payment didn't go through")}
        <p className="mt-3 text-muted-foreground">{booking.payment.message ?? "Try again."}</p>
      </div>
    );
  }
  return title("Your booking isn't paid yet");
}
