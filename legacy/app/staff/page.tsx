import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STAFF_TABS } from "@/lib/nav";
import { AppShell } from "@/components/AppShell";

export default async function StaffJobs() {
  const session = await requireUser("STAFF");
  const jobs = await prisma.maintenanceRequest.count({ where: { assignedStaffId: session.userId, status: { notIn: ["CLOSED"] } } });

  return (
    <AppShell name={session.name} subtitle="Technician" tabs={STAFF_TABS} current="/staff">
      <h1 className="rise text-[clamp(1.9rem,4vw,2.8rem)]">My jobs</h1>
      <div className="glass rise d1 mt-6 rounded-[26px] p-6" style={{ color: "var(--muted)" }}>
        {jobs ? `You have ${jobs} open jobs.` : "No jobs are assigned to you right now. New jobs from the manager will show up here."}
      </div>
    </AppShell>
  );
}
