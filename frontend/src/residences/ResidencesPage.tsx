import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { Badge } from "@/components/ui/badge";
import { formatCedis } from "../format";
import type { ListingsResponse } from "../listings/types";
import { RESIDENCES } from "../landing/content";
import { SectionHead, chipClass, sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { availability, photoFor, toResidences } from "./data";

/** "Find your residence" (/residences): every listed room type, filtered by location. The filter lives in the URL. */
export function ResidencesPage() {
  const [params, setParams] = useSearchParams();
  const location = params.get("location") ?? "";
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState("");

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

  const residences = useMemo(() => (data ? toResidences(data) : []), [data]);
  const choose = (l: string) => setParams(l ? { location: l } : {});

  return (
    <SitePage>
      <section aria-labelledby="residences-title" className={`${sectionClass} py-16 md:py-24`}>
        <SectionHead as="h1" id="residences-title" eyebrow={RESIDENCES.eyebrow} title={RESIDENCES.title} lead={RESIDENCES.lead} />

        {data && data.filters.locations.length > 1 && (
          <div role="group" aria-label="Choose a location" className="mt-10 flex flex-wrap gap-2">
            {["", ...data.filters.locations].map((l) => (
              <button key={l || "all"} type="button" aria-pressed={location === l} onClick={() => choose(l)} className={chipClass(location === l)}>
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
            No residences are listed {location ? `in ${location} ` : ""}yet. Check back soon.
          </p>
        )}

        <ul className="mt-8 border-t border-border" aria-label="Residences">
          {residences.map((r) => (
            <li key={r.id} className="border-b border-border">
              <Link
                to={`/residences/${r.id}`}
                className="group grid grid-cols-[96px_1fr] gap-4 py-6 sm:grid-cols-[160px_1fr_auto] sm:gap-8"
              >
                <img src={photoFor(r.name)} alt="" className="aspect-[4/3] w-full rounded-md object-cover" />
                <div className="min-w-0">
                  <h2 className="font-serif text-2xl font-medium sm:text-3xl">{r.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.building} · {r.location}
                  </p>
                  {r.description && <p className="mt-2 line-clamp-2 max-w-xl text-sm text-muted-foreground">{r.description}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <Badge tone={r.quantity ? "success" : "danger"}>{availability(r.quantity)}</Badge>
                    {r.rent !== null && <span className="font-semibold">{formatCedis(r.rent)} / month</span>}
                  </div>
                </div>
                <span className="col-span-2 inline-flex min-h-11 items-center gap-2 self-start justify-self-start text-sm font-medium text-muted-foreground group-hover:text-foreground sm:col-span-1 sm:justify-self-end">
                  View details
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {data && !data.prices_visible && residences.length > 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            <Link to={`/login?next=${encodeURIComponent(`/residences${location ? `?location=${encodeURIComponent(location)}` : ""}`)}`} className="font-semibold text-foreground underline-offset-4 hover:underline">
              Log in
            </Link>{" "}
            to see prices.
          </p>
        )}
      </section>
    </SitePage>
  );
}
