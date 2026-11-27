import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tag = "div" | "section" | "article" | "aside" | "header" | "nav" | "li";

/**
 * A frosted-glass panel (DESIGN.md → Glass). Put it over a `GlassScene` or a photo, never over plain colour.
 * `strong` makes it more opaque, for text straight over a photo. Falls back to a solid card by itself.
 */
export function GlassPanel({ as: Tag = "div", strong, className, ...rest }: HTMLAttributes<HTMLElement> & { as?: Tag; strong?: boolean }) {
  return <Tag {...rest} className={cn("glass-panel", strong && "glass-strong", className)} />;
}
