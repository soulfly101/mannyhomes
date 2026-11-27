import { Reveal } from "../components/Reveal";
import { GlassPanel } from "@/components/ui/glass-panel";
import { GlassScene } from "@/components/ui/glass-scene";
import { CALL_TO_ACTION } from "./content";
import { Eyebrow, buttonClass, sectionClass } from "./parts";

/** The invitation to get in touch: a glass panel sliding in over a lounge photo (DESIGN.md → Glass). */
export function CallToAction() {
  return (
    <section aria-labelledby="cta-title" className={`${sectionClass} py-12 md:py-20`}>
      <GlassScene photo={CALL_TO_ACTION.photo} className="overflow-hidden rounded-[2rem] p-4 sm:p-8 md:p-12">
        <Reveal from="left">
          <GlassPanel className="flex max-w-xl flex-col items-start gap-4 p-6 md:p-10">
            <Eyebrow>{CALL_TO_ACTION.eyebrow}</Eyebrow>
            <h2 id="cta-title" className="text-4xl font-bold tracking-tight md:text-5xl">
              {CALL_TO_ACTION.title}
            </h2>
            <p className="max-w-md text-muted-foreground">{CALL_TO_ACTION.lead}</p>
            <a href="#contact" className={buttonClass}>
              {CALL_TO_ACTION.button}
            </a>
          </GlassPanel>
        </Reveal>
      </GlassScene>
    </section>
  );
}
