import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, BedDouble, MapPin } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Reveal } from "../components/Reveal";
import { Badge } from "@/components/ui/badge";
import { formatCedis } from "../format";
import { cn } from "@/lib/utils";
import { Eyebrow, buttonClass, outlineButtonClass, photoPop, photoZoom, sectionClass } from "../landing/parts";
import { SitePage, useEnquiry } from "../landing/SitePage";
import { GlassScene } from "@/components/ui/glass-scene";
import { availability, coverFor, photoFor, photoUrl, useRoom, type Residence } from "./data";
import { RoomStatus } from "./RoomStatus";

/** Rent, fees and availability, shown to logged-in users only (prices are hidden from visitors). */
export function RoomFacts({ r }: { r: Residence }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-8 gap-y-3 text-sm">
      <dt className="text-muted-foreground">Rent</dt>
      <dd className={r.rent === null ? "font-semibold" : "text-lg font-bold text-primary"}>{r.rent === null ? "Log in to see the price" : `${formatCedis(r.rent)} / month`}</dd>
      {r.sanitation !== null && (
        <>
          <dt className="text-muted-foreground">Sanitation</dt>
          <dd>{formatCedis(r.sanitation)} / month</dd>
        </>
      )}
      {r.bookingDeposit ? (
        <>
          <dt className="text-muted-foreground">Booking deposit</dt>
          <dd>{formatCedis(r.bookingDeposit)}, refundable</dd>
        </>
      ) : null}
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

/** The room's photos: a big one, and small ones to switch between when there are several (#38). */
export function RoomGallery({ r }: { r: Residence }) {
  const [shown, setShown] = useState(0);
  if (r.photos.length === 0) {
    return (
      <div className={`${photoPop} aspect-[4/3]`}>
        <img src={photoFor(r.name)} alt="" className={photoZoom} />
      </div>
    );
  }
  const current = Math.min(shown, r.photos.length - 1);
  const label = (i: number) => `${r.name} at ${r.building}, photo ${i + 1} of ${r.photos.length}`;
  return (
    <div className="flex flex-col gap-3">
      <div className={`${photoPop} aspect-[4/3]`}>
        <img src={photoUrl(r.photos[current])} alt={label(current)} className={photoZoom} />
      </div>
      {r.photos.length > 1 && (
        <ul aria-label="More photos" className="flex gap-2 overflow-x-auto pb-1">
          {r.photos.map((id, i) => (
            <li key={id} className="shrink-0">
              <button
                type="button"
                onClick={() => setShown(i)}
                aria-label={`Show photo ${i + 1} of ${r.photos.length}`}
                aria-current={i === current || undefined}
                className={cn(
                  "block h-16 w-24 overflow-hidden rounded-lg border-2 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === current ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
                )}
              >
                <img src={photoUrl(id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
        <GlassScene photo={coverFor(state.residence, "large")}>
          <section aria-labelledby="residence-title" className={`${sectionClass} py-8 md:py-12`}>
            <div className="glass-panel glass-stage p-5 md:p-8">
              <Link to="/residences" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                All residences
              </Link>
              <div className="mt-6 grid items-start gap-10 lg:grid-cols-[1.5fr_1fr]">
                <div className="flex flex-col gap-6">
                  <Reveal from="left">
                    <RoomGallery r={state.residence} />
                  </Reveal>
                  <div>
                    <Eyebrow>
                      {state.residence.building} · {state.residence.location}
                    </Eyebrow>
                    <h1 id="residence-title" className="mt-2 text-5xl font-bold tracking-tight leading-tight">
                      {state.residence.name}
                    </h1>
                    <ul className="mt-4 flex flex-wrap gap-2 text-sm font-medium" aria-label="Key facts">
                      <li className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5">
                        <BedDouble className="h-4 w-4 text-primary" aria-hidden="true" />
                        {state.residence.name}
                      </li>
                      <li className="flex items-center gap-2 rounded-full bg-accent px-3 py-1.5">
                        <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                        {state.residence.location}
                      </li>
                    </ul>
                    {state.residence.description && <p className="mt-4 text-muted-foreground">{state.residence.description}</p>}
                  </div>
                </div>
                <aside aria-label="Price and booking" className="glass-panel flex flex-col gap-6 p-6 lg:sticky lg:top-28">
                  <RoomFacts r={state.residence} />
                  <BookActions r={state.residence} canBook={!user || user.role === "tenant"} loggedIn={Boolean(user)} onEnquire={() => enquire(state.residence)} />
                </aside>
              </div>
            </div>
          </section>
        </GlassScene>
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
