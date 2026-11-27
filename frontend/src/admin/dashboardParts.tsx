import type { ReactNode } from "react";

/** A dashboard panel: glass over the admin area's photo (DESIGN.md → Glass). */
export const panelClass = "glass-panel p-5 md:p-6";
export const emptyClass = "mt-4 rounded-xl border border-dashed border-foreground/20 p-8 text-center text-sm text-muted-foreground";
export const selectClass = "min-h-11 rounded-xl border border-foreground/15 bg-card px-3 text-sm font-medium text-foreground";

/** A dashboard card with its title and an optional control on the right. */
export function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`${panelClass} ${className}`}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
