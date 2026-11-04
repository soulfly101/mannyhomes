import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "../api";
import { formatCedis } from "../format";
import { buttonClass, sectionClass } from "../landing/parts";
import { SitePage, useEnquiry } from "../landing/SitePage";
import { BookingSteps } from "./BookingSteps";
import type { Booking, Network } from "./bookings";
import { MomoForm } from "./MomoForm";
import { useRoom, type Residence } from "./data";
import { RoomFacts } from "./ResidenceDetailsPage";
import { RoomStatus } from "./RoomStatus";

/** Starts the booking and sends the prompt. The waiting happens on the booking's own page. */
function PayForm({ r }: { r: Residence }) {
  const navigate = useNavigate();
  const pay = async (phone: string, network: Network) => {
    const booking = await apiFetch<Booking>("/api/bookings", { method: "POST", body: { room_type_id: r.id } });
    await apiFetch<Booking>(`/api/bookings/${booking.id}/pay`, { method: "POST", body: { phone, network } });
    navigate(`/bookings/${booking.id}`);
  };
  return <MomoForm amount={r.bookingDeposit ?? 0} onPay={pay} />;
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
            <div className="mb-6">
              <BookingSteps current={2} />
            </div>
            <h1 id="booking-title" className="text-5xl font-bold tracking-tight leading-tight">
              Book a {state.residence.name}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {state.residence.building} · {state.residence.location}
            </p>
            <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
              <RoomFacts r={state.residence} />
            </div>
            <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
              {state.residence.quantity === 0 ? (
                <Notice title="Fully booked right now" text="Enquire and we'll let you know as soon as one frees up." onEnquire={() => enquire(state.residence)} />
              ) : !state.residence.bookingDeposit ? (
                <Notice title="Online booking isn't open for this residence yet" text="Send us an enquiry and our team will reserve it for you." onEnquire={() => enquire(state.residence)} />
              ) : (
                <>
                  <h2 className="text-2xl font-bold tracking-tight">Pay the booking deposit</h2>
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
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <button type="button" onClick={onEnquire} className={`${buttonClass} mt-5`}>
        Enquire
      </button>
    </div>
  );
}
