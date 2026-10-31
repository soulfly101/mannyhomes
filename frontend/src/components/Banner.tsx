import type { ReactNode } from "react";

/** Inline message above a form or list (DESIGN.md → Feedback). Errors are announced to screen readers. */
export function Banner({ tone = "danger", children }: { tone?: "danger" | "info"; children: ReactNode }) {
  return (
    <p className={`banner banner-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {children}
    </p>
  );
}
