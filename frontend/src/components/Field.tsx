import { useId, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

/** Labelled input with optional hint and error (DESIGN.md → Form fields). */
export function Field({ label, hint, error, id, className, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["field", className].filter(Boolean).join(" ")}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <input {...rest} id={inputId} className="field-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
