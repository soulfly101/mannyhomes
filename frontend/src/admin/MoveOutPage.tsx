import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { AuthField, FormError, InputWrapper } from "@/components/ui/sign-in";
import { formatCedis, formatDate } from "../format";
import { buttonClass, outlineButtonClass, sectionClass } from "../landing/parts";
import type { MoveOut } from "../moveouts/moveouts";

type Preview = {
  tenancy_id: string;
  tenant_name: string;
  room_number: string;
  building: string;
  start_date: string;
  deposits: { label: string; number: string; amount: number; paid: number }[];
  deposits_held: number;
  arrears: { bill_id: number; number: string; description: string; due_date: string; balance: number }[];
  blocked_reason: string | null;
};

type Arrears = { take: boolean; amount: string };
type Damage = { key: number; reason: string; amount: string };

const today = () => new Date().toISOString().slice(0, 10);
const cedis = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
const smallInput = "w-full rounded-md bg-transparent px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none";

/** Checking a tenant out (/admin/tenants/:tenancyId/move-out): deductions from the deposits, then the room is freed. */
export function MoveOutPage() {
  const { tenancyId } = useParams();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [day, setDay] = useState(today());
  const [arrears, setArrears] = useState<Record<number, Arrears>>({});
  const [damage, setDamage] = useState<Damage[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<MoveOut | null>(null);

  useEffect(() => {
    apiFetch<Preview>(`/api/admin/tenancies/${tenancyId}/move-out`)
      .then((p) => {
        setPreview(p);
        // Arrears are offered for the deposit to cover, ticked, as far as the deposit goes.
        let left = p.deposits_held;
        const start: Record<number, Arrears> = {};
        for (const a of p.arrears) {
          const amount = Math.min(a.balance, left);
          left -= amount;
          start[a.bill_id] = { take: amount > 0, amount: String(amount > 0 ? amount : a.balance) };
        }
        setArrears(start);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Couldn't load this tenant. Try again."));
  }, [tenancyId]);

  const lines = [
    ...(preview?.arrears ?? [])
      .filter((a) => arrears[a.bill_id]?.take)
      .map((a) => ({ reason: `Arrears: ${a.description}`, amount: cedis(arrears[a.bill_id].amount), bill_id: a.bill_id, max: a.balance, label: a.number })),
    ...damage.map((d) => ({ reason: d.reason.trim(), amount: cedis(d.amount), bill_id: null, max: Infinity, label: d.reason.trim() || "A deduction" })),
  ];
  const total = lines.reduce((n, l) => n + (Number.isFinite(l.amount) ? l.amount : 0), 0);
  const held = preview?.deposits_held ?? 0;
  const problem = (() => {
    for (const l of lines) {
      if (!l.reason) return "Say what each deduction is for.";
      if (!Number.isFinite(l.amount) || l.amount <= 0) return `Enter an amount in whole cedis for ${l.label}.`;
      if (l.amount > l.max) return `That's more than the ${formatCedis(l.max)} owed on ${l.label}.`;
    }
    if (total > held) return `The deductions come to more than the ${formatCedis(held)} held in deposits.`;
    if (!day) return "Choose the move-out day.";
    if (day > today()) return "The move-out day can't be in the future.";
    return "";
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = {
        moved_out_on: day,
        note: note.trim() || null,
        deductions: lines.map((l) => ({ reason: l.reason, amount: l.amount, bill_id: l.bill_id })),
      };
      setDone(await apiFetch<MoveOut>(`/api/admin/tenancies/${tenancyId}/move-out`, { method: "POST", body }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <Link to="/admin/tenants" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tenants
      </Link>
      {loadError && (
        <div className="mt-4">
          <FormError>{loadError}</FormError>
        </div>
      )}
      {!preview && !loadError && <p className="mt-4 text-muted-foreground">Loading…</p>}
      {preview && done && (
        <div className="mt-4 max-w-2xl" role="status">
          <h1 className="text-4xl font-bold tracking-tight">{preview.tenant_name} has moved out</h1>
          <p className="mt-3 text-muted-foreground">
            Room {preview.room_number} at {preview.building} is free again and back in the rooms available.{" "}
            {done.refund_due > 0 ? `Pay the ${formatCedis(done.refund_due)} refund back to them, then record it on the Tenants page.` : "There's nothing to refund."}
          </p>
          <Link to="/admin/tenants" className={`${buttonClass} mt-6`}>
            Back to tenants
          </Link>
        </div>
      )}
      {preview && !done && (
        <form onSubmit={submit} noValidate className="mt-4 flex max-w-2xl flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Move out {preview.tenant_name}</h1>
            <p className="mt-2 text-muted-foreground">
              Room {preview.room_number} · {preview.building} · since {formatDate(preview.start_date)}
            </p>
          </div>
          {preview.blocked_reason && <FormError>{preview.blocked_reason}</FormError>}

          <section aria-label="Deposits held" className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold tracking-tight">Deposits held</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {preview.deposits.map((d) => (
                <li key={d.number} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    {d.label} ({d.number}){d.paid < d.amount ? `, ${formatCedis(d.paid)} of ${formatCedis(d.amount)} paid` : ""}
                  </span>
                  <span className="font-semibold tabular-nums">{formatCedis(d.paid)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-4 border-t border-border pt-2 text-base">
                <span className="font-semibold">Held</span>
                <span className="font-bold tabular-nums">{formatCedis(held)}</span>
              </li>
            </ul>
          </section>

          <AuthField label="Move-out day" type="date" name="moved_out_on" value={day} max={today()} min={preview.start_date} onChange={(e) => setDay(e.target.value)} />

          <section aria-label="Unpaid bills" className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold tracking-tight">Unpaid bills</h2>
            {preview.arrears.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing unpaid. No arrears to take from the deposit.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">Ticked bills are paid from the deposit. Untick any you'd rather leave owed.</p>
                <ul className="mt-3 flex flex-col divide-y divide-border">
                  {preview.arrears.map((a) => {
                    const row = arrears[a.bill_id] ?? { take: false, amount: String(a.balance) };
                    const set = (patch: Partial<Arrears>) => setArrears((all) => ({ ...all, [a.bill_id]: { ...row, ...patch } }));
                    return (
                      <li key={a.bill_id} className="flex flex-wrap items-center gap-3 py-3">
                        <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <input type="checkbox" checked={row.take} onChange={(e) => set({ take: e.target.checked })} className="h-5 w-5 shrink-0 accent-[var(--primary)]" />
                          <span className="min-w-0">
                            <span className="block font-medium">{a.description}</span>
                            <span className="block text-sm text-muted-foreground">
                              {a.number}, due {formatDate(a.due_date)}, {formatCedis(a.balance)} owed
                            </span>
                          </span>
                        </label>
                        {row.take && (
                          <div className="w-32">
                            <InputWrapper>
                              <input aria-label={`Amount from the deposit for ${a.number}`} inputMode="numeric" value={row.amount} onChange={(e) => set({ amount: e.target.value })} className={smallInput} />
                            </InputWrapper>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section aria-label="Damage and other deductions" className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold tracking-tight">Damage and other deductions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Anything else kept back from the deposit, with the reason the tenant will see.</p>
            <ul className="mt-3 flex flex-col gap-3">
              {damage.map((d, i) => {
                const set = (patch: Partial<Damage>) => setDamage((all) => all.map((x) => (x.key === d.key ? { ...x, ...patch } : x)));
                return (
                  <li key={d.key} className="flex flex-wrap items-center gap-3">
                    <div className="min-w-48 flex-1">
                      <InputWrapper>
                        <input aria-label={`Reason ${i + 1}`} maxLength={200} placeholder="e.g. Broken window" value={d.reason} onChange={(e) => set({ reason: e.target.value })} className={smallInput} />
                      </InputWrapper>
                    </div>
                    <div className="w-32">
                      <InputWrapper>
                        <input aria-label={`Amount ${i + 1}`} inputMode="numeric" placeholder="GH₵" value={d.amount} onChange={(e) => set({ amount: e.target.value })} className={smallInput} />
                      </InputWrapper>
                    </div>
                    <button type="button" onClick={() => setDamage((all) => all.filter((x) => x.key !== d.key))} className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`Remove deduction ${i + 1}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setDamage((all) => [...all, { key: Date.now() + all.length, reason: "", amount: "" }])} className={`${outlineButtonClass} mt-3`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a deduction
            </button>
          </section>

          <div>
            <label htmlFor="move-out-note" className="text-sm font-medium text-muted-foreground">
              Note (optional, for admins)
            </label>
            <InputWrapper>
              <textarea id="move-out-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Keys returned, meter read" className="block w-full resize-y rounded-md bg-transparent p-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none" />
            </InputWrapper>
          </div>

          <section aria-label="Refund" className="rounded-xl border border-border bg-secondary p-5">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Deposits held</dt>
                <dd className="font-semibold tabular-nums">{formatCedis(held)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Deductions</dt>
                <dd className="font-semibold tabular-nums">−{formatCedis(total)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2 text-base">
                <dt className="font-semibold">Refund due</dt>
                <dd className="font-bold tabular-nums">{formatCedis(Math.max(held - total, 0))}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted-foreground">
              Confirming ends the tenancy, frees room {preview.room_number} and adds 1 back to the rooms available. Sanitation bills for months starting after the move-out day are cancelled. You pay the refund back yourself, then record it on the Tenants page.
            </p>
          </section>

          {error && <FormError>{error}</FormError>}
          <div>
            <button type="submit" disabled={busy || Boolean(preview.blocked_reason)} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-60`}>
              {busy ? "Moving out…" : "Confirm move-out"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
