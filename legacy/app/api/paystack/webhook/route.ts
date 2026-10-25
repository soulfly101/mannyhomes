import { NextResponse, type NextRequest } from "next/server";
import { confirmPayment } from "@/lib/billing";
import { validWebhookSignature } from "@/lib/paystack";

// Paystack calls this when a payment completes, even if the tenant closed the page.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validWebhookSignature(raw, req.headers.get("x-paystack-signature"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const event = JSON.parse(raw) as { event: string; data?: { reference?: string } };
  if (event.event === "charge.success" && event.data?.reference) {
    try {
      await confirmPayment(event.data.reference);
    } catch (e) {
      console.error(e);
      return new NextResponse("Retry later", { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
