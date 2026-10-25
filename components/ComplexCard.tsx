import Link from "next/link";
import { cedis } from "@/lib/format";
import { fromPrice, type ListedComplex } from "@/lib/listings";
import { Lock } from "./RoomTypeCard";

export function ComplexCard({ complex, index, showPrices }: { complex: ListedComplex; index: number; showPrices: boolean }) {
  const free = complex.roomTypes.reduce((n, r) => n + r.free, 0);
  const from = fromPrice(complex);
  return (
    <Link
      href={`/complexes/${complex.slug}`}
      className="glass rise flex flex-col overflow-hidden rounded-[22px] no-underline transition-transform duration-500 hover:-translate-y-1.5"
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      <div className="relative aspect-[4/3] max-w-full bg-cover bg-center" style={{ backgroundImage: `url('${complex.photos[0] ?? "/photos/hero.jpg"}')` }}>
        <span className="hglass absolute left-3 top-3 rounded-full px-2.5 py-1 text-[0.8rem] font-semibold text-white">{complex.area}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-5 pb-5 pt-4">
        <h3 className="text-[1.3rem]">{complex.name}</h3>
        <div className="flex flex-wrap gap-1.5">
          {complex.roomTypes.map((r) => (
            <span
              key={r.id}
              className="rounded-full px-2.5 py-0.5 text-[0.82rem]"
              style={{ background: "var(--glass)", border: "1px solid var(--glass-line)", color: r.free ? undefined : "var(--muted)", textDecoration: r.free ? undefined : "line-through" }}
            >
              {r.name}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--glass-line)" }}>
          {showPrices ? (
            from !== undefined ? (
              <span>
                <small style={{ color: "var(--muted)" }}>from </small>
                <b className="text-[1.4rem] tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{cedis(from)}</b>{" "}
                <small style={{ color: "var(--muted)" }}>/ month</small>
              </span>
            ) : <span style={{ color: "var(--muted)" }}>Fully booked</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[0.92rem] font-medium" style={{ color: "var(--muted)" }}>
              <Lock /> Log in to see prices
            </span>
          )}
          <span className={`pill ${free ? "pill-ok" : "pill-warn"}`}>{free ? `${free} free` : "Full"}</span>
        </div>
      </div>
    </Link>
  );
}
