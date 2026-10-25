import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TENANT_TABS } from "@/lib/nav";
import { cedis, dateLabel, invoiceLabel, invoiceTypeLabel, paymentMethodLabel } from "@/lib/format";
import { isPayable } from "@/lib/billing";
import { AppShell } from "@/components/AppShell";
import { payInvoice } from "./actions";

const BANNERS: Record<string, [string, string]> = {
  paid: ["pill-ok", "Payment received. Thank you!"],
  failed: ["pill-danger", "The payment didn't go through. No money was taken; you can try again."],
  pending: ["pill-warn", "Your payment is still being confirmed. This page will update once it clears."],
  unknown: ["pill-warn", "We couldn't find that payment. If money left your account, contact the office."],
};

export default async function Bills({ searchParams }: { searchParams: Promise<{ payment?: string; error?: string }> }) {
  const session = await requireUser("TENANT");
  const { payment, error } = await searchParams;
  const mine = { OR: [{ application: { tenantId: session.userId } }, { lease: { tenantId: session.userId } }] };

  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { ...mine, status: { not: "VOID" } }, orderBy: [{ dueDate: "asc" }, { number: "asc" }] }),
    prisma.payment.findMany({
      where: { tenantId: session.userId, status: "SUCCESS" },
      include: { invoice: true, refunds: true },
      orderBy: { paidAt: "desc" },
    }),
  ]);
  const unpaid = invoices.filter(isPayable);
  const total = unpaid.reduce((n, i) => n + i.amount, 0);
  const now = new Date();
  const banner = error ? (["pill-danger", error] as const) : payment ? BANNERS[payment] : null;

  return (
    <AppShell name={session.name} tabs={TENANT_TABS} current="/tenant/bills">
      <h1 className="rise text-[clamp(1.9rem,4vw,2.8rem)]">Bills</h1>
      {banner && <p className={`pill ${banner[0]} rise mt-4 inline-block whitespace-normal !rounded-2xl !px-4 !py-2.5 text-[0.95rem]`} role="status">{banner[1]}</p>}

      <section className="glass rise d1 mt-6 rounded-[26px] p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[1.3rem]">To pay</h2>
          {total > 0 && <span style={{ color: "var(--muted)" }}>Total <b className="tabular-nums" style={{ color: "var(--fg)" }}>{cedis(total)}</b></span>}
        </div>
        {unpaid.length === 0 ? (
          <p className="mb-0 mt-2" style={{ color: "var(--muted)" }}>You&apos;re all paid up.</p>
        ) : (
          <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
            {unpaid.map((inv) => {
              const late = inv.dueDate < now;
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--glass-line)" }}>
                  <div className="mr-auto min-w-0">
                    <b className="block">{invoiceTypeLabel[inv.type]}</b>
                    <span className="text-[0.9rem]" style={{ color: "var(--muted)" }}>{inv.description} · {invoiceLabel(inv.number)}</span>
                    <span className={`pill ${late ? "pill-danger" : "pill-info"} mt-1.5 block w-fit`}>{late ? "Overdue since" : "Due"} {dateLabel(inv.dueDate)}</span>
                  </div>
                  <b className="text-[1.25rem] tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{cedis(inv.amount)}</b>
                  <form action={payInvoice}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <button className="btn btn-primary">Pay</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="glass rise d2 mt-5 rounded-[26px] p-6">
        <h2 className="text-[1.3rem]">Receipts</h2>
        {payments.length === 0 ? (
          <p className="mb-0 mt-2" style={{ color: "var(--muted)" }}>Payments you make will show here.</p>
        ) : (
          <ul className="m-0 mt-3 list-none p-0">
            {payments.map((p) => {
              const refund = p.refunds.find((r) => r.status !== "FAILED") ?? p.refunds[0];
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3" style={{ borderTop: "1px solid var(--glass-line)" }}>
                  <div className="mr-auto">
                    <b>{invoiceTypeLabel[p.invoice.type]}</b>
                    <span className="block text-[0.88rem]" style={{ color: "var(--muted)" }}>
                      {p.paidAt && dateLabel(p.paidAt)} · {paymentMethodLabel[p.method]} · {invoiceLabel(p.invoice.number)}
                    </span>
                  </div>
                  {refund && (
                    <span className={`pill ${refund.status === "PROCESSED" ? "pill-ok" : "pill-warn"}`}>
                      {refund.status === "PROCESSED" ? "Refunded" : "Refund in progress"}
                    </span>
                  )}
                  <span className="tabular-nums">{cedis(p.amount)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
