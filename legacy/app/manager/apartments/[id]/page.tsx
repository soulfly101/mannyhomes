import Link from "next/link";
import { notFound } from "next/navigation";
import type { RoomType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MANAGER_TABS } from "@/lib/nav";
import { cedis, floorLabel, plural } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { ComplexForm } from "../ComplexForm";
import { addUnit, deleteRoomType, deleteUnit, saveRoomType, updateUnit } from "../actions";

const STATUS_PILL = {
  VACANT: ["pill-ok", "Free"],
  RESERVED: ["pill-info", "Booked"],
  OCCUPIED: ["pill-warn", "Lived in"],
  MAINTENANCE: ["pill-danger", "Maintenance"],
} as const;

function RoomTypeFields({ propertyId, room }: { propertyId: string; room?: RoomType }) {
  return (
    <form action={saveRoomType} className="grid gap-3 md:grid-cols-4">
      <input type="hidden" name="propertyId" value={propertyId} />
      {room && <input type="hidden" name="id" value={room.id} />}
      <label className="field-label md:col-span-2">Name<input className="input" name="name" defaultValue={room?.name} required maxLength={60} placeholder="Chamber & hall" /></label>
      <label className="field-label">Rent / month (GH₵)<input className="input" type="number" name="rentAmount" min={1} defaultValue={room?.rentAmount} required /></label>
      <label className="field-label">Security deposit (GH₵)<input className="input" type="number" name="depositAmount" min={1} defaultValue={room?.depositAmount} required /></label>
      <label className="field-label md:col-span-2">Rooms (comma or one per line)<textarea className="input" name="rooms" rows={2} defaultValue={room?.rooms.join(", ")} placeholder="1 bedroom, Hall, Bathroom, Toilet, Kitchenette" /></label>
      <label className="field-label md:col-span-2">Photos (paths or links, first is the cover)<textarea className="input" name="photos" rows={2} defaultValue={room?.photos.join("\n")} placeholder="/photos/one.jpg" /></label>
      <label className="field-label md:col-span-2">Description<textarea className="input" name="description" rows={2} defaultValue={room?.description ?? ""} maxLength={1000} /></label>
      <label className="field-label">Size (m², optional)<input className="input" type="number" name="sizeSqm" min={1} defaultValue={room?.sizeSqm ?? ""} /></label>
      <label className="field-label">Order on the page<input className="input" type="number" name="sortOrder" min={0} defaultValue={room?.sortOrder ?? 0} /></label>
      <label className="flex items-center gap-2 md:col-span-4"><input type="checkbox" name="listed" defaultChecked={room?.listed ?? true} /> Show on the website</label>
      <div className="flex gap-2 md:col-span-4">
        <button className="btn btn-primary">{room ? "Save type" : "Add type"}</button>
        {room && <button className="btn btn-soft" formAction={deleteRoomType} formNoValidate>Delete</button>}
      </div>
    </form>
  );
}

export default async function ManageComplex({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const session = await requireUser("MANAGER");
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const complex = await prisma.property.findUnique({
    where: { id },
    include: {
      roomTypes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { units: { select: { status: true } } } },
      units: { orderBy: [{ floor: "asc" }, { unitNumber: "asc" }] },
    },
  });
  if (!complex) notFound();
  const floors = Array.from({ length: complex.floors }, (_, i) => i);

  return (
    <AppShell name={session.name} subtitle="Manager" tabs={MANAGER_TABS} current="/manager/apartments">
      <Link href="/manager/apartments" className="text-[0.92rem] font-medium no-underline" style={{ color: "var(--accent)" }}>← Apartments</Link>
      <div className="rise mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.9rem,4vw,2.8rem)]">{complex.name}</h1>
          <p className="mb-0 mt-1" style={{ color: "var(--muted)" }}>{complex.area} · {plural(complex.units.length, "unit")}</p>
        </div>
        {complex.listed && <Link href={`/complexes/${complex.slug}`} className="btn btn-soft">View on site</Link>}
      </div>
      {error && <p className="pill pill-danger mt-4 inline-block whitespace-normal !rounded-2xl !px-4 !py-2.5" role="alert">{error}</p>}

      <section className="glass rise d1 mt-6 rounded-[26px] p-6">
        <h2 className="mb-4 text-[1.3rem]">Complex details</h2>
        <ComplexForm complex={complex} />
      </section>

      <section className="glass rise d2 mt-5 rounded-[26px] p-6">
        <h2 className="text-[1.3rem]">Apartment types</h2>
        <p className="mb-4 mt-1 text-[0.92rem]" style={{ color: "var(--muted)" }}>Each type has its own price. New leases copy the price at approval; existing leases keep theirs.</p>
        <div className="flex flex-col gap-3">
          {complex.roomTypes.map((r) => {
            const free = r.units.filter((u) => u.status === "VACANT").length;
            return (
              <details key={r.id} className="rounded-2xl p-4" style={{ border: "1px solid var(--glass-line)" }}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                  <b className="mr-auto">{r.name}</b>
                  <span className="tabular-nums">{cedis(r.rentAmount)} / month</span>
                  <small style={{ color: "var(--muted)" }}>{plural(r.units.length, "unit")} · {free} free</small>
                  {!r.listed && <span className="pill pill-warn">Hidden</span>}
                </summary>
                <div className="mt-4"><RoomTypeFields propertyId={complex.id} room={r} /></div>
              </details>
            );
          })}
          <details className="rounded-2xl p-4" style={{ border: "1px dashed var(--accent)" }} open={complex.roomTypes.length === 0}>
            <summary className="cursor-pointer font-semibold" style={{ color: "var(--accent)" }}>+ Add an apartment type</summary>
            <div className="mt-4"><RoomTypeFields propertyId={complex.id} /></div>
          </details>
        </div>
      </section>

      <section className="glass rise d3 mt-5 rounded-[26px] p-6">
        <h2 className="text-[1.3rem]">Units</h2>
        <p className="mb-4 mt-1 text-[0.92rem]" style={{ color: "var(--muted)" }}>Each unit belongs to one apartment type. Booked and lived-in units are set by bookings and leases.</p>
        {complex.roomTypes.length === 0 ? (
          <p className="m-0" style={{ color: "var(--muted)" }}>Add an apartment type first.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {complex.units.map((u) => {
              const [pill, label] = STATUS_PILL[u.status];
              const editable = u.status === "VACANT" || u.status === "MAINTENANCE";
              return (
                <form key={u.id} action={updateUnit} className="grid items-end gap-2 rounded-2xl p-3 md:grid-cols-[110px_150px_1fr_150px_auto]" style={{ border: "1px solid var(--glass-line)" }}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="propertyId" value={complex.id} />
                  <label className="field-label">Unit<input className="input" name="unitNumber" defaultValue={u.unitNumber} required maxLength={20} /></label>
                  <label className="field-label">Floor
                    <select className="input" name="floor" defaultValue={u.floor}>{floors.map((f) => <option key={f} value={f}>{floorLabel(f)}</option>)}</select>
                  </label>
                  <label className="field-label">Type
                    <select className="input" name="roomTypeId" defaultValue={u.roomTypeId} disabled={!editable}>{complex.roomTypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                    {!editable && <input type="hidden" name="roomTypeId" value={u.roomTypeId} />}
                  </label>
                  {editable ? (
                    <label className="field-label">Status
                      <select className="input" name="status" defaultValue={u.status}>
                        <option value="VACANT">Free</option>
                        <option value="MAINTENANCE">Maintenance</option>
                      </select>
                    </label>
                  ) : <span className={`pill ${pill} self-center justify-self-start`}>{label}</span>}
                  <div className="flex gap-2">
                    <button className="btn btn-soft">Save</button>
                    {editable && <button className="btn btn-soft" formAction={deleteUnit} formNoValidate aria-label={`Delete unit ${u.unitNumber}`}>Delete</button>}
                  </div>
                </form>
              );
            })}
            <form action={addUnit} className="grid items-end gap-2 rounded-2xl p-3 md:grid-cols-[110px_150px_1fr_auto]" style={{ border: "1px dashed var(--accent)" }}>
              <input type="hidden" name="propertyId" value={complex.id} />
              <label className="field-label">New unit<input className="input" name="unitNumber" required maxLength={20} placeholder="G-04" /></label>
              <label className="field-label">Floor
                <select className="input" name="floor" defaultValue={0}>{floors.map((f) => <option key={f} value={f}>{floorLabel(f)}</option>)}</select>
              </label>
              <label className="field-label">Type
                <select className="input" name="roomTypeId">{complex.roomTypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              </label>
              <button className="btn btn-primary">Add unit</button>
            </form>
          </div>
        )}
      </section>
    </AppShell>
  );
}
