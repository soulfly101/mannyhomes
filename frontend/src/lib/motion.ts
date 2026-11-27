import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP);

/** True when the person asked their device for less motion. Nothing should animate then. */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The glass workspace's view change (DESIGN.md → Glass): the new view comes into focus, rising slightly and
 * going from soft to sharp. Runs whenever `key` changes; does nothing for reduced-motion users.
 */
export function useViewTransition(ref: RefObject<HTMLElement | null>, key: string) {
  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      gsap.fromTo(
        ref.current,
        { opacity: 0.35, y: 10, filter: "blur(6px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.36, ease: "power3.out", clearProps: "opacity,transform,filter" },
      );
    },
    { dependencies: [key], scope: ref },
  );
}
