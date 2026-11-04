import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowRight } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/sign-in";
import { formatCedis, formatDate } from "../format";
import { sectionClass } from "../landing/parts";
import type { PendingAllocation } from "./allocations";

/** Pending allocations (/admin/allocations): tenants who have paid their booking deposit, longest wait first. */
export function AllocationsPage() {
  const { state } = useLocation();
  const [queue, setQueue] = useState<PendingAllocation[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<PendingAllocation[]>("/api/admin/allocations")
      .then(setQueue)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the queue. Try again."));
  }, []);

  return (
    <main className={`${sectionClass} py-10 font-sans text-foreground`}>
      <h1 className="font-serif text-5xl font-medium leading-tight">Pending allocations</h1>
      <p className="mt-2 text-muted-foreground">Tenants who have paid their booking deposit and are waiting for a room.</p>
      {(state as { done?: string } | null)?.done && (
        <p role="status" className="mt-6 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {(state as { done: string }).done}
        </p>
      )}
      {error && (
        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>
      )}
      {!queue && !error && <p className="mt-6 text-muted-foreground">Loading the queue…</p>}
      {queue?.length === 0 && (
        <p className="mt-8 rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">
          No one is waiting. Tenants appear here once they've paid their booking deposit.
        </p>
      )}
      {queue && queue.length > 0 && (
        <ul className="mt-8 border-t border-border" aria-label="Pending allocations">
          {queue.map((q) => (
            <li key={q.booking_id} className="border-b border-border">
              <Link to={`/admin/allocations/${q.booking_id}`} className="group flex flex-wrap items-center justify-between gap-4 py-5">
                <span className="min-w-0">
                  <span className="block font-serif text-2xl font-medium">{q.tenant.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {q.room} · {q.building}, {q.location}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {formatCedis(q.booking_deposit)} paid{q.paid_at ? ` on ${formatDate(q.paid_at)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm font-medium text-muted-foreground group-hover:text-foreground">
                  {q.blocked_reason ? <Badge tone="warning">Needs attention</Badge> : "Allocate room"}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
