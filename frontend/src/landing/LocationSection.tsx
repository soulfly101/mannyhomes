import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapPin } from "lucide-react";
import { apiFetch } from "../api";
import type { ListingsResponse } from "../listings/types";
import { cn } from "@/lib/utils";
import { LOCATION } from "./content";
import { SectionHead, sectionClass } from "./parts";

type Area = { name: string; buildings: { name: string; available: number }[] };

// Flat pin in the theme's colours (no shadow image), drawn with CSS so it matches the site.
const pin = L.divIcon({
  className: "",
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:var(--primary);border:3px solid var(--card)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** "Well-connected addresses": a light map with a pin per location, and the buildings and nearby places there. */
export function LocationSection() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [selected, setSelected] = useState("");
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);

  useEffect(() => {
    apiFetch<ListingsResponse>("/api/listings")
      .then((d) => {
        const byArea = new Map<string, Area>();
        for (const b of d.buildings) {
          const area = byArea.get(b.location) ?? { name: b.location, buildings: [] };
          area.buildings.push({ name: b.name, available: b.total_available });
          byArea.set(b.location, area);
        }
        const list = [...byArea.values()];
        setAreas(list);
        setSelected((s) => s || list[0]?.name || "");
      })
      .catch(() => setAreas([]));
  }, []);

  const pinned = useMemo(() => areas.filter((a) => LOCATION.areas[a.name]), [areas]);

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    map.current = L.map(mapEl.current, { scrollWheelZoom: false, attributionControl: true }).setView(
      [LOCATION.centre.lat, LOCATION.centre.lng],
      10,
    );
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 18,
    }).addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const layer = L.layerGroup(
      pinned.map((a) => {
        const { lat, lng } = LOCATION.areas[a.name];
        return L.marker([lat, lng], { icon: pin, title: a.name, keyboard: false }).on("click", () => setSelected(a.name));
      }),
    ).addTo(map.current);
    return () => {
      layer.remove();
    };
  }, [pinned]);

  useEffect(() => {
    const info = LOCATION.areas[selected];
    if (map.current && info) map.current.setView([info.lat, info.lng], 13);
  }, [selected]);

  const current = areas.find((a) => a.name === selected);
  const nearby = LOCATION.areas[selected]?.nearby ?? [];

  return (
    <section id="location" aria-labelledby="location-title" className={`${sectionClass} scroll-mt-6 py-20 md:py-28`}>
      <SectionHead id="location-title" eyebrow={LOCATION.eyebrow} title={LOCATION.title} lead={LOCATION.lead} />
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-5">
          {areas.length > 0 && (
            <div role="group" aria-label="Choose a location" className="flex flex-wrap gap-2">
              {areas.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  aria-pressed={selected === a.name}
                  onClick={() => setSelected(a.name)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                    selected === a.name ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
                  )}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
          {current ? (
            <div className="rounded-md border border-border bg-card p-6">
              <h3 className="flex items-center gap-2 font-serif text-2xl font-medium">
                <MapPin className="h-5 w-5" aria-hidden="true" />
                {current.name}
              </h3>
              <ul className="mt-4 divide-y divide-border text-sm" aria-label={`Buildings in ${current.name}`}>
                {current.buildings.map((b) => (
                  <li key={b.name} className="flex justify-between py-2">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground">{b.available ? `${b.available} available` : "Fully booked"}</span>
                  </li>
                ))}
              </ul>
              {nearby.length > 0 && (
                <>
                  <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Nearby</h4>
                  <ul className="mt-2 divide-y divide-border text-sm" aria-label={`Places near ${current.name}`}>
                    {nearby.map((p) => (
                      <li key={p.name} className="flex justify-between py-2">
                        <span>{p.name}</span>
                        <span className="text-muted-foreground">{p.minutes} min</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Our locations will appear here once buildings are listed.</p>
          )}
        </div>
        <div ref={mapEl} role="region" aria-label="Map of Altheo Homes locations" className="z-0 h-[420px] overflow-hidden rounded-md border border-border" />
      </div>
    </section>
  );
}
