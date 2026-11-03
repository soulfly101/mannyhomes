import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronDown } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { ListingCard } from "./ListingCard";
import type { ListingsResponse } from "./types";

function FilterSelect({ label, value, options, all, onChange }: { label: string; value: string; options: string[]; all: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
      {label}
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full appearance-none rounded-xl border border-input bg-background pl-4 pr-10 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">{all}</option>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
      </span>
    </label>
  );
}

/** Every listed building, what it offers and what's free now, with location and room-type filters (#13). */
export function AvailableUnits() {
  const [params, setParams] = useSearchParams();
  const location = params.get("location") ?? "";
  const roomType = params.get("type") ?? "";
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams();
    if (location) query.set("location", location);
    if (roomType) query.set("room_type", roomType);
    const qs = query.toString();
    // Ignore answers to older requests, so quickly changing filters can't show stale results.
    let current = true;
    setError("");
    apiFetch<ListingsResponse>(`/api/listings${qs ? `?${qs}` : ""}`)
      .then((d) => current && setData(d))
      .catch((e) => current && setError(e instanceof ApiError ? e.message : "Couldn't load apartments. Try again."));
    return () => {
      current = false;
    };
  }, [location, roomType]);

  const setFilter = (key: "location" | "type", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const filtered = Boolean(location || roomType);
  const available = data?.buildings.reduce((n, b) => n + b.total_available, 0) ?? 0;

  return (
    <section id="apartments" aria-labelledby="units-title" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="units-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Available apartments
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            What's free right now across Altheo Homes' buildings.
            {data && !data.prices_visible && (
              <>
                {" "}
                <Link to="/register" className="font-semibold text-primary hover:underline">
                  Sign up
                </Link>{" "}
                or{" "}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  log in
                </Link>{" "}
                to see prices.
              </>
            )}
          </p>
        </div>
      </div>

      <div role="search" aria-label="Filter apartments" className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <FilterSelect label="Location" value={location} options={data?.filters.locations ?? []} all="All locations" onChange={(v) => setFilter("location", v)} />
        <FilterSelect label="Room type" value={roomType} options={data?.filters.room_types ?? []} all="Any room type" onChange={(v) => setFilter("type", v)} />
        {filtered && (
          <button type="button" onClick={() => setParams({}, { replace: true, preventScrollReset: true })} className="h-12 rounded-xl px-4 font-semibold text-primary hover:bg-secondary">
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p className="mt-6 text-muted-foreground">Loading apartments…</p>}
      {data && data.buildings.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {`${data.buildings.length} ${data.buildings.length === 1 ? "building" : "buildings"} · ${available} ${available === 1 ? "apartment" : "apartments"} available`}
        </p>
      )}
      {data && data.buildings.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
          <h3 className="text-lg font-semibold">{filtered ? "Nothing matches those filters" : "No apartments listed yet"}</h3>
          <p className="mt-1 text-muted-foreground">
            {filtered ? "Try another location or room type, or clear the filters." : "Check back soon: new apartments are added regularly."}
          </p>
        </div>
      )}
      <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data?.buildings.map((b) => (
          <ListingCard key={b.id} listing={b} />
        ))}
      </div>
    </section>
  );
}
