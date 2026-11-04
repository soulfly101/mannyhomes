import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { AuthField, FormError } from "@/components/ui/sign-in";
import { formatCedis, formatDate } from "../format";
import { buttonClass, sectionClass } from "../landing/parts";
import type { AllocatedTenancy, PendingAllocation } from "./allocations";

/** Giving one tenant a specific room (/admin/allocations/:bookingId). */
export function AllocatePage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<PendingAllocation | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/admin/allocations/${bookingId}`;

  useEffect(() => {
    apiFetch<PendingAllocation>(url)
      .then(setItem)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setBanner(e instanceof ApiError ? e.message : "Couldn't load this booking. Try again.");
      });
  }, [url]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBanner("");
    if (!roomNumber.trim()) {
      setFieldError("Enter the room, like A12.");
      return;
    }
    setFieldError("");
    setBusy(true);
    try {
      const t = await apiFetch<AllocatedTenancy>(url, { method: "POST", body: { room_number: roomNumber } });
      navigate("/admin/allocations", {
        state: { done: `Room ${t.room_number} allocated to ${t.tenant_name}. Renting deposit of ${formatCedis(t.renting_deposit)} billed (${t.renting_bill_number}).` },
      });
    } catch (err) {
      if (err instanceof ApiError && err.errors.room_number) setFieldError(err.errors.room_number);
      else setBanner(err instanceof ApiError ? err.message : "Couldn't allocate the room. Try again.");
      setBusy(false);
    }
  };

  return (
    <main className={`${sectionClass} py-10 font-sans text-foreground`}>
      <Link to="/admin/allocations" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Pending allocations
      </Link>
      <div className="mt-4 max-w-2xl">
        {notFound && (
          <>
            <h1 className="font-serif text-4xl font-medium">This booking isn't waiting for a room</h1>
            <p className="mt-3 text-muted-foreground">It may already have been allocated.</p>
          </>
        )}
        {banner && (
          <div className="mb-6">
            <FormError>{banner}</FormError>
          </div>
        )}
        {!item && !notFound && !banner && <p className="text-muted-foreground">Loading…</p>}
        {item && (
          <>
            <h1 className="font-serif text-5xl font-medium leading-tight">Allocate a room to {item.tenant.name}</h1>
            <p className="mt-2 text-muted-foreground">
              {item.tenant.email}
              {item.tenant.phone ? ` · ${item.tenant.phone}` : ""}
            </p>
            <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-10 gap-y-3 rounded-md border border-border bg-card p-6 text-sm">
              <dt className="text-muted-foreground">Booked</dt>
              <dd>
                {item.room}, {item.building}, {item.location}
              </dd>
              <dt className="text-muted-foreground">Booking deposit</dt>
              <dd>
                {formatCedis(item.booking_deposit)} paid{item.paid_at ? ` on ${formatDate(item.paid_at)}` : ""}
              </dd>
              {item.rent !== null && (
                <>
                  <dt className="text-muted-foreground">Rent</dt>
                  <dd>{formatCedis(item.rent)} / month</dd>
                  <dt className="text-muted-foreground">Sanitation</dt>
                  <dd>{formatCedis(item.sanitation_fee ?? 0)} / month</dd>
                  <dt className="text-muted-foreground">Renting deposit to bill</dt>
                  <dd className="font-semibold">{formatCedis(item.renting_deposit ?? 0)}</dd>
                  <dt className="text-muted-foreground">Rooms left of this type</dt>
                  <dd>{item.rooms_left}</dd>
                </>
              )}
            </dl>
            <div className="mt-8 rounded-md border border-border bg-card p-6">
              {item.blocked_reason ? (
                <div role="alert">
                  <h2 className="font-serif text-2xl font-medium">This can't be allocated yet</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{item.blocked_reason}</p>
                  <Link to="/admin/buildings" className={`${buttonClass} mt-5`}>
                    Go to buildings
                  </Link>
                </div>
              ) : (
                <form onSubmit={submit} noValidate className="flex flex-col gap-5">
                  <AuthField
                    label="Room"
                    name="room_number"
                    placeholder="A12"
                    hint={item.taken_rooms.length ? `Already lived in at ${item.building}: ${item.taken_rooms.join(", ")}.` : `The room's number or name at ${item.building}.`}
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    error={fieldError}
                  />
                  <p className="text-sm text-muted-foreground">
                    Saving takes one {item.room} off what's available, bills the {formatCedis(item.renting_deposit ?? 0)} renting deposit and starts the tenancy today.
                  </p>
                  <div>
                    <button type="submit" disabled={busy} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-progress disabled:opacity-80`}>
                      {busy ? "Please wait…" : "Allocate room"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
