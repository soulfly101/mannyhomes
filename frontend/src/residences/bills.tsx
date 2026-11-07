import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { formatCedis, formatDate } from "../format";
import { buttonClass } from "../landing/parts";

export type TenantBill = {
  id: number;
  number: string;
  kind: "booking_deposit" | "renting_deposit" | "sanitation" | "late_fee";
  description: string;
  amount: number;
  paid: number;
  balance: number;
  status: "paid" | "partial" | "unpaid";
  period: string | null;
  due_date: string;
};

const STATUS = {
  paid: { tone: "success", text: "Paid" },
  partial: { tone: "warning", text: "Partial" },
  unpaid: { tone: "danger", text: "Unpaid" },
} as const;

/** One bill: what it's for, when it's due, its status, and the way to pay what's left. */
export function BillRow({ bill }: { bill: TenantBill }) {
  const status = STATUS[bill.status];
  // The booking deposit is paid from the booking itself.
  const payable = bill.status !== "paid" && bill.kind !== "booking_deposit";
  const payLabel = bill.kind === "renting_deposit" ? "Pay" : "Pay Fee";
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-semibold">{bill.description}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {bill.number} · {bill.status === "paid" ? `${formatCedis(bill.amount)} paid` : `${formatCedis(bill.balance)} to pay, due ${formatDate(bill.due_date)}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={status.tone}>{status.text}</Badge>
        {payable && (
          <Link to={`/bills/${bill.id}/pay`} aria-label={`${payLabel}: ${bill.description}`} className={buttonClass}>
            {payLabel}
          </Link>
        )}
      </div>
    </li>
  );
}

/** What the dashboard shows: everything still owed on sanitation and late fees, otherwise the latest bill. Bills arrive newest first. */
export function currentSanitationBills(bills: TenantBill[]): TenantBill[] {
  const owed = bills.filter((b) => (b.kind === "sanitation" || b.kind === "late_fee") && b.status !== "paid");
  return owed.length > 0 ? owed : bills.filter((b) => b.kind === "sanitation").slice(0, 1);
}
