import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { cedis, invoiceLabel } from "@/lib/format";
import { simulatedPayments } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";
import { Ambient } from "@/components/Ambient";
import { Logo } from "@/components/Logo";
import { finishSimulatedPayment } from "./actions";

// Stand-in for Paystack checkout while no Paystack keys are set (development only).
export default async function SimulatedCheckout({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  if (!simulatedPayments()) notFound();
  const session = await requireUser("TENANT");
  const { reference } = await searchParams;
  const payment = reference
    ? await prisma.payment.findUnique({ where: { paystackReference: reference }, include: { invoice: true } })
    : null;
  if (!payment || payment.tenantId !== session.userId) notFound();

  return (
    <>
      <Ambient />
      <main className="wrap grid min-h-dvh place-items-center py-10">
        <div className="glass rise w-full max-w-[420px] rounded-[28px] p-7">
          <Logo />
          <p className="pill pill-warn mt-5 inline-block">Test checkout · no real money moves</p>
          <h1 className="mt-3 text-[1.6rem]">Pay {cedis(payment.amount)}</h1>
          <p className="mb-5 mt-1" style={{ color: "var(--muted)" }}>
            {payment.invoice.description} · {invoiceLabel(payment.invoice.number)}
          </p>
          {payment.status === "PENDING" ? (
            <form action={finishSimulatedPayment} className="flex flex-col gap-2.5">
              <input type="hidden" name="reference" value={payment.paystackReference!} />
              <button className="btn btn-primary" name="outcome" value="success">Pay with test Mobile Money</button>
              <button className="btn btn-soft" name="outcome" value="failed">Make the payment fail</button>
            </form>
          ) : (
            <p className="m-0">This payment is already {payment.status.toLowerCase()}.</p>
          )}
          <p className="mb-0 mt-5 text-[0.85rem]" style={{ color: "var(--muted)" }}>
            Add Paystack test keys to <code>.env</code> to use the real Paystack checkout instead.
          </p>
        </div>
      </main>
    </>
  );
}
