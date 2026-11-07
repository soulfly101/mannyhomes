import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../api";
import { Reveal } from "../components/Reveal";
import { FormError } from "@/components/ui/sign-in";
import { cn } from "@/lib/utils";
import { formatDate } from "../format";
import { sectionClass } from "../landing/parts";
import { ADMIN_STATUS, CATEGORY_LABEL, STATUSES, type Ticket, type TicketStatus } from "../tickets/tickets";

type AdminTicket = Ticket & { tenant_name: string; tenant_phone: string | null };

const chipClass = "min-h-11 rounded-full border px-4 text-sm font-semibold transition duration-200 hover:shadow-sm motion-safe:hover:-translate-y-0.5";

function TicketCard({ ticket, onSaved }: { ticket: AdminTicket; onSaved: (t: AdminTicket) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = async (status: TicketStatus) => {
    setBusy(true);
    setError("");
    try {
      onSaved(await apiFetch<AdminTicket>(`/api/admin/tickets/${ticket.id}`, { method: "PATCH", body: { status } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const selectId = `status-${ticket.id}`;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{ticket.tenant_name}</h2>
          <p className="text-sm text-muted-foreground">
            {ticket.building}, room {ticket.room_number}
            {ticket.tenant_phone && ` · ${ticket.tenant_phone}`}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            id={selectId}
            value={ticket.status}
            disabled={busy}
            onChange={(e) => void change(e.target.value as TicketStatus)}
            className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ADMIN_STATUS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-3 text-sm">
        <span className="font-semibold">{CATEGORY_LABEL[ticket.category]}</span>
        <span className="text-muted-foreground"> · Reported {formatDate(ticket.created_at)}</span>
      </p>
      <p className="mt-2 whitespace-pre-line break-words text-sm">{ticket.description}</p>
      {error && (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      )}
    </div>
  );
}

/** Every report from every building (/admin/tickets), with its status, which the admin can change at any time. */
export function TicketsPage() {
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<AdminTicket[]>("/api/admin/tickets")
      .then(setTickets)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the reports. Try again."));
  }, []);

  const shown = tickets?.filter((t) => filter === "all" || t.status === filter) ?? [];
  const count = (s: TicketStatus) => tickets?.filter((t) => t.status === s).length ?? 0;

  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Tickets</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Repairs and other issues tenants have reported. A status change shows on the tenant's page within seconds.</p>
      {error && (
        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>
      )}
      {!tickets && !error && <p className="mt-6 text-muted-foreground">Loading reports…</p>}
      {tickets && (
        <>
          <div role="group" aria-label="Show reports" className="mt-6 flex flex-wrap gap-2">
            {(["all", ...STATUSES] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
                className={cn(chipClass, filter === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
              >
                {s === "all" ? `All (${tickets.length})` : `${ADMIN_STATUS[s]} (${count(s)})`}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
              {tickets.length === 0 ? "No reports yet. They appear here as soon as a tenant sends one." : "No reports with this status."}
            </p>
          ) : (
            <ul className="mt-6 grid gap-4" aria-label="Reports">
              {shown.map((t, i) => (
                <Reveal as="li" key={t.id} delay={Math.min(i, 5) * 60}>
                  <TicketCard ticket={t} onSaved={(saved) => setTickets((all) => all?.map((x) => (x.id === saved.id ? saved : x)) ?? all)} />
                </Reveal>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
