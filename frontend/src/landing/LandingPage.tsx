import type { ReactNode } from "react";
import { GlassScene } from "@/components/ui/glass-scene";
import { useAllResidences } from "../residences/data";
import { useScenePhoto } from "../residences/scenePhoto";
import { CallToAction } from "./CallToAction";
import { Experience } from "./Experience";
import { Facilities } from "./Facilities";
import { Footer } from "./Footer";
import { Gallery } from "./Gallery";
import { Hero } from "./Hero";
import { LocationSection } from "./LocationSection";
import { ResidencesPreview } from "./ResidencesPreview";
import { StickyHomeHeader } from "./SiteHeader";

/** One home-page section on its own frosted panel, with the building photo showing between them (DESIGN.md → Glass). */
function Pane({ children }: { children: ReactNode }) {
  return <div className="glass-panel glass-stage mx-auto w-full max-w-6xl">{children}</div>;
}

/** Home page, modelled on the reference design the owner chose. Copy and photos live in content.ts. */
export function LandingPage() {
  // Every room type: a few for the preview, all of them for the contact form's "Residence of interest" list.
  const residences = useAllResidences();
  const scene = useScenePhoto();
  return (
    <div className="overflow-x-clip bg-background font-sans text-foreground">
      <Hero />
      <StickyHomeHeader />
      <GlassScene photo={scene} fixed>
        <main className="flex flex-col gap-6 px-2 py-6 sm:px-4 md:gap-10 md:py-10">
          <Pane>
            <Experience />
          </Pane>
          <Pane>
            <ResidencesPreview residences={residences} />
          </Pane>
          <Pane>
            <Facilities />
          </Pane>
          <Pane>
            <LocationSection />
          </Pane>
          <Pane>
            <Gallery />
          </Pane>
          <CallToAction />
        </main>
        <Footer residences={residences ?? []} enquiry={null} />
      </GlassScene>
    </div>
  );
}
