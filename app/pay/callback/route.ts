import { NextResponse, type NextRequest } from "next/server";
import { confirmPayment } from "@/lib/billing";

// Paystack sends the tenant back here after checkout.
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref");
  let result = "unknown";
  if (reference) {
    try {
      result = await confirmPayment(reference);
    } catch (e) {
      console.error(e);
      result = "pending";
    }
  }
  return NextResponse.redirect(new URL(`/tenant/bills?payment=${result}`, req.url));
}
