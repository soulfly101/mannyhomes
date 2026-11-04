import { cn } from "@/lib/utils";
import { initials } from "../format";

/** The logged-in person's initials in a small round badge. The full name stays available on hover and to screen readers. */
export function UserInitials({ name, className }: { name: string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold tracking-wide", className)}
    >
      {initials(name)}
    </span>
  );
}
