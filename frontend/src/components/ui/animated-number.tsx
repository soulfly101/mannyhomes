import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * A number that counts up to its value (DESIGN.md → Glass). Screen readers get the final value straight away;
 * reduced-motion users just see it.
 */
export function AnimatedNumber({ value, format = String }: { value: number; format?: (n: number) => string }) {
  const shown = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  useGSAP(
    () => {
      const el = shown.current;
      const start = from.current;
      from.current = value;
      if (!el) return;
      if (prefersReducedMotion() || start === value) {
        el.textContent = format(value);
        return;
      }
      const state = { n: start };
      gsap.to(state, {
        n: value,
        duration: 0.9,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = format(Math.round(state.n));
        },
        onComplete: () => {
          el.textContent = format(value);
        },
      });
    },
    { dependencies: [value] },
  );
  return (
    <>
      <span ref={shown} aria-hidden="true">
        {format(value)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
