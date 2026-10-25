"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { startPayment } from "@/lib/billing";

export async function payInvoice(form: FormData) {
  const session = await requireUser("TENANT");
  const pay = await startPayment(String(form.get("invoiceId")), session.userId);
  redirect(pay.url ?? `/tenant/bills?error=${encodeURIComponent(pay.error ?? "Payment could not start.")}`);
}
