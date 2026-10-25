"use server";

import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { confirmPayment } from "@/lib/billing";
import { simulatedPayments } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";

export async function finishSimulatedPayment(form: FormData) {
  if (!simulatedPayments()) notFound();
  const session = await requireUser("TENANT");
  const reference = String(form.get("reference"));
  const payment = await prisma.payment.findUnique({ where: { paystackReference: reference } });
  if (!payment || payment.tenantId !== session.userId) notFound();

  const result = await confirmPayment(reference, { success: form.get("outcome") === "success" });
  redirect(`/tenant/bills?payment=${result}`);
}
