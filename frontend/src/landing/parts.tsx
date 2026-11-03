import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small uppercase label with a dot, above each section ("• FACILITIES"). */
export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]", light ? "text-white/85" : "text-muted-foreground")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", light ? "bg-white" : "bg-foreground")} aria-hidden="true" />
      {children}
    </p>
  );
}

/** Section heading: eyebrow, serif title and an optional line on the right. */
export function SectionHead({ eyebrow, title, lead, id }: { eyebrow: string; title?: string; lead?: string; id: string }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12">
      <div className="flex flex-col gap-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        {title && (
          <h2 id={id} className="font-serif text-4xl font-medium leading-tight md:text-5xl">
            {title}
          </h2>
        )}
      </div>
      {lead && <p className="max-w-md text-muted-foreground md:text-right">{lead}</p>}
    </div>
  );
}

/** Solid navy button/link with small corners, as in the reference design. */
export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const outlineButtonClass =
  "inline-flex items-center justify-center rounded-md border border-foreground/20 bg-transparent px-5 py-3 text-sm font-semibold tracking-wide text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const sectionClass = "mx-auto w-full max-w-6xl px-4 sm:px-6";
