import { Link } from "react-router";
import type { Residence } from "../residences/data";
import { ResidenceCard } from "../residences/ResidenceCard";
import { RESIDENCES } from "./content";
import { SectionHead, buttonClass, sectionClass } from "./parts";

const PREVIEW_COUNT = 3;

/** A taste of the residences on the home page (rooms that are free first), linking to the full list at /residences. */
export function ResidencesPreview({ residences }: { residences: Residence[] | null }) {
  const shown = [...(residences ?? [])].sort((a, b) => Number(b.quantity > 0) - Number(a.quantity > 0)).slice(0, PREVIEW_COUNT);
  return (
    <section id="residences" aria-labelledby="residences-title" className={`${sectionClass} scroll-mt-24 py-20 md:py-28`}>
      <SectionHead id="residences-title" eyebrow={RESIDENCES.eyebrow} title={RESIDENCES.title} lead={RESIDENCES.lead} />
      {residences === null && <p className="mt-8 text-muted-foreground">Loading residences…</p>}
      {residences?.length === 0 && (
        <p className="mt-8 rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">No residences are listed yet. Check back soon.</p>
      )}
      {shown.length > 0 && (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Featured residences">
          {shown.map((r, i) => (
            <ResidenceCard key={r.id} r={r} index={i} />
          ))}
        </ul>
      )}
      <div className="mt-10">
        <Link to="/residences" className={buttonClass}>
          View all residences
        </Link>
      </div>
    </section>
  );
}
