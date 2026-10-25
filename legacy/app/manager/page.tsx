import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MANAGER_TABS } from "@/lib/nav";
import { AppShell, StatTile } from "@/components/AppShell";

export default async function ManagerDashboard() {
  const session = await requireUser("MANAGER");
  const [byStatus, tenants, openTickets, complexes] = await Promise.all([
    prisma.unit.groupBy({ by: ["status"], _count: true }),
    prisma.user.count({ where: { role: "TENANT" } }),
    prisma.maintenanceRequest.count({ where: { status: { notIn: ["CLOSED"] } } }),
    prisma.property.count(),
  ]);
  const count = (s: string) => byStatus.find((r) => r.status === s)?._count ?? 0;
  const total = byStatus.reduce((n, r) => n + r._count, 0);
  const occupancy = total ? Math.round((count("OCCUPIED") / total) * 100) : 0;

  return (
    <AppShell name={session.name} subtitle="Manager" tabs={MANAGER_TABS} current="/manager">
      <h1 className="rise text-[clamp(1.9rem,4vw,2.8rem)]">Dashboard</h1>
      <p className="rise d1 mb-6 mt-1" style={{ color: "var(--muted)" }}>All {complexes} {complexes === 1 ? "complex" : "complexes"} at a glance.</p>
      <div className="rise d2 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <StatTile label="Occupancy" value={`${occupancy}%`} hint={`${count("OCCUPIED")} of ${total} apartments`} />
        <StatTile label="Free apartments" value={count("VACANT")} hint={`${count("RESERVED")} booked, waiting for you`} />
        <StatTile label="Registered tenants" value={tenants} />
        <StatTile label="Open problems" value={openTickets} />
      </div>
    </AppShell>
  );
}
