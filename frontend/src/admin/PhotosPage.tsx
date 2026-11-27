import { useEffect, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { FormError } from "@/components/ui/sign-in";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { outlineButtonClass, sectionClass } from "../landing/parts";
import { photoUrl } from "../residences/data";
import { photoProblem, uploadPhoto, type AdminPhoto } from "./photos";
import type { Building } from "./types";

const iconButton =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0";

type Busy = { set: string; text: string } | null;

/** Photos of one building and its room types (/admin/buildings/:id/photos, #38). */
export function PhotosPage() {
  const { id = "" } = useParams();
  const [building, setBuilding] = useState<Building | null>(null);
  const [photos, setPhotos] = useState<AdminPhoto[] | null>(null);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Building>(`/api/admin/buildings/${encodeURIComponent(id)}`),
      apiFetch<AdminPhoto[]>(`/api/admin/buildings/${encodeURIComponent(id)}/photos`),
    ])
      .then(([b, p]) => {
        setBuilding(b);
        setPhotos(p);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the photos. Try again."));
  }, [id]);

  const setOf = (roomTypeId: string | null) => (photos ?? []).filter((p) => p.room_type_id === roomTypeId).sort((a, b) => a.position - b.position);

  const upload = async (roomTypeId: string | null, files: File[]) => {
    const found = files.map(photoProblem).filter((p): p is string => p !== null);
    const good = files.filter((f) => photoProblem(f) === null);
    setError("");
    for (const [i, file] of good.entries()) {
      setBusy({ set: roomTypeId ?? "building", text: `Uploading ${i + 1} of ${good.length}…` });
      try {
        const added = await uploadPhoto(id, roomTypeId, file);
        setPhotos((all) => [...(all ?? []), added]);
      } catch (e) {
        found.push(`${file.name}: ${e instanceof ApiError ? e.message : "couldn't upload it. Try again."}`);
      }
    }
    setProblems(found);
    setBusy(null);
  };

  const move = async (roomTypeId: string | null, from: number, to: number) => {
    const current = setOf(roomTypeId);
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const before = photos;
    const positions = new Map(next.map((p, i) => [p.id, i]));
    setPhotos((all) => (all ?? []).map((p) => (positions.has(p.id) ? { ...p, position: positions.get(p.id)! } : p)));
    setError("");
    try {
      await apiFetch(`/api/admin/buildings/${encodeURIComponent(id)}/photos/order`, {
        method: "PUT",
        body: { room_type_id: roomTypeId, photo_ids: next.map((p) => p.id) },
      });
    } catch (e) {
      setPhotos(before);
      setError(e instanceof ApiError ? e.message : "Couldn't change the order. Try again.");
    }
  };

  const remove = async (photo: AdminPhoto) => {
    setError("");
    try {
      await apiFetch(`/api/admin/buildings/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo.id)}`, { method: "DELETE" });
      setPhotos((all) => {
        const rest = (all ?? []).filter((p) => p.id !== photo.id);
        const same = rest.filter((p) => p.room_type_id === photo.room_type_id).sort((a, b) => a.position - b.position);
        const positions = new Map(same.map((p, i) => [p.id, i]));
        return rest.map((p) => (positions.has(p.id) ? { ...p, position: positions.get(p.id)! } : p));
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete that photo. Try again.");
    }
  };

  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <Link to="/admin/buildings" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to buildings
      </Link>
      <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">{building ? `Photos of ${building.name}` : "Photos"}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        The first photo in each set is the cover. Tenants see a room type's own photos first, then the building's. Until there are any, the site shows a stock photo.
      </p>
      <div className="mt-6 flex max-w-5xl flex-col gap-6">
        {error && <FormError>{error}</FormError>}
        {problems.length > 0 && (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">Some photos weren't added:</p>
            <ul className="mt-1 list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {photos === null && !error && <p className="text-muted-foreground">Loading photos…</p>}
        {building && photos && (
          <>
            <PhotoSet
              title="The building"
              hint="Outside, the compound, shared spaces."
              setKey="building"
              photos={setOf(null)}
              busy={busy}
              onUpload={(files) => void upload(null, files)}
              onMove={(from, to) => void move(null, from, to)}
              onDelete={(p) => void remove(p)}
            />
            {building.room_types.map((rt) => (
              <PhotoSet
                key={rt.id}
                title={rt.name}
                hint="Inside this kind of room."
                setKey={rt.id}
                photos={setOf(rt.id)}
                busy={busy}
                onUpload={(files) => void upload(rt.id, files)}
                onMove={(from, to) => void move(rt.id, from, to)}
                onDelete={(p) => void remove(p)}
              />
            ))}
          </>
        )}
      </div>
    </main>
  );
}

function PhotoSet({
  title,
  hint,
  setKey,
  photos,
  busy,
  onUpload,
  onMove,
  onDelete,
}: {
  title: string;
  hint: string;
  setKey: string;
  photos: AdminPhoto[];
  busy: Busy;
  onUpload: (files: File[]) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (p: AdminPhoto) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const inputId = `photos-${setKey}`;
  const uploading = busy?.set === setKey;
  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onUpload(files);
  };

  return (
    <section aria-label={title} className="flex flex-col gap-4 glass-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {hint} {photos.length === 0 ? "No photos yet." : `${photos.length} ${photos.length === 1 ? "photo" : "photos"}.`}
          </p>
        </div>
        <div>
          {/* The real file input is hidden; the label is its button, and shows the input's keyboard focus. */}
          <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={Boolean(busy)} onChange={onFiles} className="peer sr-only" />
          <label
            htmlFor={inputId}
            className={cn(outlineButtonClass, "cursor-pointer gap-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring", busy && "pointer-events-none opacity-60")}
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {uploading ? busy.text : "Add photos"}
          </label>
        </div>
      </div>
      {photos.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="relative aspect-[4/3]">
                <img src={photoUrl(p.id, "thumb")} alt={`${title}, photo ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-2 top-2">
                    <Badge tone="success">Cover</Badge>
                  </span>
                )}
              </div>
              {confirming === p.id ? (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>Delete this photo?</span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => setConfirming(null)} className="min-h-11 rounded-full px-3 font-medium hover:bg-accent">
                      Keep it
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(null);
                        onDelete(p);
                      }}
                      className="min-h-11 rounded-full bg-destructive px-4 font-medium text-destructive-foreground"
                    >
                      Delete
                    </button>
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="flex gap-2">
                    <button type="button" aria-label={`Move photo ${i + 1} earlier`} disabled={i === 0 || Boolean(busy)} onClick={() => onMove(i, i - 1)} className={iconButton}>
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" aria-label={`Move photo ${i + 1} later`} disabled={i === photos.length - 1 || Boolean(busy)} onClick={() => onMove(i, i + 1)} className={iconButton}>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                  <button type="button" aria-label={`Delete photo ${i + 1}`} disabled={Boolean(busy)} onClick={() => setConfirming(p.id)} className={iconButton}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
