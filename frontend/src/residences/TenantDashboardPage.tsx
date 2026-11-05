import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { BedDouble, Building2, KeyRound, MapPin, type LucideIcon } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Reveal } from "../components/Reveal";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/sign-in";
import { formatCedis, formatDate } from "../format";
import { buttonClass, outlineButtonClass, photoPop, photoZoom, sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { BillRow, currentSanitationBills, type TenantBill } from "./bills";
import { BookingSteps } from "./BookingSteps";
import type { Booking } from "./bookings";
import { photoFor } from "./data";

/** How often to check for an allocation while waiting. It also checks when the tenant comes back to the tab. */
export const DASHBOARD_POLL_MS = 10000;

const DEPOSIT = {
  paid: { tone: "success", text: "Paid" },
  partial: { tone: "warning", text: "Partly paid" },
  unpaid: { tone: "danger", text: "Unpaid" },
} as const;

/** The booking the dashboard is about: a room they have, then one waiting for a room, then one still to pay. */
export function currentBooking(bookings: Booking[]): Booking | null {
  for (const status of ["allocated", "awaiting_allocation", "pending_payment"] as const) {
    const match = bookings.find((b) => b.status === status);
    if (match) return match;
  }
  return null;
}

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-bold tracking-tight">{children}</dd>
      </div>
    </div>
  );
}

function RoomFactsGrid({ booking }: { booking: Booking }) {
  return (
    <dl className="grid gap-5 sm:grid-cols-2">
      <Fact icon={Building2} label="Building">
        {booking.building}
      </Fact>
      <Fact icon={MapPin} label="Location">
        {booking.location}
      </Fact>
      <Fact icon={BedDouble} label="Room type">
        {booking.room}
      </Fact>
      {booking.tenancy && (
        <Fact icon={KeyRound} label="Your room">
          {booking.tenancy.room_number}
        </Fact>
      )}
    </dl>
  );
}

const cardClass = "rounded-xl border border-border bg-card p-6 shadow-sm";

/** What the tenant does next: sign the agreement, then pay the deposit. Paying stays locked until it's signed. */
function NextStep({ booking }: { booking: Booking }) {
  const t = booking.tenancy!;
  if (!t.agreement_id) return <p className="mt-4 text-sm text-muted-foreground">Our team will contact you about your tenancy agreement and the renting deposit.</p>;
  if (!t.agreement_signed) {
    return (
      <div className="mt-5">
        <p className="text-sm text-muted-foreground">Next, read and sign your tenancy agreement. You can pay the renting deposit once it's signed.</p>
        <Link to={`/agreements/${t.agreement_id}`} className={`${buttonClass} mt-4`}>
          Read and sign your agreement
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {t.renting_bill_status !== "paid" && (
        <Link to={`/bills/${t.renting_bill_id}/pay`} className={buttonClass}>
          Pay renting deposit
        </Link>
      )}
      <Link to={`/agreements/${t.agreement_id}`} className={outlineButtonClass}>
        View your agreement
      </Link>
    </div>
  );
}

/** The tenant's "Billing / Payments" section: this month's sanitation bill and anything still owed. */
function BillingSection({ booking }: { booking: Booking }) {
  const [bills, setBills] = useState<TenantBill[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<TenantBill[]>("/api/me/bills")
      .then(setBills)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load your bills. Try again."));
  }, []);
  const current = bills ? currentSanitationBills(bills) : [];
  if (booking.tenancy!.sanitation_fee <= 0 && bills && current.length === 0) return null;

  return (
    <section aria-labelledby="billing-title" className={`${cardClass} mt-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="billing-title" className="text-2xl font-bold tracking-tight">
          Billing / Payments
        </h2>
        <Link to="/bills" className={outlineButtonClass}>
          See all bills
        </Link>
      </div>
      <div className="mt-4">
        {error && <FormError>{error}</FormError>}
        {!bills && !error && <p className="text-muted-foreground">Loading your bills…</p>}
        {bills && current.length === 0 && <p className="text-sm text-muted-foreground">Your monthly sanitation bills will appear here once you've signed your agreement. Each is due on the day of the month you moved in.</p>}
        {current.length > 0 && (
          <ul aria-label="Sanitation bills">
            {current.map((b) => (
              <BillRow key={b.id} bill={b} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActiveTenancy({ booking, justAllocated }: { booking: Booking; justAllocated: boolean }) {
  const t = booking.tenancy!;
  const deposit = DEPOSIT[t.renting_bill_status];
  return (
    <>
      <h1 id="dashboard-title" className="text-4xl font-bold tracking-tight md:text-5xl">
        Tenant Dashboard
      </h1>
      {justAllocated && (
        <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
          Good news: room {t.room_number} has just been allocated to you.
        </p>
      )}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Reveal from="left">
          <div className={`${photoPop} aspect-[4/3]`}>
            <img src={photoFor(booking.room)} alt="" className={photoZoom} />
          </div>
        </Reveal>
        <div className="flex flex-col gap-6">
          <section aria-label="Your home" className={cardClass}>
            <RoomFactsGrid booking={booking} />
          </section>
          <section aria-label="Your tenancy" className={cardClass}>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-8 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Start date</dt>
              <dd>{formatDate(t.start_date)}</dd>
              <dt className="text-muted-foreground">Rent</dt>
              <dd className="font-semibold">{formatCedis(t.rent)} / month</dd>
              <dt className="text-muted-foreground">Sanitation</dt>
              <dd>{formatCedis(t.sanitation_fee)} / month</dd>
              <dt className="text-muted-foreground">Renting deposit</dt>
              <dd className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{formatCedis(t.renting_deposit)}</span>
                <Badge tone={deposit.tone}>{deposit.text}</Badge>
              </dd>
            </dl>
            <NextStep booking={booking} />
          </section>
        </div>
      </div>
      <BillingSection booking={booking} />
    </>
  );
}

function AwaitingRoom({ booking }: { booking: Booking }) {
  return (
    <>
      <BookingSteps current={3} />
      <h1 id="dashboard-title" className="mt-6 text-4xl font-bold tracking-tight md:text-5xl">
        Booking Confirmed - Awaiting Room Allocation
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        We've received your {formatCedis(booking.deposit)} deposit. Our team will choose your exact room, and it will appear here as soon as they do. This page updates by itself.
      </p>
      <section aria-label="Your booking" className={`${cardClass} mt-8 max-w-2xl`}>
        <RoomFactsGrid booking={booking} />
      </section>
    </>
  );
}

function FinishBooking({ booking }: { booking: Booking }) {
  return (
    <>
      <h1 id="dashboard-title" className="text-4xl font-bold tracking-tight md:text-5xl">
        Finish your booking
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Your {booking.room} at {booking.building} isn't reserved yet. Pay the {formatCedis(booking.deposit)} deposit to secure it.
      </p>
      <Link to={`/bookings/${booking.id}`} className={`${buttonClass} mt-6`}>
        Continue your booking
      </Link>
    </>
  );
}

function NoBooking({ name }: { name: string }) {
  return (
    <>
      <h1 id="dashboard-title" className="text-4xl font-bold tracking-tight md:text-5xl">
        Welcome, {name}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">You haven't booked a home yet. Your booking and your room will appear here once you do.</p>
      <Link to="/residences" className={`${buttonClass} mt-6`}>
        Find a place you'll love
      </Link>
    </>
  );
}

/** A tenant's home base (/dashboard): waits for the allocation, then becomes their Tenant Dashboard by itself. */
export function TenantDashboardPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const wasWaiting = useRef(false);
  const [justAllocated, setJustAllocated] = useState(false);

  const load = useCallback(
    () =>
      apiFetch<Booking[]>("/api/bookings")
        .then((all) => {
          setBookings(all);
          setError("");
        })
        .catch((e) => {
          // A failed background check keeps what's on screen; the next one will try again.
          setBookings((shown) => {
            if (!shown) setError(e instanceof ApiError ? e.message : "Couldn't load your dashboard. Try again.");
            return shown;
          });
        }),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const booking = bookings ? currentBooking(bookings) : null;
  const waiting = booking?.status === "awaiting_allocation";

  useEffect(() => {
    if (waiting) wasWaiting.current = true;
    else if (booking?.status === "allocated" && wasWaiting.current) setJustAllocated(true);
  }, [waiting, booking?.status]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void load(), DASHBOARD_POLL_MS);
    const onReturn = () => void load();
    window.addEventListener("focus", onReturn);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onReturn);
    };
  }, [waiting, load]);

  return (
    <SitePage>
      <section aria-labelledby="dashboard-title" className={`${sectionClass} py-12 md:py-16`}>
        {error && <FormError>{error}</FormError>}
        {!bookings && !error && <p className="text-muted-foreground">Loading your dashboard…</p>}
        {bookings && !booking && <NoBooking name={user?.name.split(" ")[0] ?? "there"} />}
        {booking?.status === "pending_payment" && <FinishBooking booking={booking} />}
        {booking?.status === "awaiting_allocation" && <AwaitingRoom booking={booking} />}
        {booking?.status === "allocated" && booking.tenancy && <ActiveTenancy booking={booking} justAllocated={justAllocated} />}
        {booking && booking.status !== "pending_payment" && (
          <div className="mt-8">
            <Link to={`/bookings/${booking.id}`} className={outlineButtonClass}>
              View booking details
            </Link>
          </div>
        )}
      </section>
    </SitePage>
  );
}
