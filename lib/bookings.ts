import "server-only";
import type { RentCycle } from "@prisma/client";
import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { notify, refundPayment } from "./billing";
import { rentCycleMonths } from "./format";

const DAY = 86_400_000;

const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

/** Bookings the manager didn't decide on in time. Run before reading bookings. */
export async function expireHolds() {
  await prisma.application.updateMany({ where: { status: "PENDING", holdExpiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
}

/** A tenant's booking that is still in play, if any. */
export const openBooking = (tenantId: string) =>
  prisma.application.findFirst({
    where: { tenantId, OR: [{ status: { in: ["AWAITING_PAYMENT", "PENDING"] } }, { status: "EXPIRED", bookingDecision: null }] },
    include: { unit: true, roomType: { include: { property: true } }, invoices: true },
    orderBy: { createdAt: "desc" },
  });

/** First free unit of a room type, lowest floor first. */
export const freeUnitOf = (roomTypeId: string) =>
  prisma.unit.findFirst({ where: { roomTypeId, status: "VACANT" }, orderBy: [{ floor: "asc" }, { unitNumber: "asc" }] });

/**
 * Creates (or reuses) a booking for a room type and returns its booking-deposit invoice.
 * A free unit of that type is picked now; it is only held once the deposit is paid.
 */
export async function createBooking(tenantId: string, roomTypeId: string, moveInDate: Date, notes?: string) {
  const roomType = await prisma.roomType.findFirst({ where: { id: roomTypeId, listed: true, property: { listed: true } }, include: { property: true } });
  if (!roomType) return { error: "This apartment type is no longer offered." };
  const unit = await freeUnitOf(roomTypeId);
  if (!unit) return { error: `${roomType.name} at ${roomType.property.name} is fully booked right now.` };

  const lease = await prisma.lease.findFirst({ where: { tenantId, status: { in: ["ACTIVE", "PENDING_DEPOSIT"] } } });
  if (lease) return { error: "You already have an apartment with us." };

  const open = await openBooking(tenantId);
  if (open && (open.status !== "AWAITING_PAYMENT" || open.roomTypeId !== roomTypeId)) {
    if (open.status === "AWAITING_PAYMENT") {
      // Switching apartments before paying: drop the unpaid booking.
      await prisma.$transaction([
        prisma.invoice.updateMany({ where: { applicationId: open.id, status: "UNPAID" }, data: { status: "VOID" } }),
        prisma.application.update({ where: { id: open.id }, data: { status: "REJECTED", notes: "Replaced by another booking." } }),
      ]);
    } else {
      return { error: `You already have a booking for ${open.roomType.name} at ${open.roomType.property.name}.` };
    }
  }

  const { bookingDeposit } = await getSettings();
  if (open?.status === "AWAITING_PAYMENT" && open.roomTypeId === roomTypeId) {
    const invoice = open.invoices.find((i) => i.type === "HOLD_FEE" && i.status === "UNPAID");
    await prisma.application.update({ where: { id: open.id }, data: { moveInDate, notes, unitId: unit.id } });
    if (invoice) return { invoiceId: invoice.id };
  }

  const app = await prisma.application.create({
    data: {
      tenantId, roomTypeId, unitId: unit.id, moveInDate, notes,
      invoices: {
        create: {
          type: "HOLD_FEE", amount: bookingDeposit, dueDate: new Date(Date.now() + DAY),
          description: `Refundable booking deposit, ${roomType.name} at ${roomType.property.name}`,
        },
      },
    },
    include: { invoices: true },
  });
  await prisma.activityLog.create({ data: { actorId: tenantId, action: "BOOK", entity: "Application", entityId: app.id } });
  return { invoiceId: app.invoices[0].id };
}

const holdPayment = (applicationId: string) =>
  prisma.payment.findFirst({ where: { status: "SUCCESS", invoice: { applicationId, type: "HOLD_FEE" } } });

/**
 * Approves a booking: creates the lease with its move-in bills (security deposit,
 * first rent period and sanitation for the same period) and refunds the booking deposit.
 */
export async function approveBooking(applicationId: string, managerId: string, input: { startDate: Date; rentCycle: RentCycle; unitId?: string }) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { unit: true, roomType: true } });
  if (!app || (app.status !== "PENDING" && app.status !== "EXPIRED")) return { error: "This booking can't be approved." };

  // The manager may give the tenant a different free unit of the same room type.
  let unit = app.unit;
  if (input.unitId && input.unitId !== app.unitId) {
    const other = await prisma.unit.findUnique({ where: { id: input.unitId } });
    if (!other || other.roomTypeId !== app.roomTypeId || other.status !== "VACANT") return { error: "That unit isn't free any more. Choose another." };
    unit = other;
  }
  const { roomType } = app;

  const { sanitationFee } = await getSettings();
  const months = rentCycleMonths[input.rentCycle];
  const periodEnd = addMonths(input.startDate, months);
  const due = new Date(Math.max(Date.now() + 7 * DAY, input.startDate.getTime()));
  const period = months === 1 ? "1 month" : `${months} months`;

  const taken = await prisma.$transaction(async (tx) => {
    if (unit.id !== app.unitId) {
      const moved = await tx.unit.updateMany({ where: { id: unit.id, status: "VACANT" }, data: { status: "RESERVED" } });
      if (!moved.count) return true;
      await tx.unit.updateMany({ where: { id: app.unitId, status: "RESERVED" }, data: { status: "VACANT" } });
    } else {
      // An expired hold may have let the unit go; take it back.
      await tx.unit.updateMany({ where: { id: unit.id, status: "VACANT" }, data: { status: "RESERVED" } });
    }
    await tx.application.update({ where: { id: app.id }, data: { status: "APPROVED", decidedAt: new Date(), unitId: unit.id } });
    await tx.lease.create({
      data: {
        tenantId: app.tenantId, unitId: unit.id, startDate: input.startDate, rentAmount: roomType.rentAmount,
        rentCycle: input.rentCycle, depositAmount: roomType.depositAmount,
        invoices: {
          create: [
            { type: "DEPOSIT", amount: roomType.depositAmount, dueDate: due, description: `Security deposit, Unit ${unit.unitNumber}` },
            { type: "RENT", amount: roomType.rentAmount * months, dueDate: due, periodStart: input.startDate, periodEnd, description: `Rent, Unit ${unit.unitNumber}, ${period}` },
            ...(sanitationFee > 0
              ? [{ type: "SANITATION" as const, amount: sanitationFee * months, dueDate: due, periodStart: input.startDate, periodEnd, description: `Sanitation fee, ${period}` }]
              : []),
          ],
        },
      },
    });
    await tx.activityLog.create({ data: { actorId: managerId, action: "APPROVE_BOOKING", entity: "Application", entityId: app.id, details: { rentCycle: input.rentCycle, unit: unit.unitNumber } } });
    await notify(tx, app.tenantId, "Booking approved", `Your booking is approved: ${roomType.name}, Unit ${unit.unitNumber}. Pay your move-in bills to get your keys.`, "/tenant/bills");
    return false;
  });
  if (taken) return { error: "That unit isn't free any more. Choose another." };

  const paid = await holdPayment(app.id);
  if (paid) await refundPayment(paid.id, "BOOKING_APPROVED");
  return {};
}

/** Turns a booking down, frees the apartment and refunds the booking deposit. */
export async function rejectBooking(applicationId: string, managerId: string, reason: string) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { unit: true } });
  if (!app || (app.status !== "PENDING" && app.status !== "EXPIRED")) return { error: "This booking can't be turned down." };

  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: app.id }, data: { status: "REJECTED", decidedAt: new Date(), notes: reason || app.notes } });
    await tx.unit.updateMany({ where: { id: app.unitId, status: "RESERVED" }, data: { status: "VACANT" } });
    await tx.activityLog.create({ data: { actorId: managerId, action: "REJECT_BOOKING", entity: "Application", entityId: app.id, details: { reason } } });
    await notify(tx, app.tenantId, "Booking not approved", `Your booking for Unit ${app.unit.unitNumber} wasn't approved. Your booking deposit is being refunded.${reason ? ` Reason: ${reason}` : ""}`, "/tenant/bills");
  });

  const paid = await holdPayment(app.id);
  if (paid) await refundPayment(paid.id, "BOOKING_REJECTED");
  return {};
}

/** Lets go of an expired booking: frees the apartment and either refunds or keeps the deposit. */
export async function releaseExpiredBooking(applicationId: string, managerId: string, decision: "REFUND" | "KEEP", keepReason: string) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { unit: true } });
  if (!app || app.status !== "EXPIRED") return { error: "Only expired bookings can be released." };
  if (decision === "KEEP" && !keepReason) return { error: "Say why the booking deposit is kept." };

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: app.id },
      data: { decidedAt: new Date(), bookingDecision: decision, bookingKeepReason: decision === "KEEP" ? keepReason : null },
    });
    await tx.unit.updateMany({ where: { id: app.unitId, status: "RESERVED" }, data: { status: "VACANT" } });
    await tx.activityLog.create({ data: { actorId: managerId, action: "RELEASE_BOOKING", entity: "Application", entityId: app.id, details: { decision, keepReason } } });
    await notify(
      tx, app.tenantId, "Booking ended",
      decision === "REFUND"
        ? `Your hold on Unit ${app.unit.unitNumber} has ended. Your booking deposit is being refunded.`
        : `Your hold on Unit ${app.unit.unitNumber} has ended and the booking deposit is kept. Reason: ${keepReason}`,
      "/tenant/bills",
    );
  });

  if (decision === "REFUND") {
    const paid = await holdPayment(app.id);
    if (paid) await refundPayment(paid.id, "BOOKING_EXPIRED");
  }
  return {};
}
