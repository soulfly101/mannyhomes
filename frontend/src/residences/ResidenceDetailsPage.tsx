import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { formatCedis } from "../format";
import { Eyebrow, buttonClass, outlineButtonClass, sectionClass } from "../landing/parts";
import { SitePage, useEnquiry } from "../landing/SitePage";
import { availability, photoFor, useRoom, type Residence } from "./data";
import { RoomStatus } from "./RoomStatus";

/** Rent, fees and availability, shown to logged-in users only (prices are hidden from visitors). */
export function RoomFacts({ r }: { r: Residence }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-10 gap-y-3 text-sm">
      <dt className="text-muted-foreground">Rent</dt>
      <dd className="font-semibold">{r.rent === null ? "Log in to see the price" : `${formatCedis(r.rent)} / month`}</dd>
      {r.sanitation !== null && (
        <>
          <dt className="text-muted-foreground">Sanitation</dt>
          <dd>{formatCedis(r.sanitation)} / month</dd>
        </>
      )}
      <dt className="text-muted-foreground">Availability</dt>
      <dd>
        <Badge tone={r.quantity ? "success" : "danger"}>{availability(r.quantity)}</Badge>
      </dd>
      <dt className="text-muted-foreground">Building</dt>
      <dd>
        {r.building}, {r.location}
      </dd>
    </dl>
  );
}

/** One room type (/residences/:roomTypeId): photo, details, and the way to book or enquire. */
export function ResidenceDetailsPage() {
  const { roomTypeId } = useParams();
  const { user } = useAuth();
  const state = useRoom(roomTypeId);
  const { enquiry, enquire } = useEnquiry();

  return (
    <SitePage enquiry={enquiry}>
      <RoomStatus state={state} />
      {state.status === "ready" && (
        <section aria-labelledby="residence-title" className={`${sectionClass} py-12 md:py-16`}>
          <Link to="/residences" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All residences
          </Link>
          <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
            <img src={photoFor(state.residence.name)} alt="" className="aspect-[4/3] w-full rounded-md object-cover" />
            <div className="flex flex-col gap-6">
              <Eyebrow>
                {state.residence.building} · {state.residence.location}
              </Eyebrow>
              <h1 id="residence-title" className="font-serif text-5xl font-medium leading-tight">
                {state.residence.name}
              </h1>
              {state.residence.description && <p className="text-muted-foreground">{state.residence.description}</p>}
              <RoomFacts r={state.residence} />
              <BookActions r={state.residence} canBook={!user || user.role === "tenant"} loggedIn={Boolean(user)} onEnquire={() => enquire(state.residence)} />
            </div>
          </div>
        </section>
      )}
    </SitePage>
  );
}

function BookActions({ r, canBook, loggedIn, onEnquire }: { r: Residence; canBook: boolean; loggedIn: boolean; onEnquire: () => void }) {
  const free = r.quantity > 0;
  const bookTo = loggedIn ? `/book/${r.id}` : `/register?next=${encodeURIComponent(`/residences/${r.id}`)}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {free && canBook && (
          <Link to={bookTo} className={buttonClass}>
            Book now
          </Link>
        )}
        <button type="button" onClick={onEnquire} className={free && canBook ? outlineButtonClass : buttonClass}>
          Enquire
        </button>
      </div>
      {!free && <p className="text-sm text-muted-foreground">Fully booked right now. Enquire and we'll let you know when one frees up.</p>}
      {free && canBook && !loggedIn && <p className="text-sm text-muted-foreground">You'll create a free account first, then come straight back here.</p>}
    </div>
  );
}
