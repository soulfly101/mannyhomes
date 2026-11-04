import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowRight } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { Reveal } from "../components/Reveal";
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
    <main className={`${sectionClass} py-8 md:py-10`}>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">Pending allocations</h1>
      <p className="mt-2 text-muted-foreground">Tenants who have paid their booking deposit and are waiting for a room.</p>
      {(state as { done?: string } | null)?.done && (
        <p role="status" className="mt-6 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
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
        <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          No one is waiting. Tenants appear here once they've paid their booking deposit.
        </p>
      )}
      {queue && queue.length > 0 && (
        <ul className="mt-8 grid gap-4" aria-label="Pending allocations">
          {queue.map((q, i) => (
            <Reveal as="li" key={q.booking_id} delay={Math.min(i, 5) * 60}>
              <Link
                to={`/admin/allocations/${q.booking_id}`}
                className="group flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 text-foreground shadow-sm transition duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5"
              >
                <span className="min-w-0">
                  <span className="block text-xl font-bold tracking-tight">{q.tenant.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {q.room} · {q.building}, {q.location}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {formatCedis(q.booking_deposit)} paid{q.paid_at ? ` on ${formatDate(q.paid_at)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm font-semibold text-primary">
                  {q.blocked_reason ? <Badge tone="warning">Needs attention</Badge> : "Allocate room"}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            </Reveal>
          ))}
        </ul>
      )}
    </main>
  );
}
