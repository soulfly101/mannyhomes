import { useState } from "react";
import { cn } from "@/lib/utils";
import { GALLERY } from "./content";
import { SectionHead, sectionClass } from "./parts";

/** Photos by room type, chosen with tabs, in a staggered layout. */
export function Gallery() {
  const [tab, setTab] = useState(0);
  const photos = GALLERY.tabs[tab]?.photos ?? [];

  return (
    <section aria-labelledby="gallery-title" className={`${sectionClass} py-20 md:py-28`}>
      <SectionHead id="gallery-title" eyebrow={GALLERY.eyebrow} title={GALLERY.title} />
      <div className="mt-10 grid gap-6 md:grid-cols-[180px_1fr]">
        <div role="tablist" aria-label="Room types" className="flex gap-4 overflow-x-auto md:flex-col">
          {GALLERY.tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              id={`gallery-tab-${i}`}
              aria-selected={tab === i}
              aria-controls="gallery-panel"
              onClick={() => setTab(i)}
              className={cn(
                "min-h-11 whitespace-nowrap border-l-2 pl-3 text-left text-sm font-semibold uppercase tracking-[0.14em] transition-colors",
                tab === i ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div id="gallery-panel" role="tabpanel" aria-labelledby={`gallery-tab-${tab}`} className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {photos.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt={`${GALLERY.tabs[tab].label}, photo ${i + 1}`}
              className={cn("w-full rounded-md object-cover", i === 0 ? "col-span-2 aspect-[16/10] md:col-span-1 md:row-span-2 md:aspect-auto md:h-full" : "aspect-[4/3]", i === 2 && "md:mt-10")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
