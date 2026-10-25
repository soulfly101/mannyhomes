import "server-only";
import { randomBytes } from "node:crypto";
import type { Invoice, PaymentMethod, Prisma, RefundReason } from "@prisma/client";
import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { initializeTransaction, refundTransaction, simulatedPayments, toPesewas, verifyTransaction } from "./paystack";

type Tx = Prisma.TransactionClient;

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

/** The tenant an invoice belongs to, through its booking or its lease. */
export function invoiceTenantId(invoice: { application?: { tenantId: string } | null; lease?: { tenantId: string } | null }) {
  return invoice.application?.tenantId ?? invoice.lease?.tenantId ?? null;
}

export const isPayable = (invoice: Pick<Invoice, "status">) => invoice.status === "UNPAID" || invoice.status === "OVERDUE";

/**
 * Starts paying an invoice and returns the URL to send the tenant to:
 * Paystack's checkout, or the pretend checkout in development.
 */
export async function startPayment(invoiceId: string, tenantId: string): Promise<{ url?: string; error?: string }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { application: { include: { unit: true } }, lease: true },
  });
  if (!invoice || invoiceTenantId(invoice) !== tenantId) return { error: "We couldn't find that bill." };
  if (!isPayable(invoice)) return { error: "This bill is already paid." };
  if (invoice.type === "HOLD_FEE") {
    if (invoice.application?.status !== "AWAITING_PAYMENT") return { error: "This booking can no longer be paid." };
    const free = await prisma.unit.count({ where: { roomTypeId: invoice.application.roomTypeId, status: "VACANT" } });
    if (!free) return { error: "Sorry, the last apartment of this type has just been booked." };
  }

  const tenant = await prisma.user.findUniqueOrThrow({ where: { id: tenantId } });
  const reference = `ALT-${invoice.number}-${randomBytes(4).toString("hex")}`;
  await prisma.payment.create({
    data: { invoiceId, tenantId, amount: invoice.amount, method: "PAYSTACK_OTHER", paystackReference: reference },
  });

  if (simulatedPayments()) return { url: `/pay/simulate?reference=${reference}` };
  try {
    const url = await initializeTransaction({
      email: tenant.email,
      amount: toPesewas(invoice.amount),
      reference,
      callbackUrl: `${appUrl()}/pay/callback`,
      metadata: { invoice: invoice.number, phone: tenant.phone },
    });
    return { url };
  } catch (e) {
    console.error(e);
    await prisma.payment.update({ where: { paystackReference: reference }, data: { status: "FAILED" } });
    return { error: "We couldn't reach the payment service. Please try again in a minute." };
  }
}

const methodFromChannel = (channel: string): PaymentMethod =>
  channel === "mobile_money" ? "PAYSTACK_MOMO" : channel === "card" ? "PAYSTACK_CARD" : "PAYSTACK_OTHER";

/**
 * Checks a Paystack payment and, if it went through, marks the bill paid and moves
 * the booking or lease forward. Safe to call more than once for the same reference
 * (the callback page and the webhook both call it).
 */
export async function confirmPayment(reference: string, simulated?: { success: boolean }): Promise<"paid" | "failed" | "pending" | "unknown"> {
  const payment = await prisma.payment.findUnique({ where: { paystackReference: reference }, include: { invoice: true } });
  if (!payment) return "unknown";
  if (payment.status === "SUCCESS") return "paid";
  if (payment.status === "FAILED") return "failed";

  let outcome: { ok: boolean; method: PaymentMethod; paidAt: Date } | null;
  if (simulated) {
    outcome = { ok: simulated.success, method: "PAYSTACK_MOMO", paidAt: new Date() };
  } else {
    const t = await verifyTransaction(reference);
    if (t.status !== "success" && t.status !== "failed" && t.status !== "abandoned") return "pending";
    const ok = t.status === "success" && t.currency === "GHS" && t.amount === toPesewas(payment.amount);
    outcome = { ok, method: methodFromChannel(t.channel), paidAt: t.paid_at ? new Date(t.paid_at) : new Date() };
  }

  if (!outcome.ok) {
    await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED" } });
    return "failed";
  }

  const refundAfter = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "SUCCESS", method: outcome.method, paidAt: outcome.paidAt },
    });
    if (!claimed.count) return null; // another request confirmed it first
    return markInvoicePaid(tx, payment.invoiceId, payment.tenantId);
  });
  if (refundAfter) await refundPayment(payment.id, refundAfter);
  return "paid";
}

/** Records a cash or bank payment taken at the office. */
export async function recordOfflinePayment(invoiceId: string, method: "CASH" | "BANK", managerId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { application: true, lease: true } });
  const tenantId = invoice && invoiceTenantId(invoice);
  if (!invoice || !tenantId || !isPayable(invoice)) return { error: "This bill can't take a payment." };

  const refundAfter = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: { invoiceId, tenantId, amount: invoice.amount, method, status: "SUCCESS", paidAt: new Date(), recordedById: managerId },
    });
    await tx.activityLog.create({ data: { actorId: managerId, action: "RECORD_PAYMENT", entity: "Payment", entityId: payment.id, details: { method } } });
    const reason = await markInvoicePaid(tx, invoiceId, tenantId);
    return reason ? { paymentId: payment.id, reason } : null;
  });
  if (refundAfter) await refundPayment(refundAfter.paymentId, refundAfter.reason);
  return {};
}

/** Marks an invoice paid and applies what that payment unlocks. Returns a refund reason when the money must go back. */
async function markInvoicePaid(tx: Tx, invoiceId: string, tenantId: string): Promise<RefundReason | null> {
  const invoice = await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" }, include: { application: true } });

  if (invoice.type === "HOLD_FEE" && invoice.application) {
    const app = invoice.application;
    // Only one booking can hold a unit; the first payment to land wins. If the picked unit
    // was taken, hold any other free unit of the same room type.
    let unitId: string | null = app.unitId;
    for (let tries = 0; unitId && tries < 5; tries++) {
      const reserved = await tx.unit.updateMany({ where: { id: unitId, status: "VACANT" }, data: { status: "RESERVED" } });
      if (reserved.count) break;
      const other = await tx.unit.findFirst({ where: { roomTypeId: app.roomTypeId, status: "VACANT" }, orderBy: [{ floor: "asc" }, { unitNumber: "asc" }] });
      unitId = other?.id ?? null;
    }
    if (!unitId) {
      await tx.application.update({ where: { id: app.id }, data: { status: "REJECTED", decidedAt: new Date(), notes: "Apartment type was fully booked by others first." } });
      await notify(tx, tenantId, "Apartment no longer available", "Someone else booked the last apartment of this type just before you. Your booking deposit is being refunded.", "/tenant/bills");
      return "BOOKING_REJECTED";
    }
    const { holdHours } = await getSettings();
    await tx.application.update({
      where: { id: app.id },
      data: { status: "PENDING", unitId, holdExpiresAt: new Date(Date.now() + holdHours * 3600_000) },
    });
    await notifyManagers(tx, "New booking", "A booking deposit was paid. Review the booking.", "/manager/bookings");
    return null;
  }

  if (invoice.leaseId) {
    if (invoice.type === "DEPOSIT") await tx.lease.update({ where: { id: invoice.leaseId }, data: { depositStatus: "PAID" } });
    await activateLeaseIfSettled(tx, invoice.leaseId);
  }
  return null;
}

/** A new lease starts once every move-in bill is paid. */
async function activateLeaseIfSettled(tx: Tx, leaseId: string) {
  const lease = await tx.lease.findUniqueOrThrow({ where: { id: leaseId } });
  if (lease.status !== "PENDING_DEPOSIT") return;
  const unpaid = await tx.invoice.count({ where: { leaseId, status: { in: ["UNPAID", "OVERDUE"] } } });
  if (unpaid) return;
  await tx.lease.update({ where: { id: leaseId }, data: { status: "ACTIVE" } });
  await tx.unit.update({ where: { id: lease.unitId }, data: { status: "OCCUPIED" } });
  await notify(tx, lease.tenantId, "Welcome home", "Your move-in bills are paid and your lease is active.", "/tenant");
}

/**
 * Returns a payment's money. Paystack payments are refunded through Paystack;
 * cash and bank payments stay PENDING until the manager marks them handed back.
 */
export async function refundPayment(paymentId: string, reason: RefundReason) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { refunds: true } });
  const existing = payment.refunds.find((r) => r.status !== "FAILED");
  if (existing) return existing;
  const refund = await prisma.refund.create({ data: { paymentId, amount: payment.amount, reason } });
  return processRefund(refund.id);
}

/** Sends a refund to Paystack (or retries one that failed). */
export async function processRefund(refundId: string) {
  const refund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  const { payment } = refund;
  if (refund.status === "PROCESSED" || !payment.paystackReference) return refund;

  if (simulatedPayments()) {
    return prisma.refund.update({ where: { id: refundId }, data: { status: "PROCESSED" } });
  }
  try {
    // Paystack accepts the refund here and pays it out to the tenant's wallet or card over the next days.
    const r = await refundTransaction(payment.paystackReference, toPesewas(refund.amount));
    return prisma.refund.update({ where: { id: refundId }, data: { status: "PROCESSED", paystackRefundId: String(r.id) } });
  } catch (e) {
    console.error(e);
    return prisma.refund.update({ where: { id: refundId }, data: { status: "FAILED" } });
  }
}

export async function notify(tx: Tx, userId: string, title: string, body: string, link?: string) {
  await tx.notification.create({ data: { userId, title, body, link } });
}

async function notifyManagers(tx: Tx, title: string, body: string, link?: string) {
  const managers = await tx.user.findMany({ where: { role: "MANAGER" }, select: { id: true } });
  await tx.notification.createMany({ data: managers.map((m) => ({ userId: m.id, title, body, link })) });
}
