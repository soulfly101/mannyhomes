import { cn } from "@/lib/utils";

/** An on/off switch whose thumb slides across. The label names it; the words ON and OFF say how it stands. */
export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl text-left font-semibold transition duration-200 motion-safe:hover:-translate-y-0.5"
    >
      <span>{label}</span>
      <span className="flex shrink-0 items-center gap-3">
        <span aria-hidden="true" className="text-sm text-muted-foreground">
          {checked ? "ON" : "OFF"}
        </span>
        <span aria-hidden="true" className={cn("relative h-7 w-12 rounded-full border border-border transition duration-200", checked ? "bg-primary" : "bg-muted")}>
          <span className={cn("absolute left-0.5 top-0.5 h-5.5 w-5.5 rounded-full bg-card shadow-sm transition-transform duration-200", checked && "translate-x-5")} />
        </span>
      </span>
    </button>
  );
}
