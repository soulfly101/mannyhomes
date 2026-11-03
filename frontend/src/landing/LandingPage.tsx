import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import type { ListingsResponse } from "../listings/types";
import { CallToAction } from "./CallToAction";
import { Experience } from "./Experience";
import { Facilities } from "./Facilities";
import { Footer } from "./Footer";
import { Gallery } from "./Gallery";
import { Hero } from "./Hero";
import { LocationSection } from "./LocationSection";
import { Residences, type Residence } from "./Residences";

/** Home page, modelled on the reference design the owner chose. Copy and photos live in content.ts. */
export function LandingPage() {
  const [enquiry, setEnquiry] = useState<Residence | null>(null);
  const [allResidences, setAllResidences] = useState<Residence[]>([]);

  // Every room type, for the contact form's "Residence of interest" list.
  useEffect(() => {
    apiFetch<ListingsResponse>("/api/listings")
      .then((d) =>
        setAllResidences(
          d.buildings.flatMap((b) =>
            b.room_types.map((rt) => ({
              id: rt.id,
              name: rt.name,
              description: rt.description,
              quantity: rt.quantity_available,
              rent: rt.rent,
              sanitation: rt.sanitation_fee,
              building: b.name,
              location: b.location,
            })),
          ),
        ),
      )
      .catch(() => setAllResidences([]));
  }, []);

  const enquire = (r: Residence) => {
    setEnquiry({ ...r });
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="bg-background font-sans text-foreground">
      <Hero />
      <main>
        <Experience />
        <Residences onEnquire={enquire} />
        <Facilities />
        <LocationSection />
        <Gallery />
        <CallToAction />
      </main>
      <Footer residences={allResidences} enquiry={enquiry} />
    </div>
  );
}
