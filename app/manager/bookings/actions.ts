"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { approveBooking, rejectBooking, releaseExpiredBooking } from "@/lib/bookings";

const done = (result: { error?: string }) => {
  revalidatePath("/manager/bookings");
  redirect(result.error ? `/manager/bookings?error=${encodeURIComponent(result.error)}` : "/manager/bookings");
};

export async function approve(form: FormData) {
  const session = await requireUser("MANAGER");
  const startDate = new Date(String(form.get("startDate")));
  const cycle = String(form.get("rentCycle"));
  if (isNaN(startDate.getTime())) return done({ error: "Choose the lease start date." });
  if (cycle !== "MONTHLY" && cycle !== "QUARTERLY" && cycle !== "YEARLY") return done({ error: "Choose how often rent is paid." });
  const unitId = form.get("unitId") ? String(form.get("unitId")) : undefined;
  done(await approveBooking(String(form.get("id")), session.userId, { startDate, rentCycle: cycle, unitId }));
}

export async function reject(form: FormData) {
  const session = await requireUser("MANAGER");
  done(await rejectBooking(String(form.get("id")), session.userId, String(form.get("reason") ?? "").trim()));
}

export async function release(form: FormData) {
  const session = await requireUser("MANAGER");
  const decision = form.get("decision") === "KEEP" ? "KEEP" : "REFUND";
  done(await releaseExpiredBooking(String(form.get("id")), session.userId, decision, String(form.get("keepReason") ?? "").trim()));
}
