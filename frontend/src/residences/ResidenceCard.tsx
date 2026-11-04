import { Link } from "react-router";
import { MapPin } from "lucide-react";
import { Reveal, sideFor } from "../components/Reveal";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCedis } from "../format";
import { photoPop, photoZoom } from "../landing/parts";
import { availability, photoFor, type Residence } from "./data";

/** A residence as a big photo card linking to its page. It slides in from the side and pops out on hover. */
export function ResidenceCard({ r, index, heading: Heading = "h3", showPricePrompt }: { r: Residence; index: number; heading?: "h2" | "h3"; showPricePrompt?: boolean }) {
  return (
    <Reveal as="li" from={sideFor(index)} delay={(index % 3) * 100}>
      <Link to={`/residences/${r.id}`} className={cn(photoPop, "h-full bg-card text-foreground")}>
        <div className="aspect-[4/3] overflow-hidden">
          <img src={photoFor(r.name)} alt="" className={photoZoom} />
        </div>
        <div className="p-5">
          <Heading className="text-xl font-bold tracking-tight">{r.name}</Heading>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            {r.building} · {r.location}
          </p>
          {r.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Badge tone={r.quantity ? "success" : "danger"}>{availability(r.quantity)}</Badge>
            {r.rent !== null ? (
              <span className="text-base font-bold text-primary">{formatCedis(r.rent)} / month</span>
            ) : (
              showPricePrompt && <span className="text-muted-foreground">Log in for the price</span>
            )}
          </div>
        </div>
      </Link>
    </Reveal>
  );
}
