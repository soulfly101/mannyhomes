import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { plural } from "@/lib/format";
import { MANAGER_TABS } from "@/lib/nav";
import { AppShell } from "@/components/AppShell";
import { toggleComplexListed } from "./actions";

export default async function Apartments({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireUser("MANAGER");
  const { error } = await searchParams;
  const [complexes, counts] = await Promise.all([
    prisma.property.findMany({ include: { _count: { select: { roomTypes: true } } }, orderBy: { name: "asc" } }),
    prisma.unit.groupBy({ by: ["propertyId", "status"], _count: true }),
  ]);
  const count = (propertyId: string, status?: string) =>
    counts.filter((c) => c.propertyId === propertyId && (!status || c.status === status)).reduce((n, c) => n + c._count, 0);

  return (
    <AppShell name={session.name} subtitle="Manager" tabs={MANAGER_TABS} current="/manager/apartments">
      <div className="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.9rem,4vw,2.8rem)]">Apartments</h1>
          <p className="mb-0 mt-1" style={{ color: "var(--muted)" }}>Your complexes, their apartment types and units.</p>
        </div>
        <Link href="/manager/apartments/new" className="btn btn-primary">Add complex</Link>
      </div>
      {error && <p className="pill pill-danger mt-4 inline-block whitespace-normal !rounded-2xl !px-4 !py-2.5" role="alert">{error}</p>}

      <section className="rise d1 mt-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
        {complexes.length === 0 && <div className="glass rounded-[26px] p-6" style={{ color: "var(--muted)" }}>No complexes yet. Add your first one.</div>}
        {complexes.map((c) => (
          <article key={c.id} className="glass flex flex-col overflow-hidden rounded-[26px]">
            <div className="aspect-[16/9] bg-cover bg-center" style={{ backgroundImage: `url('${c.photos[0] ?? "/photos/hero.jpg"}')` }} />
            <div className="flex flex-1 flex-col gap-2 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[1.25rem]">{c.name}</h2>
                  <span className="text-[0.9rem]" style={{ color: "var(--muted)" }}>{c.area}</span>
                </div>
                <span className={`pill ${c.listed ? "pill-ok" : "pill-warn"}`}>{c.listed ? "On the site" : "Hidden"}</span>
              </div>
              <span className="text-[0.92rem]" style={{ color: "var(--muted)" }}>
                {plural(c._count.roomTypes, "type")} · {plural(count(c.id), "unit")} · {count(c.id, "VACANT")} free · {count(c.id, "OCCUPIED")} lived in
              </span>
              <div className="mt-auto flex gap-2 pt-2">
                <Link href={`/manager/apartments/${c.id}`} className="btn btn-primary">Manage</Link>
                <form action={toggleComplexListed}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="listed" value={String(!c.listed)} />
                  <button className="btn btn-soft">{c.listed ? "Hide from site" : "Show on site"}</button>
                </form>
              </div>
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
