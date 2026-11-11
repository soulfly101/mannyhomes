import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { formatCedis, formatDate } from "../format";
import { refundState, type MoveOut } from "./moveouts";

/** What a tenant sees after moving out: the deposits held, what was kept back and why, and the refund. */
export function MovedOutCard({ moveOut: m }: { moveOut: MoveOut }) {
  const state = refundState(m);
  return (
    <section aria-label="Your move-out" className="mt-8 max-w-2xl rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Your move-out</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You moved out of room {m.room_number} at {m.building} on {formatDate(m.moved_out_on)}.
          </p>
        </div>
        {state === "refunded" && <Badge tone="success">Refunded</Badge>}
        {state === "owed" && <Badge tone="warning">Being paid back</Badge>}
        {state === "none" && <Badge tone="neutral">Nothing to refund</Badge>}
      </div>
      <dl className="mt-5 grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Deposits held</dt>
          <dd className="font-semibold tabular-nums">{formatCedis(m.deposits_held)}</dd>
        </div>
        {m.deductions.map((d, i) => (
          <div key={i} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Kept back: {d.reason}</dt>
            <dd className="font-semibold tabular-nums">−{formatCedis(d.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-border pt-2 text-base">
          <dt className="font-semibold">Your refund</dt>
          <dd className="font-bold tabular-nums">{formatCedis(m.refund_due)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">
        {state === "refunded" && `Paid back on ${formatDate(m.refunded_at!.slice(0, 10))}${m.refund_method ? ` by ${m.refund_method}` : ""}${m.refund_reference ? ` (reference ${m.refund_reference})` : ""}.`}
        {state === "owed" && "We'll pay it back to you and it will show here once it's done."}
        {state === "none" && "The deductions took the whole deposit, so there's nothing to pay back."}{" "}
        Questions?{" "}
        <Link to="/messages" className="font-medium text-primary underline-offset-4 hover:underline">
          Message us
        </Link>
        .
      </p>
    </section>
  );
}
