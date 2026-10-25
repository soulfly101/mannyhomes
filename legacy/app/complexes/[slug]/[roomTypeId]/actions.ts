"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createBooking } from "@/lib/bookings";
import { startPayment } from "@/lib/billing";

export type BookState = { error?: string };

const schema = z.object({
  roomTypeId: z.string().min(1),
  moveInDate: z.coerce.date({ message: "Choose your move-in date." }),
  notes: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export async function bookRoomType(_: BookState, form: FormData): Promise<BookState> {
  const session = await requireUser("TENANT");
  const parsed = schema.safeParse({ roomTypeId: form.get("roomTypeId"), moveInDate: form.get("moveInDate"), notes: form.get("notes") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed.data.moveInDate < today) return { error: "Choose a move-in date from today onwards." };

  const booking = await createBooking(session.userId, parsed.data.roomTypeId, parsed.data.moveInDate, parsed.data.notes);
  if (booking.error || !booking.invoiceId) return { error: booking.error };

  const pay = await startPayment(booking.invoiceId, session.userId);
  if (pay.error || !pay.url) return { error: pay.error };
  redirect(pay.url);
}
