import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homeFor } from "@/lib/session";
import { cedis, freeLabel } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getRoomType } from "@/lib/listings";
import { openBooking } from "@/lib/bookings";
import { Ambient } from "@/components/Ambient";
import { SiteNav } from "@/components/SiteNav";
import { BookForm } from "./BookForm";

export default async function RoomTypePage({ params }: { params: Promise<{ slug: string; roomTypeId: string }> }) {
  const { slug, roomTypeId } = await params;
  const session = await getSession();
  const [room, settings, booking] = await Promise.all([
    getRoomType(slug, roomTypeId, !!session),
    getSettings(),
    session?.role === "TENANT" ? openBooking(session.userId) : null,
  ]);
  if (!room) notFound();
  const next = `/complexes/${slug}/${room.id}`;

  return (
    <>
      <Ambient />
      <SiteNav user={session ? { name: session.name, home: homeFor(session.role) } : null} />
      <main className="wrap py-8">
        <Link href={`/complexes/${slug}`} className="text-[0.92rem] font-medium no-underline" style={{ color: "var(--accent)" }}>← {room.property.name}</Link>
        <article className="glass rise mt-4 grid overflow-hidden rounded-[28px] md:grid-cols-[1.2fr_1fr]">
          <div className="aspect-[4/3] max-w-full bg-cover bg-center md:aspect-auto md:min-h-[460px]" style={{ backgroundImage: `url('${room.photos[0] ?? "/photos/hero.jpg"}')` }} role="img" aria-label={`${room.name} at ${room.property.name}`} />
          <div className="flex flex-col gap-4 p-6 md:p-8">
            <div>
              <h1 className="text-[clamp(1.7rem,3vw,2.3rem)]">{room.name}</h1>
              <span style={{ color: "var(--muted)" }}>{room.property.name} · {room.property.area}{room.sizeSqm ? ` · ${room.sizeSqm} m²` : ""}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {room.rooms.map((r) => (
                <span key={r} className="rounded-full px-3 py-1 text-[0.88rem]" style={{ background: "var(--glass)", border: "1px solid var(--glass-line)" }}>{r}</span>
              ))}
              <span className={`pill ${room.free ? "pill-ok" : "pill-warn"} self-center`}>{freeLabel(room.free)}</span>
            </div>
            {room.description && <p className="m-0" style={{ color: "var(--muted)" }}>{room.description}</p>}

            {room.rentAmount === undefined ? (
              <>
                <div className="grid grid-cols-[20px_1fr] gap-3 rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--glass-line)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                  <div>
                    <b className="block">Rent and deposit are for members</b>
                    <span className="text-[0.92rem]" style={{ color: "var(--muted)" }}>Create a free account or log in to see the price and book this apartment.</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-soft">Log in</Link>
                  <Link href={`/register?next=${encodeURIComponent(next)}`} className="btn btn-primary">Sign up</Link>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
                  {[["Rent", `${cedis(room.rentAmount)}`, " / month"], ["Security deposit", cedis(room.depositAmount!), ""]].map(([k, v, s]) => (
                    <div key={k} className="rounded-[14px] px-3.5 py-3" style={{ background: "var(--glass)", border: "1px solid var(--glass-line)" }}>
                      <small className="block text-[0.75rem] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--muted)" }}>{k}</small>
                      <b className="text-[1.2rem] tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{v}</b>{s}
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl p-4" style={{ border: "1px solid var(--accent)", background: "var(--info-bg)" }}>
                  <small className="text-[0.75rem] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--accent)" }}>To book</small>
                  <b className="my-0.5 block text-[1.3rem]" style={{ fontFamily: "var(--font-display)" }}>{cedis(settings.bookingDeposit)} booking deposit</b>
                  <span className="text-[0.92rem]" style={{ color: "var(--muted)" }}>
                    We hold an apartment of this type for you for {settings.holdHours} hours while the manager reviews your request. You get the {cedis(settings.bookingDeposit)} back once you&apos;re approved.
                  </span>
                </div>
                {room.free === 0 ? (
                  <span className="pill pill-warn self-start">Fully booked right now</span>
                ) : session?.role !== "TENANT" ? (
                  <p className="m-0 text-[0.92rem]" style={{ color: "var(--muted)" }}>Tenants book from this page. You&apos;re logged in as staff.</p>
                ) : booking && booking.status !== "AWAITING_PAYMENT" ? (
                  <p className="m-0 rounded-2xl px-4 py-3 text-[0.92rem]" style={{ background: "var(--info-bg)" }}>
                    You already have a booking for {booking.roomType.name} at {booking.roomType.property.name}. <Link href="/tenant" style={{ color: "var(--accent)", fontWeight: 600 }}>See its status</Link>
                  </p>
                ) : (
                  <BookForm roomTypeId={room.id} deposit={cedis(settings.bookingDeposit)} />
                )}
              </>
            )}
          </div>
        </article>
      </main>
    </>
  );
}
