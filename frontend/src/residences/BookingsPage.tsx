import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError, apiFetch } from "../api";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/sign-in";
import { formatCedis } from "../format";
import { buttonClass, sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { BOOKING_LABEL, type Booking } from "./bookings";

/** A tenant's bookings (/bookings). */
export function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<Booking[]>("/api/bookings")
      .then(setBookings)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load your bookings. Try again."));
  }, []);

  return (
    <SitePage>
      <section aria-labelledby="bookings-title" className={`${sectionClass} py-12 md:py-16`}>
        <h1 id="bookings-title" className="font-serif text-5xl font-medium leading-tight">
          My bookings
        </h1>
        {error && <div className="mt-6"><FormError>{error}</FormError></div>}
        {!bookings && !error && <p className="mt-6 text-muted-foreground">Loading your bookings…</p>}
        {bookings?.length === 0 && (
          <div className="mt-6">
            <p className="text-muted-foreground">No bookings yet. Your bookings will appear here once you've chosen a residence.</p>
            <Link to="/residences" className={`${buttonClass} mt-5`}>
              See all residences
            </Link>
          </div>
        )}
        {bookings && bookings.length > 0 && (
          <ul className="mt-8 border-t border-border" aria-label="Bookings">
            {bookings.map((b) => (
              <li key={b.id} className="border-b border-border">
                <Link to={`/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 py-5">
                  <span>
                    <span className="block font-serif text-2xl font-medium">{b.room}</span>
                    <span className="block text-sm text-muted-foreground">
                      {b.building} · {b.location} · {formatCedis(b.deposit)} deposit
                    </span>
                  </span>
                  <Badge tone={BOOKING_LABEL[b.status].tone}>{BOOKING_LABEL[b.status].text}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </SitePage>
  );
}
