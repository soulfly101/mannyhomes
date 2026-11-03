import { Lock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCedis } from "../format";
import type { Listing } from "./types";

const availability = (n: number) => (n === 0 ? "Fully booked" : `${n} available`);

/** A building and the room types it offers, with what's available now. Flat card: border, no blur. */
export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <article
      aria-labelledby={`l-${listing.id}`}
      data-full={listing.fully_booked || undefined}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm transition-shadow hover:shadow-md",
        listing.fully_booked && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`l-${listing.id}`} className="text-xl font-semibold tracking-tight">
            {listing.name}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {listing.location}
          </p>
        </div>
        <Badge tone={listing.fully_booked ? "danger" : "success"}>{availability(listing.total_available)}</Badge>
      </div>
      {listing.description && <p className="text-sm text-muted-foreground">{listing.description}</p>}
      <ul className="divide-y divide-border border-t border-border" aria-label={`Rooms at ${listing.name}`}>
        {listing.room_types.map((rt) => (
          <li key={rt.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-3">
            <span className={cn("font-medium", rt.quantity_available === 0 && "text-muted-foreground")}>{rt.name}</span>
            {rt.rent === null ? (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Log in for price
              </span>
            ) : (
              <span className="text-sm tabular-nums text-muted-foreground">
                <b className="font-semibold text-foreground">{formatCedis(rt.rent)}</b>/mo
              </span>
            )}
            <Badge tone={rt.quantity_available ? "success" : "danger"}>{availability(rt.quantity_available)}</Badge>
          </li>
        ))}
      </ul>
    </article>
  );
}
