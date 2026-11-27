import { useEffect, useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { HERO } from "./content";
import { Eyebrow, buttonClass } from "./parts";
import { SiteNav } from "./SiteHeader";
import { GlassPanel } from "@/components/ui/glass-panel";
import { useScenePhoto } from "../residences/scenePhoto";
import { prefersReducedMotion } from "@/lib/motion";

/** Full-width hero: the owner's building video (or photo) under a solid overlay, the site menu on top, and the headline on dark glass. */
export function Hero() {
  const [videoFailed, setVideoFailed] = useState(false);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => setReduced(prefersReducedMotion()), []);
  const showVideo = !reduced && !videoFailed;
  // The owner's own building photo once they've uploaded one (#38), else the stock photo.
  const photo = useScenePhoto();

  return (
    <header id="top" className="relative isolate flex min-h-[88svh] flex-col overflow-hidden bg-ink text-white">
      {showVideo ? (
        <video
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          src={HERO.video}
          poster={photo}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <img src={photo} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 -z-10 bg-overlay" aria-hidden="true" />

      <SiteNav />

      <div className="mx-auto mt-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6 md:pb-24">
        <GlassPanel className="glass-ink flex max-w-3xl flex-col gap-6 p-6 sm:p-8 md:p-10">
          <Eyebrow light>{HERO.eyebrow}</Eyebrow>
          <h1 className="animate-element animate-delay-100 max-w-3xl text-5xl font-bold tracking-tight leading-[1.02] sm:text-6xl md:text-7xl">{HERO.title}</h1>
          <p className="animate-element animate-delay-200 max-w-xl text-lg text-white/90">{HERO.subtitle}</p>
          <div className="animate-element animate-delay-300">
            <Link to="/residences" className={cn(buttonClass, "bg-white text-ink hover:bg-white/90")}>
              {HERO.cta}
            </Link>
          </div>
        </GlassPanel>
      </div>
    </header>
  );
}
