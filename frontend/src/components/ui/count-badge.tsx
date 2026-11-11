import { cn } from "@/lib/utils";

/** A small count on a menu item, e.g. unread messages. Nothing shows at 0. The label says what's counted: one word, or [one, many]. */
export function CountBadge({ count, label, className }: { count: number; label: string | [string, string]; className?: string }) {
  if (count <= 0) return null;
  const noun = typeof label === "string" ? label : label[count === 1 ? 0 : 1];
  return (
    <span aria-label={`${count} ${noun}`} className={cn("inline-grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold leading-5 text-primary-foreground motion-safe:animate-in motion-safe:zoom-in", className)}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
