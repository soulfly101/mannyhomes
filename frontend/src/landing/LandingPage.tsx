import { useAllResidences } from "../residences/data";
import { CallToAction } from "./CallToAction";
import { Experience } from "./Experience";
import { Facilities } from "./Facilities";
import { Footer } from "./Footer";
import { Gallery } from "./Gallery";
import { Hero } from "./Hero";
import { LocationSection } from "./LocationSection";
import { ResidencesPreview } from "./ResidencesPreview";
import { StickyHomeHeader } from "./SiteHeader";

/** Home page, modelled on the reference design the owner chose. Copy and photos live in content.ts. */
export function LandingPage() {
  // Every room type: a few for the preview, all of them for the contact form's "Residence of interest" list.
  const residences = useAllResidences();
  return (
    <div className="overflow-x-clip bg-background font-sans text-foreground">
      <Hero />
      <StickyHomeHeader />
      <main>
        <Experience />
        <ResidencesPreview residences={residences} />
        <Facilities />
        <LocationSection />
        <Gallery />
        <CallToAction />
      </main>
      <Footer residences={residences ?? []} enquiry={null} />
    </div>
  );
}
