import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { cn } from "@/lib/utils";
import { BRAND, HERO } from "./content";
import { Eyebrow, buttonClass } from "./parts";

const NAV = [
  { label: "Residences", href: "#residences" },
  { label: "Facilities", href: "#facilities" },
  { label: "Location", href: "#location" },
  { label: "Contact", href: "#contact" },
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function AccountLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  if (user === undefined) return null;
  if (!user) {
    return (
      <>
        <Link to="/login" onClick={onNavigate} className="inline-flex min-h-11 items-center text-sm font-medium text-white/90 hover:text-white">
          Log in
        </Link>
        <Link to="/register" onClick={onNavigate} className={cn(buttonClass, "bg-white text-ink hover:bg-white/90")}>
          Sign up
        </Link>
      </>
    );
  }
  return (
    <>
      {user.role === "admin" && (
        <Link to="/admin/buildings" onClick={onNavigate} className="inline-flex min-h-11 items-center text-sm font-medium text-white/90 hover:text-white">
          Buildings
        </Link>
      )}
      <span className="text-sm text-white/80">{user.name}</span>
      <button type="button" onClick={() => void logout()} className="min-h-11 text-sm font-medium text-white/90 underline-offset-4 hover:text-white hover:underline">
        Log out
      </button>
    </>
  );
}

/** Full-width hero: the owner's building video (or photo) under a solid overlay, with the site menu on top. */
export function Hero() {
  const [videoFailed, setVideoFailed] = useState(false);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [open, setOpen] = useState(false);
  useEffect(() => setReduced(prefersReducedMotion()), []);
  const showVideo = !reduced && !videoFailed;

  return (
    <header id="top" className="relative isolate flex min-h-[88svh] flex-col overflow-hidden bg-ink text-white">
      {showVideo ? (
        <video
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          src={HERO.video}
          poster={HERO.poster}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <img src={HERO.poster} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 -z-10 bg-overlay" aria-hidden="true" />

      <nav aria-label="Main" className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <a href="#top" className="flex min-h-11 items-center gap-3 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-white font-serif text-xl font-semibold text-ink">{BRAND.monogram}</span>
          <span className="font-serif text-2xl font-medium">{BRAND.name}</span>
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="inline-flex min-h-11 items-center text-sm font-medium uppercase tracking-[0.14em] text-white/85 hover:text-white">
                {n.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-5 md:flex">
          <AccountLinks />
        </div>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-md border border-white/30 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className="mx-4 flex flex-col gap-4 rounded-md bg-ink p-5 md:hidden">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center text-base font-medium text-white">
              {n.label}
            </a>
          ))}
          <div className="flex flex-wrap items-center gap-4 border-t border-white/15 pt-4">
            <AccountLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="mx-auto mt-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-24 sm:px-6 md:pb-24">
        <Eyebrow light>{HERO.eyebrow}</Eyebrow>
        <h1 className="max-w-3xl font-serif text-5xl font-medium leading-[1.02] sm:text-6xl md:text-7xl">{HERO.title}</h1>
        <p className="max-w-xl text-lg text-white/85">{HERO.subtitle}</p>
        <div>
          <a href="#residences" className={cn(buttonClass, "bg-white text-ink hover:bg-white/90")}>
            {HERO.cta}
          </a>
        </div>
      </div>
    </header>
  );
}
