import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, apiFetch } from "../api";
import { Banner, Button, Card, Field } from "../components";
import type { Building, BuildingInput } from "./types";

const SUGGESTIONS = ["1 bedroom", "2 bedroom", "3 bedroom", "Single room", "Chamber and hall", "Self-contained"];

type Row = { key: number; id?: string; name: string; rent: string; quantity: string; fee: string };
type Form = { name: string; location: string; fee: string; description: string; listed: boolean; rows: Row[] };
type Errors = Record<string, string>;

const WHOLE = /^\d+$/;
const clean = (v: string) => v.trim().replace(/[\s,]/g, "");

let nextKey = 1;
const newRow = (r: Partial<Row> = {}): Row => ({ key: nextKey++, name: "", rent: "", quantity: "", fee: "", ...r });

const EMPTY: Form = { name: "", location: "", fee: "0", description: "", listed: true, rows: [newRow()] };

function fromBuilding(b: Building): Form {
  return {
    name: b.name,
    location: b.location,
    fee: String(b.sanitation_fee),
    description: b.description ?? "",
    listed: b.listed,
    rows: b.room_types.map((rt) =>
      newRow({
        id: rt.id,
        name: rt.name,
        rent: String(rt.rent),
        quantity: String(rt.quantity_available),
        fee: rt.sanitation_fee_override === null ? "" : String(rt.sanitation_fee_override),
      }),
    ),
  };
}

/** Same rules as the server, so most mistakes are caught before saving. Keys match the server's error keys. */
function validate(f: Form): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = "Enter the building name.";
  if (f.location.trim().length < 2) e.location = "Enter the location, like Oyarifa.";
  if (!WHOLE.test(clean(f.fee))) e.sanitation_fee = "Enter the fee in whole cedis, like 50. Use 0 for none.";
  if (f.rows.length === 0) e.room_types = "Add at least one room type.";
  const seen = new Set<string>();
  f.rows.forEach((r, i) => {
    const key = r.name.trim().toLowerCase();
    if (!key) e[`room_types.${i}.name`] = "Enter the room type, like 2 bedroom.";
    else if (seen.has(key)) e[`room_types.${i}.name`] = "Each room type in a building needs a different name.";
    seen.add(key);
    if (!WHOLE.test(clean(r.rent)) || Number(clean(r.rent)) <= 0) e[`room_types.${i}.rent`] = "Rent must be more than GH₵ 0.";
    if (!WHOLE.test(clean(r.quantity))) e[`room_types.${i}.quantity_available`] = "Enter how many are available, like 2.";
    if (r.fee.trim() && !WHOLE.test(clean(r.fee))) {
      e[`room_types.${i}.sanitation_fee_override`] = "Enter whole cedis, or leave empty to use the building's fee.";
    }
  });
  return e;
}

function toInput(f: Form): BuildingInput {
  return {
    name: f.name.trim(),
    location: f.location.trim(),
    sanitation_fee: Number(clean(f.fee)),
    description: f.description.trim() || null,
    listed: f.listed,
    room_types: f.rows.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      name: r.name.trim(),
      rent: Number(clean(r.rent)),
      quantity_available: Number(clean(r.quantity)),
      sanitation_fee_override: r.fee.trim() ? Number(clean(r.fee)) : null,
      description: null,
    })),
  };
}

/** Add or edit a building and its room types, prices and availability (#12, #23). */
export function BuildingFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(editing ? null : EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const lastRowName = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch<Building>(`/api/admin/buildings/${id}`)
      .then((b) => setForm(fromBuilding(b)))
      .catch((e) => setBanner(e instanceof ApiError ? e.message : "Couldn't load the building. Try again."));
  }, [id]);

  if (!form) {
    return (
      <main className="wrap admin-page">
        {banner ? <Banner>{banner}</Banner> : <p className="muted">Loading building…</p>}
        <Link to="/admin/buildings">Back to buildings</Link>
      </main>
    );
  }

  const set = (changes: Partial<Form>, ...clear: string[]) => {
    setForm({ ...form, ...changes });
    if (clear.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !clear.includes(k))));
  };
  const setRow = (i: number, changes: Partial<Row>, field: string) =>
    set({ rows: form.rows.map((r, j) => (j === i ? { ...r, ...changes } : r)) }, `room_types.${i}.${field}`, "room_types");
  const addRow = () => {
    set({ rows: [...form.rows, newRow()] }, "room_types");
    setTimeout(() => lastRowName.current?.focus());
  };
  const removeRow = (i: number) => {
    setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) });
    setErrors({});
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setBanner(Object.keys(found).length ? "Check the highlighted fields." : "");
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await apiFetch<Building>(editing ? `/api/admin/buildings/${id}` : "/api/admin/buildings", {
        method: editing ? "PUT" : "POST",
        body: toInput(form),
      });
      navigate("/admin/buildings");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setBanner(err.message);
      } else {
        setBanner("Couldn't save the building. Try again.");
      }
      setBusy(false);
    }
  };

  return (
    <main className="wrap admin-page">
      <Link to="/admin/buildings" className="back-link">
        ← Buildings
      </Link>
      <h1>{editing ? `Edit ${form.name || "building"}` : "Add a building"}</h1>
      {banner && <Banner>{banner}</Banner>}
      <form onSubmit={onSubmit} noValidate className="form-stack">
        <Card as="section" aria-labelledby="building-details">
          <h2 id="building-details">Building</h2>
          <div className="form-grid">
            <Field label="Building name" placeholder="Manny Building" value={form.name} error={errors.name} onChange={(e) => set({ name: e.target.value }, "name")} />
            <Field label="Location" placeholder="Oyarifa" value={form.location} error={errors.location} onChange={(e) => set({ location: e.target.value }, "location")} />
            <Field
              label="Monthly sanitation fee"
              prefix="GH₵"
              inputMode="numeric"
              hint="Rubbish pickup, charged to every tenant here. Room types can override it."
              value={form.fee}
              error={errors.sanitation_fee}
              onChange={(e) => set({ fee: e.target.value }, "sanitation_fee")}
            />
            <Field label="Description (optional)" placeholder="Quiet compound near the main road." value={form.description} error={errors.description} onChange={(e) => set({ description: e.target.value }, "description")} />
          </div>
          <label className="check">
            <input type="checkbox" checked={form.listed} onChange={(e) => set({ listed: e.target.checked })} />
            Show this building to tenants
          </label>
        </Card>

        <Card as="section" aria-labelledby="room-types">
          <h2 id="room-types">Room types</h2>
          <p className="muted">What this building rents out, the monthly rent and how many are available now.</p>
          {errors.room_types && <Banner>{errors.room_types}</Banner>}
          <datalist id="room-type-suggestions">
            {SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <ol className="room-editor" aria-label="Room types">
            {form.rows.map((r, i) => (
              <li key={r.key} className="room-edit-row">
                <Field
                  ref={i === form.rows.length - 1 ? lastRowName : undefined}
                  label="Room type"
                  list="room-type-suggestions"
                  placeholder="2 bedroom"
                  value={r.name}
                  error={errors[`room_types.${i}.name`]}
                  onChange={(e) => setRow(i, { name: e.target.value }, "name")}
                />
                <Field label="Rent per month" prefix="GH₵" inputMode="numeric" placeholder="2000" value={r.rent} error={errors[`room_types.${i}.rent`]} onChange={(e) => setRow(i, { rent: e.target.value }, "rent")} />
                <Field label="Available now" inputMode="numeric" placeholder="2" value={r.quantity} error={errors[`room_types.${i}.quantity_available`]} onChange={(e) => setRow(i, { quantity: e.target.value }, "quantity_available")} />
                <Field
                  label="Sanitation fee (optional)"
                  prefix="GH₵"
                  inputMode="numeric"
                  placeholder={`${clean(form.fee) || 0} (building's)`}
                  value={r.fee}
                  error={errors[`room_types.${i}.sanitation_fee_override`]}
                  onChange={(e) => setRow(i, { fee: e.target.value }, "sanitation_fee_override")}
                />
                <Button variant="ghost" className="room-remove" aria-label={`Remove room type ${r.name || i + 1}`} onClick={() => removeRow(i)}>
                  Remove
                </Button>
              </li>
            ))}
          </ol>
          <Button variant="secondary" onClick={addRow}>
            + Add room type
          </Button>
        </Card>

        <div className="actions">
          <Button type="submit" variant="primary" busy={busy}>
            {editing ? "Save changes" : "Save building"}
          </Button>
          <Link to="/admin/buildings" className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
