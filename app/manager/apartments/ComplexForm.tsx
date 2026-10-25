import type { Property } from "@prisma/client";
import { createComplex, updateComplex } from "./actions";

/** Fields for adding or editing a complex. Lists are typed one per line or comma-separated. */
export function ComplexForm({ complex }: { complex?: Property }) {
  return (
    <form action={complex ? updateComplex : createComplex} className="grid gap-3 md:grid-cols-2">
      {complex && <input type="hidden" name="id" value={complex.id} />}
      <label className="field-label">Name<input className="input" name="name" defaultValue={complex?.name} required maxLength={80} placeholder="Altheo East Legon" /></label>
      <label className="field-label">Area<input className="input" name="area" defaultValue={complex?.area} required maxLength={60} placeholder="East Legon" /></label>
      <label className="field-label md:col-span-2">Address<input className="input" name="address" defaultValue={complex?.address} required maxLength={200} placeholder="12 Lagos Avenue, East Legon, Accra" /></label>
      <label className="field-label md:col-span-2">Description<textarea className="input" name="description" rows={3} defaultValue={complex?.description ?? ""} maxLength={1000} /></label>
      <label className="field-label">Amenities (comma or one per line)<textarea className="input" name="amenities" rows={2} defaultValue={complex?.amenities.join(", ")} placeholder="Borehole, 24h security, Parking" /></label>
      <label className="field-label">Photos (paths or links, first is the cover)<textarea className="input" name="photos" rows={2} defaultValue={complex?.photos.join("\n")} placeholder="/photos/hero.jpg" /></label>
      <label className="field-label">Floors<input className="input" type="number" name="floors" min={1} max={50} defaultValue={complex?.floors ?? 3} /></label>
      <label className="field-label">Web address<input className="input" name="slug" defaultValue={complex?.slug} maxLength={80} placeholder="Made from the name if left empty" /></label>
      <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" name="listed" defaultChecked={complex?.listed ?? true} /> Show on the website and open for booking</label>
      <button className="btn btn-primary self-start md:col-span-2 md:justify-self-start">{complex ? "Save complex" : "Add complex"}</button>
    </form>
  );
}
