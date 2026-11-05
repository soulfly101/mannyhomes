import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../api";
import { Reveal } from "../components/Reveal";
import { Badge } from "@/components/ui/badge";
import { AuthField, FormError } from "@/components/ui/sign-in";
import { formatCedis, formatDate } from "../format";
import { buttonClass, sectionClass } from "../landing/parts";

type Tenancy = {
  id: string;
  tenant_name: string;
  room_number: string;
  building: string;
  sanitation_fee: number;
  move_in_date: string | null;
  set_by_admin: boolean;
  this_month: { number: string; status: "paid" | "partial" | "unpaid"; balance: number; due_date: string } | null;
};

const STATUS = {
  paid: { tone: "success", text: "Paid" },
  partial: { tone: "warning", text: "Partial" },
  unpaid: { tone: "danger", text: "Unpaid" },
} as const;

/** "15th", from a move-in date. */
export function dayOfMonth(iso: string): string {
  const day = Number(iso.slice(8, 10));
  const teens = day >= 11 && day <= 13;
  const suffix = teens ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `${day}${suffix}`;
}

function billingNote(t: Tenancy): string {
  if (t.sanitation_fee <= 0) return "No sanitation fee for this room.";
  if (!t.move_in_date) return "No bills yet. They start when the tenant signs, or when you set a move-in date.";
  const source = t.set_by_admin ? "" : " Worked out from the day they signed.";
  return `${formatCedis(t.sanitation_fee)} sanitation fee, due on the ${dayOfMonth(t.move_in_date)} of each month.${source}`;
}

function TenancyCard({ tenancy, onSaved }: { tenancy: Tenancy; onSaved: (t: Tenancy) => void }) {
  const [date, setDate] = useState(tenancy.move_in_date ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bill = tenancy.this_month;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!date) {
      setError("Choose the move-in date.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onSaved(await apiFetch<Tenancy>(`/api/admin/tenancies/${tenancy.id}`, { method: "PATCH", body: { move_in_date: date } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{tenancy.tenant_name}</h2>
          <p className="text-sm text-muted-foreground">
            Room {tenancy.room_number} · {tenancy.building}
          </p>
        </div>
        {bill && <Badge tone={STATUS[bill.status].tone}>This month: {STATUS[bill.status].text}</Badge>}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{billingNote(tenancy)}</p>
      {bill && bill.status !== "paid" && (
        <p className="mt-1 text-sm text-muted-foreground">
          {formatCedis(bill.balance)} still to pay on {bill.number}, due {formatDate(bill.due_date)}.
        </p>
      )}
      <form onSubmit={save} noValidate className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-60">
          <AuthField label="Move-in date" type="date" name={`move-in-${tenancy.id}`} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-progress disabled:opacity-80`}>
          {busy ? "Saving…" : "Save date"}
        </button>
      </form>
      {error && (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      )}
    </div>
  );
}

/** Everyone living in a room now (/admin/tenants), and the move-in date that sets their sanitation bills. */
export function TenantsPage() {
  const [tenancies, setTenancies] = useState<Tenancy[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<Tenancy[]>("/api/admin/tenancies")
      .then(setTenancies)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the tenants. Try again."));
  }, []);

  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Tenants</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Each sanitation bill is due on the day of the month the tenant moved in. Change the date if they moved in on a different day from when they signed.</p>
      {error && (
        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>
      )}
      {!tenancies && !error && <p className="mt-6 text-muted-foreground">Loading tenants…</p>}
      {tenancies?.length === 0 && <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No tenants yet. They appear here once you allocate a room.</p>}
      {tenancies && tenancies.length > 0 && (
        <ul className="mt-8 grid gap-4" aria-label="Tenants">
          {tenancies.map((t, i) => (
            <Reveal as="li" key={t.id} delay={Math.min(i, 5) * 60}>
              <TenancyCard tenancy={t} onSaved={(saved) => setTenancies((all) => all?.map((x) => (x.id === saved.id ? saved : x)) ?? all)} />
            </Reveal>
          ))}
        </ul>
      )}
    </main>
  );
}
