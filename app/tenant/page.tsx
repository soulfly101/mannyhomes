import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TENANT_TABS } from "@/lib/nav";
import { cedis, dateLabel, dateTimeLabel, floorLabel } from "@/lib/format";
import { expireHolds, openBooking } from "@/lib/bookings";
import { AppShell } from "@/components/AppShell";

export default async function TenantHome() {
  const session = await requireUser("TENANT");
  await expireHolds();
  const [lease, booking, notices] = await Promise.all([
    prisma.lease.findFirst({
      where: { tenantId: session.userId, status: { in: ["ACTIVE", "PENDING_DEPOSIT"] } },
      include: { unit: { include: { roomType: true, property: true } }, invoices: { where: { status: { in: ["UNPAID", "OVERDUE"] } } } },
    }),
    openBooking(session.userId),
    prisma.notification.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  return (
    <AppShell name={session.name} subtitle={lease ? `Unit ${lease.unit.unitNumber}` : undefined} tabs={TENANT_TABS} current="/tenant">
      <h1 className="rise text-[clamp(1.9rem,4vw,2.8rem)]">Hi, {session.name.split(" ")[0]}</h1>

      {lease ? (
        <div className="glass rise d1 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[26px] p-6">
          <div>
            <h2 className="text-[1.3rem]">Your apartment</h2>
            <p className="mb-0 mt-1" style={{ color: "var(--muted)" }}>
              {lease.unit.roomType.name} · {lease.unit.property.name} · Unit {lease.unit.unitNumber} · {floorLabel(lease.unit.floor)}
            </p>
            {lease.status === "PENDING_DEPOSIT" && (
              <p className="mb-0 mt-2">
                Approved! Pay your move-in bills ({cedis(lease.invoices.reduce((n, i) => n + i.amount, 0))}) to activate your lease from {dateLabel(lease.startDate)}.
              </p>
            )}
          </div>
          {lease.invoices.length > 0 && <Link href="/tenant/bills" className="btn btn-primary">Pay bills</Link>}
        </div>
      ) : booking ? (
        <div className="glass rise d1 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[26px] p-6">
          <div>
            <h2 className="text-[1.3rem]">Your booking: {booking.roomType.name} at {booking.roomType.property.name}</h2>
            <p className="mb-0 mt-1" style={{ color: "var(--muted)" }}>
              {booking.status === "AWAITING_PAYMENT" && "Pay the booking deposit to hold this apartment."}
              {booking.status === "PENDING" && booking.holdExpiresAt && `Unit ${booking.unit.unitNumber} is held for you until ${dateTimeLabel(booking.holdExpiresAt)} while the manager reviews your booking.`}
              {booking.status === "EXPIRED" && "The manager is still reviewing your booking. We'll let you know as soon as there is a decision."}
            </p>
          </div>
          {booking.status === "AWAITING_PAYMENT" ? (
            <Link href="/tenant/bills" className="btn btn-primary">Pay deposit</Link>
          ) : (
            <span className="pill pill-info">Waiting for approval</span>
          )}
        </div>
      ) : (
        <div className="glass rise d1 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[26px] p-6">
          <div>
            <h2 className="text-[1.3rem]">Find your apartment</h2>
            <p className="mb-0 mt-1" style={{ color: "var(--muted)" }}>You can now see prices. Choose a complex and an apartment type to book.</p>
          </div>
          <Link href="/#apartments" className="btn btn-primary">Browse apartments</Link>
        </div>
      )}

      {notices.length > 0 && (
        <section className="glass rise d2 mt-5 rounded-[26px] p-6">
          <h2 className="text-[1.3rem]">Updates</h2>
          <ul className="m-0 mt-3 list-none p-0">
            {notices.map((n) => (
              <li key={n.id} className="py-3" style={{ borderTop: "1px solid var(--glass-line)" }}>
                <b>{n.title}</b> <small style={{ color: "var(--muted)" }}>· {dateTimeLabel(n.createdAt)}</small>
                <span className="block text-[0.92rem]" style={{ color: "var(--muted)" }}>{n.body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
