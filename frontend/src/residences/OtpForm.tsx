import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import { AuthField, FormError } from "@/components/ui/sign-in";
import { buttonClass } from "../landing/parts";

/** The code the payment provider sends by SMS the first time a number pays. The prompt follows once it's accepted. */
export function OtpForm({ message, onSubmit }: { message: string | null; onSubmit: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBanner("");
    if (!/^[0-9A-Za-z]{3,12}$/.test(code.trim())) {
      setError("Enter the code from the SMS.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSubmit(code.trim());
      setCode("");
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : "Couldn't check that code. Try again.");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {banner && <FormError>{banner}</FormError>}
      <AuthField
        label="SMS code"
        name="otp"
        inputMode="numeric"
        autoComplete="one-time-code"
        hint={message ?? "Enter the code sent by SMS to that number."}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={error}
      />
      <div>
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-progress disabled:opacity-80`}>
          {busy ? "Please wait…" : "Confirm code"}
        </button>
      </div>
    </form>
  );
}
