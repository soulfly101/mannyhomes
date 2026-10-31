import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError, apiFetch } from "../api";
import { Banner, Button, Card, StatusPill } from "../components";
import { formatCedis } from "../format";
import { availabilityLabel, type Building } from "./types";

function BuildingCard({ building, onDeleted }: { building: Building; onDeleted: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await apiFetch<void>(`/api/admin/buildings/${building.id}`, { method: "DELETE" });
      onDeleted(building.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete the building. Try again.");
      setBusy(false);
    }
  };

  return (
    <Card as="article" className="rise building-card" aria-labelledby={`b-${building.id}`}>
      <div className="building-head">
        <div>
          <h2 id={`b-${building.id}`}>{building.name}</h2>
          <p className="muted building-meta">
            {building.location} · Sanitation {formatCedis(building.sanitation_fee)}/mo
          </p>
        </div>
        {!building.listed && <StatusPill status="inactive" label="Hidden from tenants" />}
      </div>
      <ul className="room-list" aria-label={`Room types in ${building.name}`}>
        {building.room_types.map((rt) => (
          <li key={rt.id} className="room-row">
            <span className="room-name">{rt.name}</span>
            <span className="room-rent">{formatCedis(rt.rent)}/mo</span>
            <StatusPill
              status={rt.quantity_available ? "available" : "fully booked"}
              label={availabilityLabel(rt.quantity_available)}
            />
          </li>
        ))}
      </ul>
      {error && <Banner>{error}</Banner>}
      {confirming ? (
        <div className="confirm-row" role="group" aria-label="Confirm delete">
          <span>Delete {building.name} and all its room types? This can't be undone.</span>
          <div className="actions">
            <Button variant="danger" busy={busy} onClick={remove}>
              Delete building
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <Link className="btn btn-secondary" to={`/admin/buildings/${building.id}`}>
            Edit
          </Link>
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Admin list of buildings and what each one has available (#12). */
export function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Building[]>("/api/admin/buildings")
      .then(setBuildings)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load buildings. Try again."));
  }, []);

  const totalAvailable = buildings?.reduce((n, b) => n + b.total_available, 0) ?? 0;

  return (
    <main className="wrap admin-page">
      <div className="page-head">
        <div>
          <h1>Buildings</h1>
          {buildings && buildings.length > 0 && (
            <p className="muted">
              {buildings.length} {buildings.length === 1 ? "building" : "buildings"} · {totalAvailable} rooms available
            </p>
          )}
        </div>
        <Link className="btn btn-primary" to="/admin/buildings/new">
          Add building
        </Link>
      </div>
      {error && <Banner>{error}</Banner>}
      {buildings === null && !error && <p className="muted">Loading buildings…</p>}
      {buildings?.length === 0 && (
        <Card as="section" className="empty-state">
          <h2>No buildings yet</h2>
          <p className="muted">Add your first building and the room types it offers. Tenants will see them once listings go live.</p>
        </Card>
      )}
      <div className="building-grid">
        {buildings?.map((b) => (
          <BuildingCard key={b.id} building={b} onDeleted={(id) => setBuildings((all) => all!.filter((x) => x.id !== id))} />
        ))}
      </div>
    </main>
  );
}
