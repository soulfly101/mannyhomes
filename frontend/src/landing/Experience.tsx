import { EXPERIENCE } from "./content";
import { SectionHead, sectionClass } from "./parts";

/** "The Altheo experience": a wide photo and four selling points. */
export function Experience() {
  return (
    <section aria-labelledby="experience-title" className={`${sectionClass} py-20 md:py-28`}>
      <h2 id="experience-title" className="sr-only">
        {EXPERIENCE.eyebrow}
      </h2>
      <SectionHead id="experience-head" eyebrow={EXPERIENCE.eyebrow} lead={EXPERIENCE.lead} />
      <img src={EXPERIENCE.photo} alt="A bright Altheo Homes living room" className="mt-10 aspect-[21/9] w-full rounded-md object-cover" />
      <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {EXPERIENCE.points.map((p) => (
          <li key={p.title} className="border-t border-border pt-5">
            <h3 className="font-semibold">{p.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
