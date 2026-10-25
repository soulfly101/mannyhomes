"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { processRefund, recordOfflinePayment } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

const back = (error?: string) => {
  revalidatePath("/manager/payments");
  redirect(error ? `/manager/payments?error=${encodeURIComponent(error)}` : "/manager/payments");
};

export async function recordPayment(form: FormData) {
  const session = await requireUser("MANAGER");
  const method = form.get("method") === "BANK" ? "BANK" : "CASH";
  const result = await recordOfflinePayment(String(form.get("invoiceId")), method, session.userId);
  back(result.error);
}

export async function retryRefund(form: FormData) {
  await requireUser("MANAGER");
  const refund = await processRefund(String(form.get("refundId")));
  back(refund.status === "FAILED" ? "Paystack didn't accept the refund. Check the Paystack dashboard." : undefined);
}

/** For cash and bank payments: the manager confirms the money was handed back. */
export async function markRefunded(form: FormData) {
  const session = await requireUser("MANAGER");
  const id = String(form.get("refundId"));
  await prisma.refund.update({ where: { id }, data: { status: "PROCESSED" } });
  await prisma.activityLog.create({ data: { actorId: session.userId, action: "MARK_REFUNDED", entity: "Refund", entityId: id } });
  back();
}
