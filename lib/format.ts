export const cedis = (amount: number) => `GH₵ ${amount.toLocaleString("en-GH")}`;

/** "1 unit", "3 units". */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export const freeLabel = (free: number) => (free ? `${free} free` : "Fully booked");

export const floorLabel = (floor: number) =>
  ["Ground floor", "First floor", "Second floor"][floor] ?? `Floor ${floor}`;

export const ticketLabel = (ticketNo: number) => `ALT-${ticketNo}`;

export const invoiceLabel = (number: number) => `INV-${String(number).padStart(6, "0")}`;

export const dateLabel = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });

export const dateTimeLabel = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/** "31 h left", "45 min left" or "time's up" for a booking hold. */
export function timeLeft(until: Date, now = new Date()) {
  const mins = Math.floor((until.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return "time's up";
  return mins >= 60 ? `${Math.floor(mins / 60)} h left` : `${mins} min left`;
}

export const invoiceTypeLabel = {
  HOLD_FEE: "Booking deposit",
  DEPOSIT: "Security deposit",
  RENT: "Rent",
  SANITATION: "Sanitation fee",
  CLEANING: "Cleaning",
  DAMAGE_CHARGE: "Repair charge",
} as const;

export const paymentMethodLabel = {
  PAYSTACK_MOMO: "Mobile Money",
  PAYSTACK_CARD: "Card",
  PAYSTACK_OTHER: "Online",
  CASH: "Cash",
  BANK: "Bank transfer",
} as const;

export const rentCycleMonths = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 } as const;
export const rentCycleLabel = { MONTHLY: "Monthly", QUARTERLY: "Every 3 months", YEARLY: "Yearly" } as const;
