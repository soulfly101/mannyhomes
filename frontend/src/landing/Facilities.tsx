import { Reveal, sideFor } from "../components/Reveal";
import { cn } from "@/lib/utils";
import { FACILITIES } from "./content";
import { SectionHead, photoPop, photoZoom, sectionClass } from "./parts";

/** "Everyday living, elevated": captioned photos sliding in from each side. The first spans two rows on wide screens. */
export function Facilities() {
  return (
    <section id="facilities" aria-labelledby="facilities-title" className={`${sectionClass} scroll-mt-24 py-20 md:py-28`}>
      <SectionHead id="facilities-title" eyebrow={FACILITIES.eyebrow} title={FACILITIES.title} lead={FACILITIES.lead} />
      <ul className="mt-10 grid auto-rows-[220px] gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FACILITIES.items.map((f, i) => (
          <Reveal as="li" key={f.title} from={sideFor(i)} delay={i * 60} className={cn(i === 0 && "lg:row-span-2")}>
            <div className={`${photoPop} h-full`}>
              <img src={f.photo} alt="" className={`${photoZoom} absolute inset-0`} />
              <div className="absolute inset-x-0 bottom-0 bg-overlay p-4 text-white">
                <h3 className="font-bold tracking-tight">{f.title}</h3>
                <p className="mt-1 text-sm text-white/90">{f.text}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
