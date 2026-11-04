import { useState } from "react";
import { Reveal, sideFor } from "../components/Reveal";
import { cn } from "@/lib/utils";
import { GALLERY } from "./content";
import { SectionHead, chipClass, photoPop, photoZoom, sectionClass } from "./parts";

/** Photos by room type, chosen with tabs. They slide in from the sides and pop out on hover. */
export function Gallery() {
  const [tab, setTab] = useState(0);
  const photos = GALLERY.tabs[tab]?.photos ?? [];

  return (
    <section aria-labelledby="gallery-title" className={`${sectionClass} py-20 md:py-28`}>
      <SectionHead id="gallery-title" eyebrow={GALLERY.eyebrow} title={GALLERY.title} />
      <div role="tablist" aria-label="Room types" className="mt-10 flex flex-wrap gap-2">
        {GALLERY.tabs.map((t, i) => (
          <button key={t.label} type="button" role="tab" id={`gallery-tab-${i}`} aria-selected={tab === i} aria-controls="gallery-panel" onClick={() => setTab(i)} className={chipClass(tab === i)}>
            {t.label}
          </button>
        ))}
      </div>
      <div id="gallery-panel" role="tabpanel" aria-labelledby={`gallery-tab-${tab}`} className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {photos.map((src, i) => (
          <Reveal key={`${tab}-${src}-${i}`} from={sideFor(i)} delay={i * 80} className={cn(i === 0 ? "col-span-2 aspect-[16/10] md:col-span-1 md:row-span-2 md:aspect-auto" : "aspect-[4/3]")}>
            <div className={`${photoPop} h-full`}>
              <img src={src} alt={`${GALLERY.tabs[tab].label}, photo ${i + 1}`} className={photoZoom} />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
