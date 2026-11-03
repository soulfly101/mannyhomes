import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { buttonClass, sectionClass } from "../landing/parts";
import { SitePage, useEnquiry } from "../landing/SitePage";
import { useRoom } from "./data";
import { RoomFacts } from "./ResidenceDetailsPage";
import { RoomStatus } from "./RoomStatus";

/**
 * Booking a room type (/book/:roomTypeId), tenants only.
 * For now a summary and a way to enquire; #14 adds the booking deposit payment by Mobile Money here.
 */
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
            <div className="mt-8 rounded-md border border-border bg-card p-6" role="status">
              {state.residence.quantity > 0 ? (
                <>
                  <h2 className="font-serif text-2xl font-medium">Online booking opens soon</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Soon you'll pay the booking deposit here with Mobile Money. Until then, send us an enquiry and our team will reserve it for you.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-serif text-2xl font-medium">Fully booked right now</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Enquire and we'll let you know as soon as one frees up.</p>
                </>
              )}
              <button type="button" onClick={() => enquire(state.residence)} className={`${buttonClass} mt-5`}>
                Enquire
              </button>
            </div>
          </div>
        </section>
      )}
    </SitePage>
  );
}
