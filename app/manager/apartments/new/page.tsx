import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { MANAGER_TABS } from "@/lib/nav";
import { AppShell } from "@/components/AppShell";
import { ComplexForm } from "../ComplexForm";

export default async function NewComplex({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireUser("MANAGER");
  const { error } = await searchParams;
  return (
    <AppShell name={session.name} subtitle="Manager" tabs={MANAGER_TABS} current="/manager/apartments">
      <Link href="/manager/apartments" className="text-[0.92rem] font-medium no-underline" style={{ color: "var(--accent)" }}>← Apartments</Link>
      <h1 className="rise mt-2 text-[clamp(1.9rem,4vw,2.8rem)]">Add a complex</h1>
      <p className="rise d1 mb-0 mt-1" style={{ color: "var(--muted)" }}>After saving you can add its apartment types and units.</p>
      {error && <p className="pill pill-danger mt-4 inline-block whitespace-normal !rounded-2xl !px-4 !py-2.5" role="alert">{error}</p>}
      <section className="glass rise d2 mt-6 rounded-[26px] p-6"><ComplexForm /></section>
    </AppShell>
  );
}
