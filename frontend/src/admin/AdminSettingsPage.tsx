import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../api";
import { Switch } from "@/components/ui/switch";
import { AuthField, FormError } from "@/components/ui/sign-in";
import { formatCedis, formatDate } from "../format";
import { buttonClass, sectionClass } from "../landing/parts";

type Penalties = { enabled: boolean; late_fee: number; freeze_tickets: boolean; enabled_on: string | null };

function summary(p: Penalties): string {
  if (!p.enabled) return "Penalties are off. Overdue sanitation bills bring no late fees or restrictions.";
  const charges = [p.late_fee > 0 && `a ${formatCedis(p.late_fee)} late fee each overdue month`, p.freeze_tickets && "no new repair tickets until cleared"].filter(Boolean).join(", and ");
  const since = p.late_fee > 0 && p.enabled_on ? ` Late fees apply to bills due from ${formatDate(p.enabled_on)}.` : "";
  return `Penalties are on: ${charges}.${since}`;
}

/** Admin settings (/admin/settings): for now, the optional penalties for overdue sanitation bills. */
export function AdminSettingsPage() {
  const [saved, setSaved] = useState<Penalties | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [lateFee, setLateFee] = useState("");
  const [freeze, setFreeze] = useState(false);
  const [feeError, setFeeError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const show = (p: Penalties) => {
    setSaved(p);
    setEnabled(p.enabled);
    setLateFee(p.late_fee > 0 ? String(p.late_fee) : "");
    setFreeze(p.freeze_tickets);
  };

  useEffect(() => {
    apiFetch<Penalties>("/api/admin/settings/penalties")
      .then(show)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the settings. Try again."));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setFeeError("");
    if (!/^\d*$/.test(lateFee.trim())) {
      setFeeError("Enter the fee in whole cedis, like 20.");
      return;
    }
    setBusy(true);
    try {
      const body = { enabled, late_fee: Number(lateFee.trim() || 0), freeze_tickets: freeze };
      show(await apiFetch<Penalties>("/api/admin/settings/penalties", { method: "PUT", body }));
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Settings</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Choose what happens when a tenant's sanitation bill goes past its due date.</p>
      {!saved && !error && <p className="mt-6 text-muted-foreground">Loading settings…</p>}
      {!saved && error && (
        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>
      )}
      {saved && (
        <form onSubmit={save} noValidate className="mt-8 flex max-w-2xl flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm">
          <Switch label="Enable Sanitation Bill Penalties" checked={enabled} onChange={setEnabled} />
          {enabled && (
            <>
              <AuthField
                label="Late fee (GH₵)"
                name="late-fee"
                inputMode="numeric"
                placeholder="20"
                hint="Charged once for each overdue month, starting the day after the due date. Leave empty for no fee. Bills already overdue when you switch this on aren't charged."
                value={lateFee}
                onChange={(e) => setLateFee(e.target.value)}
                error={feeError}
              />
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} className="mt-0.5 h-5 w-5 accent-primary" />
                <span>
                  <span className="font-semibold">Freeze new repair tickets until cleared</span>
                  <span className="mt-1 block text-muted-foreground">This starts working when repair tickets are added to the app. It covers overdue sanitation bills and unpaid late fees.</span>
                </span>
              </label>
            </>
          )}
          {error && <FormError>{error}</FormError>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-progress disabled:opacity-80`}>
              {busy ? "Saving…" : "Save settings"}
            </button>
            {notice && <span role="status" className="text-sm font-medium text-muted-foreground">{notice}</span>}
          </div>
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">{summary(saved)}</p>
        </form>
      )}
    </main>
  );
}
