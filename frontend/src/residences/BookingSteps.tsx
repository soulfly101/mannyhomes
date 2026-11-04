import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Details", "Pay", "Confirmed"];

/** Where the tenant is in booking: 1 Details, 2 Pay, 3 Confirmed. */
export function BookingSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Booking steps" className="flex items-center gap-2 text-sm font-semibold sm:gap-3">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const here = step === current;
        return (
          <li key={label} aria-current={here ? "step" : undefined} className={cn("flex items-center gap-2 sm:gap-3", !done && !here && "text-muted-foreground")}>
            {i > 0 && <span aria-hidden="true" className={cn("h-px w-4 sm:w-8", step <= current ? "bg-primary" : "bg-border")} />}
            <span aria-hidden="true" className={cn("grid h-7 w-7 place-items-center rounded-full text-xs", done || here ? "bg-primary text-primary-foreground" : "bg-secondary")}>
              {done ? <Check className="h-4 w-4" /> : step}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
