import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MANAGER_TABS } from "@/lib/nav";
import { cedis, dateLabel, invoiceLabel, invoiceTypeLabel, paymentMethodLabel } from "@/lib/format";
import { AppShell, StatTile } from "@/components/AppShell";
import { markRefunded, recordPayment, retryRefund } from "./actions";

const REFUND_REASON = {
  BOOKING_APPROVED: "Booking approved",
  BOOKING_REJECTED: "Booking turned down",
  BOOKING_EXPIRED: "Booking released",
  DEPOSIT_RETURN: "Deposit returned",
} as const;

const row = { borderTop: "1px solid var(--glass-line)" };

export default async function Payments({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireUser("MANAGER");
  const { error } = await searchParams;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [refunds, unpaid, payments, month] = await Promise.all([
    prisma.refund.findMany({ where: { status: { in: ["PENDING", "FAILED"] } }, include: { payment: { include: { tenant: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.invoice.findMany({
      where: { status: { in: ["UNPAID", "OVERDUE"] }, OR: [{ lease: { isNot: null } }, { application: { status: "AWAITING_PAYMENT" } }] },
      include: { lease: { include: { tenant: true, unit: true } }, application: { include: { tenant: true, unit: true } } },
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    }),
    prisma.payment.findMany({ where: { status: "SUCCESS" }, include: { tenant: true, invoice: true }, orderBy: { paidAt: "desc" }, take: 30 }),
    prisma.payment.aggregate({ where: { status: "SUCCESS", paidAt: { gte: monthStart }, invoice: { type: { not: "HOLD_FEE" } } }, _sum: { amount: true } }),
  ]);
  const now = new Date();
  const overdue = unpaid.filter((i) => i.dueDate < now);

  return (
    <AppShell name={session.name} subtitle="Manager" tabs={MANAGER_TABS} current="/manager/payments">
      <h1 className="rise text-[clamp(1.9rem,4vw,2.8rem)]">Payments</h1>
      {error && <p className="pill pill-danger mt-4 inline-block whitespace-normal !rounded-2xl !px-4 !py-2.5" role="alert">{error}</p>}

      <div className="rise d1 mt-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <StatTile label="Collected this month" value={cedis(month._sum.amount ?? 0)} hint="Not counting booking deposits" />
        <StatTile label="Waiting to be paid" value={cedis(unpaid.reduce((n, i) => n + i.amount, 0))} hint={`${unpaid.length} bills`} />
        <StatTile label="Overdue" value={cedis(overdue.reduce((n, i) => n + i.amount, 0))} hint={`${overdue.length} bills`} />
      </div>

      {refunds.length > 0 && (
        <section className="glass rise d2 mt-5 rounded-[26px] p-6" style={{ borderColor: "var(--warn)" }}>
          <h2 className="text-[1.3rem]">Refunds to finish</h2>
          <ul className="m-0 mt-3 list-none p-0">
            {refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3" style={row}>
                <span className="mr-auto">
                  <b>{r.payment.tenant.name}</b> · {cedis(r.amount)}
                  <span className="block text-[0.88rem]" style={{ color: "var(--muted)" }}>{REFUND_REASON[r.reason]} · paid by {paymentMethodLabel[r.payment.method]}</span>
                </span>
                {r.status === "FAILED" && <span className="pill pill-danger">Paystack refused</span>}
                <form action={r.payment.paystackReference ? retryRefund : markRefunded}>
                  <input type="hidden" name="refundId" value={r.id} />
                  <button className="btn btn-soft">{r.payment.paystackReference ? "Try refund again" : "Mark as handed back"}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass rise d2 mt-5 rounded-[26px] p-6">
        <h2 className="text-[1.3rem]">Unpaid bills</h2>
        {unpaid.length === 0 ? (
          <p className="mb-0 mt-2" style={{ color: "var(--muted)" }}>Nothing is waiting to be paid.</p>
        ) : (
          <ul className="m-0 mt-3 list-none p-0">
            {unpaid.map((inv) => {
              const owner = inv.lease ?? inv.application!;
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3" style={row}>
                  <span className="mr-auto min-w-0">
                    <b>{owner.tenant.name}</b> · Unit {owner.unit.unitNumber}
                    <span className="block text-[0.88rem]" style={{ color: "var(--muted)" }}>
                      {invoiceTypeLabel[inv.type]} · {invoiceLabel(inv.number)} · due {dateLabel(inv.dueDate)}
                    </span>
                  </span>
                  {inv.dueDate < now && <span className="pill pill-danger">Overdue</span>}
                  <b className="tabular-nums">{cedis(inv.amount)}</b>
                  {inv.type !== "HOLD_FEE" && (
                    <form action={recordPayment} className="flex gap-1.5">
                      <input type="hidden" name="invoiceId" value={inv.id} />
                      <select name="method" className="input !w-auto !py-2" aria-label="Paid by">
                        <option value="CASH">Cash</option>
                        <option value="BANK">Bank</option>
                      </select>
                      <button className="btn btn-soft">Record payment</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="glass rise d3 mt-5 rounded-[26px] p-6">
        <h2 className="text-[1.3rem]">Recent payments</h2>
        {payments.length === 0 ? (
          <p className="mb-0 mt-2" style={{ color: "var(--muted)" }}>No payments yet.</p>
        ) : (
          <ul className="m-0 mt-3 list-none p-0">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3" style={row}>
                <span className="mr-auto">
                  <b>{p.tenant.name}</b> · {invoiceTypeLabel[p.invoice.type]}
                  <span className="block text-[0.88rem]" style={{ color: "var(--muted)" }}>
                    {p.paidAt && dateLabel(p.paidAt)} · {paymentMethodLabel[p.method]} · {invoiceLabel(p.invoice.number)}
                  </span>
                </span>
                <span className="tabular-nums">{cedis(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
