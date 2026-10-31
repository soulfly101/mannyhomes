import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Shows a spinner and "Please wait…", and ignores clicks until the action finishes. */
  busy?: boolean;
};

/** Pill button. At most one `primary` per screen (DESIGN.md → Buttons). */
export function Button({ variant = "secondary", busy = false, className, children, onClick, type = "button", ...rest }: Props) {
  return (
    <button
      {...rest}
      type={type}
      className={["btn", `btn-${variant}`, className].filter(Boolean).join(" ")}
      aria-busy={busy || undefined}
      onClick={busy ? (e) => e.preventDefault() : onClick}
    >
      {busy ? (
        <>
          <span className="btn-spinner" aria-hidden="true" />
          Please wait…
        </>
      ) : (
        children
      )}
    </button>
  );
}
