import { useState, type ReactNode } from "react";
import { GlassScene } from "@/components/ui/glass-scene";
import { useAllResidences, type Residence } from "../residences/data";
import { useScenePhoto } from "../residences/scenePhoto";
import { Footer } from "./Footer";
import { SiteHeader } from "./SiteHeader";

/**
 * Layout for every public page except the home page: the glass menu bar, the page on a frosted stage over the
 * owner's building photo (or `photo`, e.g. the room's own), and the footer with the contact form (DESIGN.md → Glass).
 */
export function SitePage({ children, enquiry = null, photo }: { children: ReactNode; enquiry?: Residence | null; photo?: string }) {
  const residences = useAllResidences();
  const scene = useScenePhoto();
  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-clip bg-background font-sans text-foreground">
      <SiteHeader />
      <GlassScene photo={photo ?? scene} fixed className="flex-1">
        <main className="mx-auto w-full max-w-6xl px-2 py-4 sm:px-4 md:py-8">
          <div className="glass-panel glass-stage min-h-[50dvh] py-2 print:border-0 print:shadow-none">{children}</div>
        </main>
        <div className="print:hidden">
          <Footer residences={residences ?? []} enquiry={enquiry} />
        </div>
      </GlassScene>
    </div>
  );
}

/** "Enquire" on a page: prefills the contact form in the footer with this residence and scrolls to it. */
export function useEnquiry() {
  const [enquiry, setEnquiry] = useState<Residence | null>(null);
  const enquire = (r: Residence) => {
    setEnquiry({ ...r });
    document.getElementById("contact")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  return { enquiry, enquire };
}
