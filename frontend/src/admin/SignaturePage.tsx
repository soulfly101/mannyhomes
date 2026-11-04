import { useEffect, useState, type ChangeEvent } from "react";
import { ApiError, apiFetch } from "../api";
import { SignaturePad } from "../agreements/SignaturePad";
import { FormError } from "@/components/ui/sign-in";
import { buttonClass, chipClass, sectionClass } from "../landing/parts";

const MAX_BYTES = 500 * 1024;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

/** The admin's signature (/admin/signature), stamped on every new tenancy agreement. */
export function SignaturePage() {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"upload" | "draw">("upload");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ image: string | null }>("/api/admin/signature")
      .then((r) => setSaved(r.image))
      .catch((e) => {
        setSaved(null);
        setError(e instanceof ApiError ? e.message : "Couldn't load your signature. Try again.");
      });
  }, []);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setDone("");
    setPending(null);
    if (!file) return;
    if (file.type !== "image/png") return setError("Choose a PNG image.");
    if (file.size > MAX_BYTES) return setError("That image is too large. Use one under 500 KB.");
    setError("");
    setPending(await readAsDataUrl(file));
  };

  const save = async () => {
    if (!pending) return setError(mode === "draw" ? "Draw your signature first." : "Choose a PNG image first.");
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch<{ image: string }>("/api/admin/signature", { method: "PUT", body: { image: pending } });
      setSaved(r.image);
      setPending(null);
      setDone("Signature saved. New agreements will use it.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your signature. Try again.");
    }
    setBusy(false);
  };

  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Your signature</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">It's stamped on each new tenancy agreement when you allocate a room. Agreements already made keep the signature they have.</p>
      <div className="mt-8 flex max-w-2xl flex-col gap-6">
        {error && <FormError>{error}</FormError>}
        {done && (
          <p role="status" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            {done}
          </p>
        )}
        {saved && (
          <section aria-label="Current signature" className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-bold tracking-tight">Current signature</h2>
            <div className="mt-3 rounded-xl bg-white p-4">
              <img src={saved} alt="Your saved signature" className="h-20 max-w-full object-contain object-left" />
            </div>
          </section>
        )}
        {saved === null && !error && <p className="text-muted-foreground">You haven't added a signature yet. You'll need one before you can allocate rooms.</p>}
        <section aria-label={saved ? "Replace your signature" : "Add your signature"} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-bold tracking-tight">{saved ? "Replace it" : "Add your signature"}</h2>
          <div role="group" aria-label="How to add it" className="flex flex-wrap gap-2">
            {(["upload", "draw"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setPending(null);
                }}
                className={chipClass(mode === m)}
              >
                {m === "upload" ? "Upload a PNG" : "Draw it"}
              </button>
            ))}
          </div>
          {mode === "upload" ? (
            <div>
              <label htmlFor="signature-file" className="text-sm font-medium text-muted-foreground">
                Signature image (PNG, ideally transparent, under 500 KB)
              </label>
              <input id="signature-file" type="file" accept="image/png" onChange={(e) => void onFile(e)} className="mt-2 block min-h-11 w-full text-sm" />
              {pending && (
                <div className="mt-3 rounded-xl bg-white p-4">
                  <img src={pending} alt="Signature to save" className="h-20 max-w-full object-contain object-left" />
                </div>
              )}
            </div>
          ) : (
            <SignaturePad onChange={setPending} />
          )}
          <div>
            <button type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()} className={`${buttonClass} disabled:cursor-progress disabled:opacity-80`}>
              {busy ? "Please wait…" : "Save signature"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
