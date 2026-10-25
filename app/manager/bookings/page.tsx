import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MANAGER_TABS } from "@/lib/nav";
import { dateLabel, dateTimeLabel, floorLabel, rentCycleLabel, timeLeft } from "@/lib/format";
import { expireHolds } from "@/lib/bookings";
import { AppShell } from "@/components/AppShell";
import { approve, reject, release } from "./actions";

const STATUS_PILL = {
  AWAITING_PAYMENT: ["pill-info", "Not paid"],
  PENDING: ["pill-warn", "Waiting for you"],
  APPROVED: ["pill-ok", "Approved"],
  REJECTED: ["pill-danger", "Turned down"],
  EXPIRED: ["pill-danger", "Hold expired"],
} as const;

export default async function Bookings({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireUser("MANAGER");
  const { error } = await searchParams;
  await expireHolds();

  const include = { tenant: true, unit: true, roomType: { include: { property: true } } } as const;
  const [waiting, recent] = await Promise.all([
    prisma.application.findMany({
      where: { OR: [{ status: "PENDING" }, { status: "EXPIRED", bookingDecision: null }] },
      include,
      orderBy: { holdExpiresAt: "asc" },
    }),
    prisma.application.findMany({
      where: { OR: [{ status: { in: ["APPROVED", "REJECTED"] } }, { status: "EXPIRED", bookingDecision: { not: null } }] },
      include,
      orderBy: { decidedAt: "desc" },
      take: 20,
    }),
  ]);
  // Free units a waiting booking could be switched to, by room type.
  const freeUnits = await prisma.unit.findMany({
    where: { status: "VACANT", roomTypeId: { in: waiting.map((a) => a.roomTypeId) } },
    orderBy: [{ floor: "asc" }, { unitNumber: "asc" }],
  });

  return (
    <AppShell name={session.name} subtitle="Manager" tabs={MANAGER_TABS} current="/manager/bookings">
      <h1 className="rise text-[clamp(1.9rem,4vw,2.8rem)]">Bookings</h1>
      <p className="rise d1 mb-0 mt-1" style={{ color: "var(--muted)" }}>Tenants who paid the booking deposit. Each apartment is held for them until you decide.</p>
      {error && <p className="pill pill-danger mt-4 inline-block whitespace-normal !rounded-2xl !px-4 !py-2.5" role="alert">{error}</p>}

      <section className="rise d2 mt-6 flex flex-col gap-4">
        {waiting.length === 0 && <div className="glass rounded-[26px] p-6" style={{ color: "var(--muted)" }}>No bookings are waiting for you.</div>}
        {waiting.map((a) => {
          const expired = a.status === "EXPIRED";
          const start = (a.moveInDate ?? new Date()).toISOString().slice(0, 10);
          return (
            <article key={a.id} className="glass rounded-[26px] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[1.3rem]">{a.tenant.name}</h2>
                  <span style={{ color: "var(--muted)" }}>
                    {a.roomType.name} at {a.roomType.property.name} · Unit {a.unit.unitNumber} · Move in {a.moveInDate ? dateLabel(a.moveInDate) : "not given"}
                  </span>
                  <span className="block text-[0.92rem]" style={{ color: "var(--muted)" }}>
                    <a href={`tel:${a.tenant.phone}`}>{a.tenant.phone}</a> · <a href={`mailto:${a.tenant.email}`}>{a.tenant.email}</a>
                  </span>
                </div>
                <span className={`pill ${expired ? "pill-danger" : "pill-warn"}`}>
                  {expired ? "Hold expired" : a.holdExpiresAt ? `${timeLeft(a.holdExpiresAt)} · until ${dateTimeLabel(a.holdExpiresAt)}` : "Waiting"}
                </span>
              </div>
              {a.notes && <p className="mb-0 mt-3 rounded-2xl p-3 text-[0.95rem]" style={{ background: "var(--glass)", border: "1px solid var(--glass-line)" }}>&ldquo;{a.notes}&rdquo;</p>}

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <form action={approve} className="flex flex-col gap-2.5 rounded-2xl p-4" style={{ border: "1px solid var(--glass-line)" }}>
                  <input type="hidden" name="id" value={a.id} />
                  <b>Approve</b>
                  <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
                    <label className="field-label">Lease starts<input className="input" type="date" name="startDate" defaultValue={start} required /></label>
                    <label className="field-label">
                      Rent paid
                      <select className="input" name="rentCycle" defaultValue="MONTHLY">
                        {Object.entries(rentCycleLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="field-label">
                    Unit
                    <select className="input" name="unitId" defaultValue={a.unitId}>
                      <option value={a.unitId}>Unit {a.unit.unitNumber} · {floorLabel(a.unit.floor)} (held)</option>
                      {freeUnits.filter((u) => u.roomTypeId === a.roomTypeId).map((u) => (
                        <option key={u.id} value={u.id}>Unit {u.unitNumber} · {floorLabel(u.floor)}</option>
                      ))}
                    </select>
                  </label>
                  <small style={{ color: "var(--muted)" }}>The tenant gets the security deposit, first rent and sanitation bills, and the booking deposit is refunded.</small>
                  <button className="btn btn-primary self-start">Approve booking</button>
                </form>

                <div className="flex flex-col gap-3">
                  <form action={reject} className="flex flex-col gap-2.5 rounded-2xl p-4" style={{ border: "1px solid var(--glass-line)" }}>
                    <input type="hidden" name="id" value={a.id} />
                    <b>Turn down</b>
                    <input className="input" name="reason" placeholder="Reason the tenant will see (optional)" maxLength={300} />
                    <small style={{ color: "var(--muted)" }}>The apartment opens up again and the booking deposit is refunded.</small>
                    <button className="btn btn-soft self-start">Turn down</button>
                  </form>
                  {expired && (
                    <form action={release} className="flex flex-col gap-2.5 rounded-2xl p-4" style={{ border: "1px solid var(--danger)" }}>
                      <input type="hidden" name="id" value={a.id} />
                      <b>Release without deciding</b>
                      <label className="flex items-center gap-2"><input type="radio" name="decision" value="REFUND" defaultChecked /> Refund the booking deposit</label>
                      <label className="flex items-center gap-2"><input type="radio" name="decision" value="KEEP" /> Keep it</label>
                      <input className="input" name="keepReason" placeholder="Why it's kept (needed if kept)" maxLength={300} />
                      <button className="btn btn-soft self-start">Release apartment</button>
                    </form>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {recent.length > 0 && (
        <section className="glass rise d3 mt-6 rounded-[26px] p-6">
          <h2 className="text-[1.3rem]">Recent decisions</h2>
          <ul className="m-0 mt-3 list-none p-0">
            {recent.map((a) => {
              const [pill, label] = STATUS_PILL[a.status];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3" style={{ borderTop: "1px solid var(--glass-line)" }}>
                  <span className="mr-auto"><b>{a.tenant.name}</b> <span style={{ color: "var(--muted)" }}>· {a.roomType.property.name}, Unit {a.unit.unitNumber}{a.decidedAt ? ` · ${dateLabel(a.decidedAt)}` : ""}</span></span>
                  {a.bookingDecision && <small style={{ color: "var(--muted)" }}>{a.bookingDecision === "REFUND" ? "Deposit refunded" : `Deposit kept: ${a.bookingKeepReason}`}</small>}
                  <span className={`pill ${pill}`}>{label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
