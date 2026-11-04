import { useState, type ReactNode } from "react";
import { useAllResidences, type Residence } from "../residences/data";
import { Footer } from "./Footer";
import { SiteHeader } from "./SiteHeader";

/** Layout for every public page except the home page: the menu bar, the page, and the footer with the contact form. */
export function SitePage({ children, enquiry = null }: { children: ReactNode; enquiry?: Residence | null }) {
  const residences = useAllResidences();
  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-clip bg-background font-sans text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <div className="print:hidden">
        <Footer residences={residences ?? []} enquiry={enquiry} />
      </div>
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
