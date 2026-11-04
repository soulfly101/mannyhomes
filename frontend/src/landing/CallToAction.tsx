import { Reveal } from "../components/Reveal";
import { CALL_TO_ACTION } from "./content";
import { photoPop, photoZoom, sectionClass } from "./parts";

/** A warm solid banner: the invitation to get in touch, with a photo sliding in from the side. */
export function CallToAction() {
  return (
    <section aria-labelledby="cta-title" className={`${sectionClass} py-12 md:py-20`}>
      <div className="grid items-center gap-8 overflow-hidden rounded-[2rem] bg-primary p-8 text-primary-foreground md:grid-cols-2 md:p-12">
        <Reveal from="left" className="flex flex-col items-start gap-4">
          <p className="text-sm font-semibold opacity-90">{CALL_TO_ACTION.eyebrow}</p>
          <h2 id="cta-title" className="text-4xl font-bold tracking-tight md:text-5xl">
            {CALL_TO_ACTION.title}
          </h2>
          <p className="max-w-md opacity-90">{CALL_TO_ACTION.lead}</p>
          <a href="#contact" className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition duration-300 hover:bg-white/90 motion-safe:hover:-translate-y-0.5">
            {CALL_TO_ACTION.button}
          </a>
        </Reveal>
        <Reveal from="right" className="aspect-[4/3]">
          <div className={`${photoPop} h-full`}>
            <img src={CALL_TO_ACTION.photo} alt="An Altheo Homes lounge" className={photoZoom} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
