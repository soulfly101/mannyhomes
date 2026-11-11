import type { ReactNode } from "react";

export const panelClass = "rounded-xl border border-border bg-card p-5 shadow-sm md:p-6";
export const emptyClass = "mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground";
export const selectClass = "min-h-11 rounded-xl border border-border bg-secondary px-3 text-sm font-medium text-foreground";

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
