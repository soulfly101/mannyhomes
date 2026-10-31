import type { HTMLAttributes } from "react";

/** Glass card (DESIGN.md → Cards). Pass `as="section"` or `as="article"` for page landmarks. */
export function Card({ as: Tag = "div", className, ...rest }: HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "article" }) {
  return <Tag {...rest} className={["glass", "card", className].filter(Boolean).join(" ")} />;
}
