import { FACILITIES } from "./content";
import { SectionHead, sectionClass } from "./parts";

/** "Everyday living, elevated": captioned photo grid. The first photo spans two rows on wide screens. */
export function Facilities() {
  return (
    <section id="facilities" aria-labelledby="facilities-title" className={`${sectionClass} scroll-mt-6 py-20 md:py-28`}>
      <SectionHead id="facilities-title" eyebrow={FACILITIES.eyebrow} title={FACILITIES.title} lead={FACILITIES.lead} />
      <ul className="mt-10 grid auto-rows-[220px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FACILITIES.items.map((f, i) => (
          <li key={f.title} className={`relative overflow-hidden rounded-md ${i === 0 ? "lg:row-span-2" : ""}`}>
            <img src={f.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-overlay p-4 text-white">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-white/85">{f.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
