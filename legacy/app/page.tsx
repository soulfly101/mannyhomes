import Link from "next/link";
import { getSession } from "@/lib/auth";
import { homeFor } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { areasOf, listComplexes } from "@/lib/listings";
import { SiteNav } from "@/components/SiteNav";
import { ComplexCard } from "@/components/ComplexCard";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const session = await getSession();
  const [{ area: rawArea }, settings, allOpen] = await Promise.all([searchParams, getSettings(), listComplexes(false)]);
  const areas = areasOf(allOpen);
  const area = areas.find((a) => a === rawArea);
  const complexes = await listComplexes(!!session, area);
  const freeUnits = allOpen.reduce((n, c) => n + c.roomTypes.reduce((m, r) => m + r.free, 0), 0);

  return (
    <>
      <header className="relative isolate flex min-h-[640px] flex-col overflow-hidden text-white max-[820px]:min-h-[600px]">
        <div
          role="img"
          aria-label="Apartment building against a clear blue sky"
          className="absolute inset-0 -z-20 bg-cover"
          style={{ backgroundImage: "url('/photos/hero.jpg')", backgroundPosition: "center 35%", animation: "settle 2.4s var(--ease) both" }}
        />
        <div className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg,rgba(4,30,56,.25),rgba(4,30,56,.05) 40%,rgba(4,24,44,.55))" }} />
        <SiteNav user={session ? { name: session.name, home: homeFor(session.role) } : null} overHero />

        <div className="wrap flex w-full flex-1 flex-col">
          <div className="mt-auto max-w-[640px] pb-7 pt-12">
            <span className="hglass rise inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.08em]">
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: "#7CF0C5", boxShadow: "0 0 0 4px rgba(124,240,197,.25)" }} />
              Now leasing in Accra
            </span>
            <h1 className="rise d1 my-4 text-[clamp(2.4rem,6vw,4.4rem)] leading-[1.02]">
              A calmer way
              <br />
              to rent your home
            </h1>
            <p className="rise d2 m-0 max-w-[34ch] text-[1.1rem]" style={{ color: "rgba(255,255,255,.88)" }}>
              Pick your apartment, pay by Mobile Money or card, and handle repairs and cleaning from your phone.
            </p>
          </div>

          <form action="/#apartments" method="get" className="hglass rise d3 mb-10 grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[26px] p-2 max-[480px]:grid-cols-1" aria-label="Search apartments">
            <div className="flex min-w-0 flex-col rounded-[18px] px-4 py-2">
              <label htmlFor="area" className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] opacity-80">Where</label>
              <select id="area" name="area" defaultValue={area ?? ""} className="w-full border-0 bg-transparent py-0.5 font-medium text-white outline-none">
                <option value="" style={{ color: "#0A2540" }}>Any area</option>
                {areas.map((a) => <option key={a} value={a} style={{ color: "#0A2540" }}>{a}</option>)}
              </select>
            </div>
            <button className="btn btn-primary px-7" type="submit">Find apartments</button>
          </form>
          <div className="rise d4 flex flex-wrap gap-7 pb-7 text-[0.9rem]" style={{ color: "rgba(255,255,255,.85)" }}>
            <span><b className="mr-1.5 text-[1.25rem] text-white" style={{ fontFamily: "var(--font-display)" }}>{freeUnits}</b>apartments free</span>
            <span><b className="mr-1.5 text-[1.25rem] text-white" style={{ fontFamily: "var(--font-display)" }}>{allOpen.length}</b>{allOpen.length === 1 ? "complex" : "complexes"}</span>
            <span><b className="mr-1.5 text-[1.25rem] text-white" style={{ fontFamily: "var(--font-display)" }}>GH₵ {settings.bookingDeposit}</b>refundable booking</span>
            <span><b className="mr-1.5 text-[1.25rem] text-white" style={{ fontFamily: "var(--font-display)" }}>MoMo</b>and card payments</span>
          </div>
        </div>
      </header>

      <main>
        <section id="apartments" className="relative overflow-hidden pb-[88px] pt-[72px]" aria-labelledby="apTitle">
          <div className="blob blob-1" style={{ top: -80, left: -120, width: 420, height: 420 }} aria-hidden="true" />
          <div className="blob blob-2" style={{ bottom: -120, right: -80, width: 360, height: 360 }} aria-hidden="true" />
          <div className="wrap relative z-[1]">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="apTitle" className="text-[clamp(1.7rem,3.5vw,2.4rem)]">Our apartment complexes</h2>
                <p className="mb-0 mt-1.5" style={{ color: "var(--muted)" }}>Choose a complex to see its apartment types and what&apos;s free.</p>
              </div>
              {areas.length > 1 && (
                <nav className="glass flex flex-wrap gap-1.5 rounded-full p-1.5" aria-label="Filter by area">
                  {[undefined, ...areas].map((a) => {
                    const active = a === area;
                    return (
                      <Link
                        key={a ?? "all"}
                        href={a ? `/?area=${encodeURIComponent(a)}#apartments` : "/#apartments"}
                        scroll={false}
                        aria-current={active ? "true" : undefined}
                        className="rounded-full px-4 py-1.5 font-medium no-underline transition-colors duration-300"
                        style={active ? { background: "var(--accent)", color: "var(--accent-ink)" } : { color: "var(--muted)" }}
                      >
                        {a ?? "All"}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>

            {complexes.length ? (
              <div className="grid gap-[22px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
                {complexes.map((c, i) => <ComplexCard key={c.id} complex={c} index={i} showPrices={!!session} />)}
              </div>
            ) : (
              <div className="glass rounded-[22px] px-4 py-12 text-center" style={{ color: "var(--muted)" }}>
                Nothing is free {area ? `in ${area} ` : ""}right now. Check back soon{area ? " or choose another area" : ""}.
              </div>
            )}
            {!session && (
              <p className="mt-5 text-[0.9rem]" style={{ color: "var(--muted)" }}>
                Prices show after you <Link href="/register" style={{ color: "var(--accent)", fontWeight: 600 }}>sign up</Link> or{" "}
                <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600 }}>log in</Link>.
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="py-7 text-[0.9rem]" style={{ borderTop: "1px solid var(--glass-line)", color: "var(--muted)" }}>
        <div className="wrap flex flex-wrap justify-between gap-3">
          <span>© {new Date().getFullYear()} Altheo Homes</span>
          <span>hello@altheohomes.com · +233 00 000 0000</span>
        </div>
      </footer>
    </>
  );
}
