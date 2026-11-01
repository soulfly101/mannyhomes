import { Card, StatusPill } from "../components";
import { formatCedis } from "../format";
import type { Listing } from "./types";

const Lock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/** A building and the room types it offers, with what's available now (DESIGN.md → Cards). */
export function ListingCard({ listing, index }: { listing: Listing; index: number }) {
  return (
    <Card
      as="article"
      className={`rise listing-card${listing.fully_booked ? " is-full" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
      aria-labelledby={`l-${listing.id}`}
    >
      <div className="listing-head">
        <div>
          <h2 id={`l-${listing.id}`}>{listing.name}</h2>
          <p className="muted listing-location">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            {listing.location}
          </p>
        </div>
        <StatusPill
          status={listing.fully_booked ? "fully booked" : "available"}
          label={listing.fully_booked ? "Fully booked" : `${listing.total_available} available`}
        />
      </div>
      {listing.description && <p className="muted listing-description">{listing.description}</p>}
      <ul className="room-list" aria-label={`Rooms at ${listing.name}`}>
        {listing.room_types.map((rt) => (
          <li key={rt.id} className={`room-row${rt.quantity_available === 0 ? " is-full" : ""}`}>
            <span className="room-name">{rt.name}</span>
            {rt.rent === null ? (
              <span className="room-rent locked">
                <Lock /> Log in for price
              </span>
            ) : (
              <span className="room-rent">
                <b>{formatCedis(rt.rent)}</b>/mo
              </span>
            )}
            <StatusPill
              status={rt.quantity_available ? "available" : "fully booked"}
              label={rt.quantity_available ? `${rt.quantity_available} available` : "Fully booked"}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
