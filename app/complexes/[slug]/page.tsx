import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homeFor } from "@/lib/session";
import { getComplex } from "@/lib/listings";
import { plural } from "@/lib/format";
import { Ambient } from "@/components/Ambient";
import { SiteNav } from "@/components/SiteNav";
import { RoomTypeCard } from "@/components/RoomTypeCard";

export default async function ComplexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const complex = await getComplex(slug, !!session);
  if (!complex) notFound();
  const free = complex.roomTypes.reduce((n, r) => n + r.free, 0);

  return (
    <>
      <Ambient />
      <SiteNav user={session ? { name: session.name, home: homeFor(session.role) } : null} />
      <main className="wrap py-8">
        <Link href="/#apartments" className="text-[0.92rem] font-medium no-underline" style={{ color: "var(--accent)" }}>← All complexes</Link>
        <article className="glass rise mt-4 grid overflow-hidden rounded-[28px] md:grid-cols-[1.2fr_1fr]">
          <div className="aspect-[16/10] max-w-full bg-cover bg-center md:aspect-auto md:min-h-[340px]" style={{ backgroundImage: `url('${complex.photos[0] ?? "/photos/hero.jpg"}')` }} role="img" aria-label={complex.name} />
          <div className="flex flex-col gap-3 p-6 md:p-8">
            <div>
              <h1 className="text-[clamp(1.7rem,3vw,2.3rem)]">{complex.name}</h1>
              <span style={{ color: "var(--muted)" }}>{complex.address}</span>
            </div>
            {complex.description && <p className="m-0" style={{ color: "var(--muted)" }}>{complex.description}</p>}
            {complex.amenities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {complex.amenities.map((a) => (
                  <span key={a} className="rounded-full px-3 py-1 text-[0.88rem]" style={{ background: "var(--glass)", border: "1px solid var(--glass-line)" }}>{a}</span>
                ))}
              </div>
            )}
            <span className={`pill ${free ? "pill-ok" : "pill-warn"} mt-auto self-start`}>{free ? `${plural(free, "apartment")} free` : "Fully booked right now"}</span>
          </div>
        </article>

        <section className="mt-10" aria-labelledby="typesTitle">
          <h2 id="typesTitle" className="text-[clamp(1.5rem,3vw,2rem)]">Apartment types</h2>
          <p className="mb-6 mt-1.5" style={{ color: "var(--muted)" }}>Pick a type to book. We assign your exact unit when the manager approves.</p>
          {complex.roomTypes.length ? (
            <div className="grid gap-[22px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
              {complex.roomTypes.map((r, i) => <RoomTypeCard key={r.id} slug={complex.slug} room={r} index={i} />)}
            </div>
          ) : (
            <div className="glass rounded-[22px] px-4 py-12 text-center" style={{ color: "var(--muted)" }}>No apartment types are listed here yet.</div>
          )}
          {!session && (
            <p className="mt-5 text-[0.9rem]" style={{ color: "var(--muted)" }}>
              Prices show after you <Link href={`/register?next=${encodeURIComponent(`/complexes/${slug}`)}`} style={{ color: "var(--accent)", fontWeight: 600 }}>sign up</Link> or{" "}
              <Link href={`/login?next=${encodeURIComponent(`/complexes/${slug}`)}`} style={{ color: "var(--accent)", fontWeight: 600 }}>log in</Link>.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
