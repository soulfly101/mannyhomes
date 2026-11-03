import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Minus, Plus } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { formatCedis } from "../format";
import type { ListingsResponse } from "../listings/types";
import { RESIDENCES } from "./content";
import { SectionHead, buttonClass, chipClass, outlineButtonClass, sectionClass } from "./parts";

export type Residence = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  rent: number | null;
  sanitation: number | null;
  building: string;
  location: string;
};

const photoFor = (name: string) => RESIDENCES.photos[name.toLowerCase()] ?? RESIDENCES.fallback;
const availability = (n: number) => (n === 0 ? "Fully booked" : `${n} available`);

/** "Find your residence": every room type from the live inventory as an accordion, with location chips. */
export function Residences({ onEnquire }: { onEnquire: (residence: Residence) => void }) {
  const { user } = useAuth();
  const [location, setLocation] = useState("");
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    // Ignore answers to older requests, so quickly switching locations can't show stale results.
    let current = true;
    setError("");
    apiFetch<ListingsResponse>(`/api/listings${location ? `?location=${encodeURIComponent(location)}` : ""}`)
      .then((d) => current && setData(d))
      .catch((e) => current && setError(e instanceof ApiError ? e.message : "Couldn't load residences. Try again."));
    return () => {
      current = false;
    };
  }, [location]);

  const residences: Residence[] = useMemo(
    () =>
      (data?.buildings ?? []).flatMap((b) =>
        b.room_types.map((rt) => ({
          id: rt.id,
          name: rt.name,
          description: rt.description ?? b.description,
          quantity: rt.quantity_available,
          rent: rt.rent,
          sanitation: rt.sanitation_fee,
          building: b.name,
          location: b.location,
        })),
      ),
    [data],
  );

  return (
    <section id="residences" aria-labelledby="residences-title" className={`${sectionClass} scroll-mt-6 py-20 md:py-28`}>
      <SectionHead id="residences-title" eyebrow={RESIDENCES.eyebrow} title={RESIDENCES.title} lead={RESIDENCES.lead} />

      {data && data.filters.locations.length > 1 && (
        <div role="group" aria-label="Choose a location" className="mt-10 flex flex-wrap gap-2">
          {["", ...data.filters.locations].map((l) => (
            <button
              key={l || "all"}
              type="button"
              aria-pressed={location === l}
              onClick={() => {
                setLocation(l);
                setOpenId(null);
              }}
              className={chipClass(location === l)}
            >
              {l || "All locations"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-8 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p className="mt-8 text-muted-foreground">Loading residences…</p>}
      {data && residences.length === 0 && (
        <p className="mt-8 rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">
          No residences are listed yet. Check back soon.
        </p>
      )}

      <ul className="mt-8 border-t border-border" aria-label="Residences">
        {residences.map((r) => {
          const open = openId === r.id;
          const panelId = `residence-${r.id}`;
          return (
            <li key={r.id} className="border-b border-border">
              <div className="grid grid-cols-[96px_1fr] gap-4 py-6 sm:grid-cols-[160px_1fr_auto] sm:gap-8">
                <img src={photoFor(r.name)} alt="" className="aspect-[4/3] w-full rounded-md object-cover" />
                <div className="min-w-0">
                  <h3 className="font-serif text-2xl font-medium sm:text-3xl">{r.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.building} · {r.location}
                  </p>
                  {r.description && <p className="mt-2 line-clamp-2 max-w-xl text-sm text-muted-foreground">{r.description}</p>}
                </div>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="col-span-2 flex min-h-11 items-center gap-2 self-start justify-self-start text-sm font-medium text-muted-foreground hover:text-foreground sm:col-span-1 sm:justify-self-end"
                >
                  {open ? "Close" : "View details"}
                  {open ? <Minus className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                  <span className="sr-only">for {r.name} at {r.building}</span>
                </button>
              </div>
              {open && (
                <div id={panelId} className="grid gap-6 pb-8 sm:grid-cols-[160px_1fr] sm:gap-8">
                  <div className="hidden sm:block" />
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                    <dl className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
                      <dt className="text-muted-foreground">Rent</dt>
                      <dd className="font-semibold">{r.rent === null ? "Log in to see the price" : `${formatCedis(r.rent)} / month`}</dd>
                      {r.sanitation !== null && (
                        <>
                          <dt className="text-muted-foreground">Sanitation</dt>
                          <dd>{formatCedis(r.sanitation)} / month</dd>
                        </>
                      )}
                      <dt className="text-muted-foreground">Availability</dt>
                      <dd>
                        <Badge tone={r.quantity ? "success" : "danger"}>{availability(r.quantity)}</Badge>
                      </dd>
                      <dt className="text-muted-foreground">Building</dt>
                      <dd>
                        {r.building}, {r.location}
                      </dd>
                    </dl>
                    <div className="flex flex-col items-start gap-3 sm:items-end">
                      <div className="flex flex-wrap gap-3">
                        {!user && (
                          <Link to={`/register?next=${encodeURIComponent("/#residences")}`} className={buttonClass}>
                            Check availability
                          </Link>
                        )}
                        <button type="button" onClick={() => onEnquire(r)} className={user ? buttonClass : outlineButtonClass}>
                          Enquire
                        </button>
                      </div>
                      {user && <p className="text-xs text-muted-foreground">Online booking opens soon. Enquire and our team will get back to you.</p>}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
