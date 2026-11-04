import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";
import { AuthField, FormError } from "@/components/ui/sign-in";
import { cn } from "@/lib/utils";
import { formatCedis } from "../format";
import { buttonClass } from "../landing/parts";
import { NETWORKS, type Network } from "./bookings";

const localPhone = (phone: string | null | undefined) => (phone ? `0${phone.replace(/^\+233/, "")}` : "");

/** Mobile Money number and network, and the button that sends the prompt. */
export function MomoForm({ amount, onPay }: { amount: number; onPay: (phone: string, network: Network) => Promise<void> }) {
  const { user } = useAuth();
  const [phone, setPhone] = useState(localPhone(user?.phone));
  const [network, setNetwork] = useState<Network | "">("");
  const [errors, setErrors] = useState<{ phone?: string; network?: string }>({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problems: typeof errors = {};
    if (!/^(0|\+233)\d{9}$/.test(phone.replace(/[\s\-()]/g, ""))) problems.phone = "Enter a Ghana phone number, like 024 123 4567.";
    if (!network) problems.network = "Choose your Mobile Money network.";
    setErrors(problems);
    setBanner("");
    if (Object.keys(problems).length > 0 || !network) return;
    setBusy(true);
    try {
      await onPay(phone, network);
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : "Couldn't start the payment. Try again.");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {banner && <FormError>{banner}</FormError>}
      <AuthField
        label="Mobile Money number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="024 123 4567"
        hint="You'll get a prompt on this phone to enter your PIN."
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
      />
      <fieldset>
        <legend className="text-sm font-medium text-muted-foreground">Network</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {NETWORKS.map((n) => (
            <button
              key={n.code}
              type="button"
              aria-pressed={network === n.code}
              onClick={() => setNetwork(n.code)}
              className={cn(
                "min-h-14 rounded-xl border-2 px-2 py-3 text-sm font-semibold transition duration-200 hover:shadow-sm motion-safe:hover:-translate-y-0.5",
                network === n.code ? "border-primary bg-accent" : "border-border bg-card hover:border-foreground/30",
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
        {errors.network && (
          <p role="alert" className="mt-1.5 text-sm font-medium text-destructive">
            {errors.network}
          </p>
        )}
      </fieldset>
      <div>
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-progress disabled:opacity-80`}>
          {busy ? "Please wait…" : `Pay ${formatCedis(amount)}`}
        </button>
      </div>
    </form>
  );
}
