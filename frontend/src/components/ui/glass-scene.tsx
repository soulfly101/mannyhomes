import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A photo backdrop for glass (DESIGN.md → Glass): the photo, a soft tint so text stays readable, and the content
 * on top. `fixed` keeps the photo still while the page scrolls (the admin area).
 */
export function GlassScene({ photo, fixed, className, children }: { photo: string; fixed?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("glass-scene", fixed && "glass-scene-fixed", className)}>
      <img src={photo} alt="" aria-hidden="true" className="glass-scene-photo" />
      <div className="glass-scene-tint" aria-hidden="true" />
      {children}
    </div>
  );
}
