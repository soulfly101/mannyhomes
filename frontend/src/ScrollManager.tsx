import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/** How long to keep a "/#section" link aimed at its section while content above it is still loading. */
const SETTLE_MS = 1500;
const CHECK_MS = 100;

/**
 * New pages start at the top; links like "/#facilities" scroll to that section.
 * On the same page it scrolls smoothly. Coming from another page it jumps straight there, and because
 * content above the section (e.g. the residences preview) can load a moment later and push it down,
 * it keeps re-aiming for a short while, unless the person starts scrolling themselves.
 * Uses timers rather than animation frames so it also works while the tab is in the background.
 */
export function ScrollManager() {
  const { pathname, hash } = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const samePage = lastPath.current === pathname;
    lastPath.current = pathname;
    if (!hash) {
      if (!samePage) document.documentElement.scrollTo?.({ top: 0 });
      return;
    }
    const target = () => document.getElementById(decodeURIComponent(hash.slice(1)));
    const aim = (behavior: ScrollBehavior) => target()?.scrollIntoView?.({ behavior, block: "start" });
    if (samePage) {
      aim("smooth");
      return;
    }

    aim("instant");
    let lastTop: number | null = null;
    const check = window.setInterval(() => {
      const top = target()?.getBoundingClientRect().top;
      if (top === undefined) return;
      // Re-aim only when the section moved (something above it loaded), not on every tick.
      if (lastTop === null || Math.abs(top - lastTop) > 1) aim("instant");
      lastTop = target()?.getBoundingClientRect().top ?? null;
    }, CHECK_MS);
    const stop = () => window.clearInterval(check);
    const timer = window.setTimeout(stop, SETTLE_MS);
    const events = ["wheel", "touchstart", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, stop, { once: true, passive: true }));
    return () => {
      stop();
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, stop));
    };
  }, [pathname, hash]);
  return null;
}
