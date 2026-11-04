import { MapPin, ShieldCheck, Smartphone, Wrench } from "lucide-react";
import { Reveal } from "../components/Reveal";
import { EXPERIENCE } from "./content";
import { SectionHead, photoPop, photoZoom, sectionClass } from "./parts";

// In the same order as EXPERIENCE.points.
const ICONS = [MapPin, Smartphone, Wrench, ShieldCheck];

/** "The Altheo experience": a photo that slides in, next to four selling points. */
export function Experience() {
  return (
    <section aria-labelledby="experience-title" className={`${sectionClass} py-20 md:py-28`}>
      <h2 id="experience-title" className="sr-only">
        {EXPERIENCE.eyebrow}
      </h2>
      <SectionHead id="experience-head" eyebrow={EXPERIENCE.eyebrow} lead={EXPERIENCE.lead} />
      <div className="mt-10 grid items-stretch gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Reveal from="left">
          <div className={`${photoPop} h-full min-h-72`}>
            <img src={EXPERIENCE.photo} alt="A bright Altheo Homes living room" className={`${photoZoom} absolute inset-0`} />
          </div>
        </Reveal>
        <ul className="grid gap-4 sm:grid-cols-2">
          {EXPERIENCE.points.map((p, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <Reveal as="li" key={p.title} delay={i * 80} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-accent text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-bold tracking-tight">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
