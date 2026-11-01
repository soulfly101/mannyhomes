import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError, apiFetch } from "../api";
import { Banner, Card } from "../components";
import { ListingCard } from "./ListingCard";
import type { ListingsResponse } from "./types";

/** Home page: every listed building, what it offers and what's free now (#13). */
export function ListingsPage() {
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
    setParams(next, { replace: true });
  };

  const filtered = Boolean(location || roomType);
  const available = data?.buildings.reduce((n, b) => n + b.total_available, 0) ?? 0;

  return (
    <main className="wrap listings-page">
      <section className="listings-hero rise" aria-labelledby="listings-title">
        <h1 id="listings-title">Find your next home</h1>
        <p className="muted">
          Apartments across Altheo Homes' buildings, with what's free right now.
          {data && !data.prices_visible && (
            <>
              {" "}
              <Link to="/register">Sign up</Link> or <Link to="/login">log in</Link> to see prices.
            </>
          )}
        </p>
      </section>

      <Card as="section" className="filters" aria-label="Filter apartments">
        <label className="field">
          <span className="field-label">Location</span>
          <select className="field-input" value={location} onChange={(e) => setFilter("location", e.target.value)}>
            <option value="">All locations</option>
            {data?.filters.locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Room type</span>
          <select className="field-input" value={roomType} onChange={(e) => setFilter("type", e.target.value)}>
            <option value="">Any room type</option>
            {data?.filters.room_types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        {filtered && (
          <button type="button" className="btn btn-ghost filters-clear" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </button>
        )}
      </Card>

      {error && <Banner>{error}</Banner>}
      {!data && !error && <p className="muted">Loading apartments…</p>}
      {data && (
        <p className="muted listings-count" aria-live="polite">
          {data.buildings.length === 0
            ? ""
            : `${data.buildings.length} ${data.buildings.length === 1 ? "building" : "buildings"} · ${available} ${available === 1 ? "apartment" : "apartments"} available`}
        </p>
      )}
      {data && data.buildings.length === 0 && (
        <Card as="section" className="empty-state">
          <h2>{filtered ? "Nothing matches those filters" : "No apartments listed yet"}</h2>
          <p className="muted">
            {filtered ? "Try another location or room type, or clear the filters." : "Check back soon: new apartments are added regularly."}
          </p>
        </Card>
      )}
      <div className="listing-grid">
        {data?.buildings.map((b, i) => (
          <ListingCard key={b.id} listing={b} index={i} />
        ))}
      </div>
    </main>
  );
}
