import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError, apiFetch } from "../api";
import type { ListingsResponse } from "../listings/types";
import { RESIDENCES } from "../landing/content";
import { SectionHead, chipClass, sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { toResidences } from "./data";
import { ResidenceCard } from "./ResidenceCard";

/** "Find your residence" (/residences): every listed room type as photo cards. The filters live in the address. */
export function ResidencesPage() {
  const [params, setParams] = useSearchParams();
  const location = params.get("location") ?? "";
  const roomType = params.get("room_type") ?? "";
  const query = params.toString();
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Ignore answers to older requests, so quickly switching filters can't show stale results.
    let current = true;
    setError("");
    const wanted = new URLSearchParams();
    if (location) wanted.set("location", location);
    if (roomType) wanted.set("room_type", roomType);
    const search = wanted.toString();
    apiFetch<ListingsResponse>(`/api/listings${search ? `?${search}` : ""}`)
      .then((d) => current && setData(d))
      .catch((e) => current && setError(e instanceof ApiError ? e.message : "Couldn't load residences. Try again."));
    return () => {
      current = false;
    };
  }, [location, roomType]);

  const residences = useMemo(() => (data ? toResidences(data) : []), [data]);
  const choose = (key: "location" | "room_type", value: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });

  return (
    <SitePage>
      <section aria-labelledby="residences-title" className={`${sectionClass} py-12 md:py-16`}>
        <SectionHead as="h1" id="residences-title" eyebrow={RESIDENCES.eyebrow} title={RESIDENCES.title} lead={RESIDENCES.lead} />

        {data && (data.filters.locations.length > 1 || data.filters.room_types.length > 1) && (
          <div className="mt-10 flex flex-col gap-3">
            {data.filters.locations.length > 1 && (
              <div role="group" aria-label="Choose a location" className="flex flex-wrap gap-2">
                {["", ...data.filters.locations].map((l) => (
                  <button key={l || "all"} type="button" aria-pressed={location === l} onClick={() => choose("location", l)} className={chipClass(location === l)}>
                    {l || "All locations"}
                  </button>
                ))}
              </div>
            )}
            {data.filters.room_types.length > 1 && (
              <div role="group" aria-label="Choose a room type" className="flex flex-wrap gap-2">
                {["", ...data.filters.room_types].map((t) => (
                  <button key={t || "all"} type="button" aria-pressed={roomType === t} onClick={() => choose("room_type", t)} className={chipClass(roomType === t)}>
                    {t || "All room types"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-8 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {!data && !error && <p className="mt-8 text-muted-foreground">Loading residences…</p>}
        {data && residences.length === 0 && (
          <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
            {location || roomType ? "Nothing matches those filters right now. Try another location or room type." : "No residences are listed yet. Check back soon."}
          </p>
        )}

        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Residences">
          {residences.map((r, i) => (
            <ResidenceCard key={r.id} r={r} index={i} heading="h2" showPricePrompt />
          ))}
        </ul>
        {data && !data.prices_visible && residences.length > 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            <Link to={`/login?next=${encodeURIComponent(`/residences${query ? `?${query}` : ""}`)}`} className="font-semibold text-foreground underline-offset-4 hover:underline">
              Log in
            </Link>{" "}
            to see prices.
          </p>
        )}
      </section>
    </SitePage>
  );
}
