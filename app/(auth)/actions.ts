"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { endSession, startSession } from "@/lib/auth";
import { homeFor } from "@/lib/session";

export type AuthState = { error?: string; values?: Record<string, string> };

// Only allow redirects back into this site.
const safeNext = (next: FormDataEntryValue | null) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => /^(0\d{9}|\+233\d{9})$/.test(v), "Enter a Ghana phone number, like 024 123 4567."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for your password."),
});

export async function register(_: AuthState, form: FormData): Promise<AuthState> {
  const values = { name: String(form.get("name") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? "") };
  const parsed = registerSchema.safeParse({ ...values, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const { name, phone, email, password } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: "An account with that email already exists. Log in instead.", values };
  }
  const user = await prisma.user.create({
    data: { name, phone, email, passwordHash: await bcrypt.hash(password, 10), role: "TENANT" },
  });
  await prisma.activityLog.create({ data: { actorId: user.id, action: "REGISTER", entity: "User", entityId: user.id } });
  await startSession({ userId: user.id, role: user.role, name: user.name });
  redirect(safeNext(form.get("next")) ?? homeFor(user.role));
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", values: { email } };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "That email and password don't match. Try again.", values: { email } };
  }
  await startSession({ userId: user.id, role: user.role, name: user.name });
  redirect(safeNext(form.get("next")) ?? homeFor(user.role));
}

export async function logout() {
  await endSession();
  redirect("/");
}
