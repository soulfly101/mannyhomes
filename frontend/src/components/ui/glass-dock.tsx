import type { KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type DockView<Id extends string> = { id: Id; label: string; icon: LucideIcon };

/**
 * The glass workspace's view switcher (DESIGN.md → Glass): a row of tabs on a glass rail. Arrow keys, Home and
 * End move between views. Each view's panel should have `id={dockPanelId(id)}` and `role="tabpanel"`.
 */
export function GlassDock<Id extends string>({ label, views, active, onSelect, className }: { label: string; views: DockView<Id>[]; active: Id; onSelect: (id: Id) => void; className?: string }) {
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = views.findIndex((v) => v.id === active);
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: views.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const view = views[(next + views.length) % views.length];
    onSelect(view.id);
    e.currentTarget.querySelector<HTMLButtonElement>(`#${dockTabId(view.id)}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={move} className={cn("glass-rail inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1.5 [scrollbar-width:none]", className)}>
      {views.map(({ id, label: name, icon: Icon }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            id={dockTabId(id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={dockPanelId(id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(id)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-foreground/10",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {name}
          </button>
        );
      })}
    </div>
  );
}

export const dockTabId = (id: string) => `dock-tab-${id}`;
export const dockPanelId = (id: string) => `dock-panel-${id}`;
