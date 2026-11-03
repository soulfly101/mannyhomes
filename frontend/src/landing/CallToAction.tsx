import { CALL_TO_ACTION } from "./content";
import { Eyebrow, buttonClass, sectionClass } from "./parts";

export function CallToAction() {
  return (
    <section aria-labelledby="cta-title" className={`${sectionClass} py-20 md:py-28`}>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          <Eyebrow>{CALL_TO_ACTION.eyebrow}</Eyebrow>
          <h2 id="cta-title" className="font-serif text-4xl font-medium md:text-5xl">
            {CALL_TO_ACTION.title}
          </h2>
        </div>
        <div className="flex flex-col items-start gap-4 md:items-end">
          <p className="max-w-md text-muted-foreground md:text-right">{CALL_TO_ACTION.lead}</p>
          <a href="#contact" className={buttonClass}>
            {CALL_TO_ACTION.button}
          </a>
        </div>
      </div>
      <img src={CALL_TO_ACTION.photo} alt="An Altheo Homes lounge" className="mt-10 aspect-[21/9] w-full rounded-md object-cover" />
    </section>
  );
}
