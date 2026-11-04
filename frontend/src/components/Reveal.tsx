import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const canAnimate = () =>
  typeof IntersectionObserver !== "undefined" &&
  !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

type RevealProps = {
  children?: ReactNode;
  /** Where it comes in from as it scrolls into view: photos from the sides, text and cards from below. */
  from?: "left" | "right" | "up";
  /** Milliseconds to wait, for staggering a row of cards. */
  delay?: number;
  as?: ElementType;
  className?: string;
};

/**
 * Animates its contents in once, the first time they scroll into view.
 * Content is never left hidden: without IntersectionObserver or with reduced motion, it just shows.
 */
export function Reveal({ children, from = "up", delay = 0, as: Tag = "div", className }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(() => !canAnimate());

  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <Tag ref={ref} data-visible={visible} style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined} className={cn("reveal", `reveal-${from}`, className)}>
      {children}
    </Tag>
  );
}

/** Photos alternate between the two sides. */
export const sideFor = (index: number) => (index % 2 === 0 ? "left" : "right");
