import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import { AuthField, FormError } from "@/components/ui/sign-in";
import { formatCedis } from "../format";
import { buttonClass, chipClass, sectionClass } from "../landing/parts";
import { SitePage, useEnquiry } from "../landing/SitePage";
import { NETWORKS, type Booking, type Network } from "./bookings";
import { useRoom, type Residence } from "./data";
import { RoomFacts } from "./ResidenceDetailsPage";
import { RoomStatus } from "./RoomStatus";

const localPhone = (phone: string | null | undefined) => (phone ? `0${phone.replace(/^\+233/, "")}` : "");

/** Mobile Money details and the button that sends the prompt. The waiting happens on the booking's own page. */
function PayForm({ r }: { r: Residence }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(localPhone(user?.phone));
  const [network, setNetwork] = useState<Network | "">("");
  const [errors, setErrors] = useState<{ phone?: string; network?: string }>({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problems: typeof errors = {};
    if (!/^(0|\+233)\d{9}$/.test(phone.replace(/[\s\-()]/g, ""))) problems.phone = "Enter a Ghana phone number, like 024 123 4567.";
    if (!network) problems.network = "Choose your Mobile Money network.";
    setErrors(problems);
    setBanner("");
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      const booking = await apiFetch<Booking>("/api/bookings", { method: "POST", body: { room_type_id: r.id } });
      await apiFetch<Booking>(`/api/bookings/${booking.id}/pay`, { method: "POST", body: { phone, network } });
      navigate(`/bookings/${booking.id}`);
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : "Couldn't start the payment. Try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {banner && <FormError>{banner}</FormError>}
      <AuthField
        label="Mobile Money number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="024 123 4567"
        hint="You'll get a prompt on this phone to enter your PIN."
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
      />
      <fieldset>
        <legend className="text-sm font-medium text-muted-foreground">Network</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {NETWORKS.map((n) => (
            <button key={n.code} type="button" aria-pressed={network === n.code} onClick={() => setNetwork(n.code)} className={chipClass(network === n.code)}>
              {n.label}
            </button>
          ))}
        </div>
        {errors.network && (
          <p role="alert" className="mt-1.5 text-sm font-medium text-destructive">
            {errors.network}
          </p>
        )}
      </fieldset>
      <div>
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-progress disabled:opacity-80`}>
          {busy ? "Please wait…" : `Pay ${formatCedis(r.bookingDeposit ?? 0)}`}
        </button>
      </div>
    </form>
  );
}

/** Booking a room type (/book/:roomTypeId), tenants only: the summary and paying the deposit by Mobile Money. */
export function BookingPage() {
  const { roomTypeId } = useParams();
  const state = useRoom(roomTypeId);
  const { enquiry, enquire } = useEnquiry();

  return (
    <SitePage enquiry={enquiry}>
      <RoomStatus state={state} />
      {state.status === "ready" && (
        <section aria-labelledby="booking-title" className={`${sectionClass} py-12 md:py-16`}>
          <Link to={`/residences/${state.residence.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to {state.residence.name}
          </Link>
          <div className="mt-6 max-w-2xl">
            <h1 id="booking-title" className="font-serif text-5xl font-medium leading-tight">
              Book a {state.residence.name}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {state.residence.building} · {state.residence.location}
            </p>
            <div className="mt-8 rounded-md border border-border bg-card p-6">
              <RoomFacts r={state.residence} />
            </div>
            <div className="mt-8 rounded-md border border-border bg-card p-6">
              {state.residence.quantity === 0 ? (
                <Notice title="Fully booked right now" text="Enquire and we'll let you know as soon as one frees up." onEnquire={() => enquire(state.residence)} />
              ) : !state.residence.bookingDeposit ? (
                <Notice title="Online booking isn't open for this residence yet" text="Send us an enquiry and our team will reserve it for you." onEnquire={() => enquire(state.residence)} />
              ) : (
                <>
                  <h2 className="font-serif text-2xl font-medium">Pay the booking deposit</h2>
                  <p className="mb-5 mt-2 text-sm text-muted-foreground">
                    {formatCedis(state.residence.bookingDeposit)}, refundable. It reserves a {state.residence.name} for you while we allocate your exact room.
                  </p>
                  <PayForm r={state.residence} />
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </SitePage>
  );
}

function Notice({ title, text, onEnquire }: { title: string; text: string; onEnquire: () => void }) {
  return (
    <div role="status">
      <h2 className="font-serif text-2xl font-medium">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <button type="button" onClick={onEnquire} className={`${buttonClass} mt-5`}>
        Enquire
      </button>
    </div>
  );
}
