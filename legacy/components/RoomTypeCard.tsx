import Link from "next/link";
import { cedis, freeLabel } from "@/lib/format";
import type { ListedRoomType } from "@/lib/listings";

export const Lock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/** A room type in a complex. Fully booked types stay visible but greyed out and can't be opened. */
export function RoomTypeCard({ slug, room, index }: { slug: string; room: ListedRoomType; index: number }) {
  const full = room.free === 0;
  const body = (
    <>
      <div className="relative aspect-[4/3] max-w-full bg-cover bg-center" style={{ backgroundImage: `url('${room.photos[0] ?? "/photos/hero.jpg"}')`, filter: full ? "grayscale(1)" : undefined }}>
        {room.sizeSqm && <span className="hglass absolute left-3 top-3 rounded-full px-2.5 py-1 text-[0.8rem] font-semibold text-white">{room.sizeSqm} m²</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-5 pb-5 pt-4">
        <h3 className="text-[1.3rem]">{room.name}</h3>
        <span className="text-[0.9rem]" style={{ color: "var(--muted)" }}>{room.rooms.join(" · ")}</span>
        <div className="mt-auto flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--glass-line)" }}>
          {room.rentAmount !== undefined ? (
            <span>
              <b className="text-[1.4rem] tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{cedis(room.rentAmount)}</b>{" "}
              <small style={{ color: "var(--muted)" }}>/ month</small>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[0.92rem] font-medium" style={{ color: "var(--muted)" }}>
              <Lock /> Log in to see the price
            </span>
          )}
          <span className={`pill ${full ? "pill-warn" : "pill-ok"}`}>{freeLabel(room.free)}</span>
        </div>
      </div>
    </>
  );
  const className = "glass rise flex flex-col overflow-hidden rounded-[22px] no-underline";
  const style = { animationDelay: `${index * 0.06}s` };
  return full ? (
    <div className={className} style={{ ...style, opacity: 0.6 }} aria-disabled="true">{body}</div>
  ) : (
    <Link href={`/complexes/${slug}/${room.id}`} className={`${className} transition-transform duration-500 hover:-translate-y-1.5`} style={style}>{body}</Link>
  );
}
