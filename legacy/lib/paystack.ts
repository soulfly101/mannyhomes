import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Thin client for the Paystack API. Amounts here are in pesewas (GH₵ 1 = 100 pesewas).
const API = "https://api.paystack.co";

export const paystackEnabled = () => !!process.env.PAYSTACK_SECRET_KEY;

/** Without Paystack keys, development uses a pretend checkout so the flow can be tried end to end. */
export const simulatedPayments = () => !paystackEnabled() && process.env.NODE_ENV !== "production";

export const toPesewas = (cedis: number) => cedis * 100;

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(API + path, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !json?.status) throw new Error(`Paystack ${path}: ${json?.message ?? res.statusText}`);
  return json.data as T;
}

export async function initializeTransaction(input: { email: string; amount: number; reference: string; callbackUrl: string; metadata?: Record<string, unknown> }) {
  const data = await call<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amount,
      currency: "GHS",
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: ["mobile_money", "card"],
      metadata: input.metadata,
    },
  });
  return data.authorization_url;
}

export type VerifiedTransaction = { status: string; amount: number; currency: string; channel: string; paid_at: string | null };

export const verifyTransaction = (reference: string) =>
  call<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);

export const refundTransaction = (reference: string, amount: number) =>
  call<{ id: number; status: string }>("/refund", { method: "POST", body: { transaction: reference, amount } });

export function validWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
