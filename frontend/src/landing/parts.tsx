import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small label above a section ("The Altheo experience"). */
export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <p className={cn("text-sm font-semibold", light ? "text-white/90" : "text-primary")}>{children}</p>;
}

/** Section heading: eyebrow, serif title and an optional line on the right. `as="h1"` when it's the page's main heading. */
export function SectionHead({ eyebrow, title, lead, id, as: Heading = "h2" }: { eyebrow: string; title?: string; lead?: string; id: string; as?: "h1" | "h2" }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12">
      <div className="flex flex-col gap-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        {title && (
          <Heading id={id} className="text-4xl font-bold tracking-tight leading-tight md:text-5xl">
            {title}
          </Heading>
        )}
      </div>
      {lead && <p className="max-w-md text-muted-foreground md:text-right">{lead}</p>}
    </div>
  );
}

/** Solid accent pill button/link. Lifts 2px on hover. */
export const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold tracking-wide text-primary-foreground transition duration-300 ease-out hover:bg-primary/90 motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Link in the hero menu: rises 2px and a thin underline slides in from the left on hover or keyboard focus.
 * Movement is only applied when the device allows motion (`motion-safe:`).
 */
export const navLinkClass =
  "relative inline-flex min-h-11 items-center text-white/85 transition duration-300 ease-out after:absolute after:bottom-2 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-white after:transition-transform after:duration-300 after:ease-out hover:text-white hover:after:scale-x-100 focus-visible:text-white focus-visible:after:scale-x-100 motion-safe:hover:-translate-y-0.5";

/**
 * Rounded filter chip (location choices). Pops out on hover: grows slightly, rises and gets a soft shadow;
 * presses in when clicked. Movement only when the device allows motion.
 */
export const chipClass = (selected: boolean) =>
  cn(
    "min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition duration-200 ease-out hover:shadow-sm motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-105 motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground/30 hover:bg-secondary",
  );

export const outlineButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-foreground/20 bg-transparent px-6 py-3 text-sm font-semibold tracking-wide text-foreground transition hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A photo (or card with a photo) that pops out on hover: it grows, rises and gets a deeper shadow.
 * Put `photoZoom` on the image inside so it also zooms within its frame. Movement only when the device allows motion.
 */
export const photoPop =
  "group/photo relative block overflow-hidden rounded-xl bg-muted shadow-sm transition duration-300 ease-out hover:z-10 hover:shadow-xl motion-safe:hover:-translate-y-1.5 motion-safe:hover:scale-[1.03]";
export const photoZoom = "h-full w-full object-cover transition-transform duration-500 ease-out motion-safe:group-hover/photo:scale-105";

export const sectionClass = "mx-auto w-full max-w-6xl px-4 sm:px-6";
