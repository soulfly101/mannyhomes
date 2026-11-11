import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../api";
import { Reveal } from "../components/Reveal";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { FormError, InputWrapper } from "@/components/ui/sign-in";
import { formatDate, timeAgo } from "../format";
import { buttonClass, outlineButtonClass, sectionClass } from "../landing/parts";
import { emptyClass, Panel, selectClass } from "./dashboardParts";

type SmsStatus = "queued" | "sent" | "failed" | "skipped";
type Overview = {
  mode: "live" | "test" | "off";
  sender_id: string | null;
  max_length: number;
  buildings: { id: string; name: string }[];
  broadcasts: { id: string; template: string; audience: string; created_at: string; sent_by: string | null; counts: Record<SmsStatus, number> }[];
  recent: { id: number; kind: string; to: string | null; body: string; status: SmsStatus; error: string | null; created_at: string }[];
};
type Audience = { tenants: number; with_phone: number; example_name: string | null; longest_name: number };

export const PLACEHOLDER = "{{Tenant Name}}";
const PLACEHOLDER_RE = /\{\{\s*tenant\s*name\s*\}\}/gi;

/** The message with a name swapped in for {{Tenant Name}}, spaces tidied like the server does. */
export const personalise = (text: string, name: string) => text.replace(PLACEHOLDER_RE, name).split(/\s+/).filter(Boolean).join(" ");

const STATUS: Record<SmsStatus, { tone: BadgeTone; text: string }> = {
  sent: { tone: "success", text: "Sent" },
  queued: { tone: "warning", text: "Waiting" },
  failed: { tone: "danger", text: "Failed" },
  skipped: { tone: "neutral", text: "Not sent" },
};

function ModeNote({ mode, sender }: { mode: Overview["mode"]; sender: string | null }) {
  if (mode === "live") return <p className="mt-2 max-w-2xl text-muted-foreground">Texts go out through Moolre as {sender}. Tenants get them on any network.</p>;
  if (mode === "test")
    return (
      <div className="mt-4 max-w-2xl rounded-xl border border-warning/25 bg-warning/10 p-4 text-sm text-foreground">
        <strong>Test mode.</strong> Texts are only written to the server log on this computer. Nothing reaches anyone's phone.
      </div>
    );
  return (
    <div className="mt-4 max-w-2xl rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-foreground">
      <strong>Texts are off.</strong> To turn them on, put your Moolre SMS key and approved sender name in the server's settings (MOOLRE_SMS_VAS_KEY and MOOLRE_SMS_SENDER_ID). Until then, nothing is sent.
    </div>
  );
}

function Compose({ data, onSent }: { data: Overview; onSent: () => void }) {
  const [building, setBuilding] = useState("");
  const [audience, setAudience] = useState<Audience | null>(null);
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    setAudience(null);
    apiFetch<Audience>(`/api/admin/sms/audience${building ? `?building_id=${encodeURIComponent(building)}` : ""}`)
      .then((a) => current && setAudience(a))
      .catch(() => current && setAudience(null));
    return () => {
      current = false;
    };
  }, [building]);

  const longest = personalise(text, "x".repeat(audience?.longest_name ?? 0)).length;
  const tooLong = longest > data.max_length;
  const reach = audience?.with_phone ?? 0;
  const where = data.buildings.find((b) => b.id === building)?.name;
  const off = data.mode === "off";

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setNotice("");
    if (!text.trim()) return setError("Write the message first.");
    if (tooLong) return setError(`That's ${longest} characters with the longest name in. Keep it to ${data.max_length}.`);
    if (reach === 0) return setError("Nobody there has a phone number to text.");
    setError("");
    if (!confirming) return setConfirming(true);
    setBusy(true);
    try {
      await apiFetch("/api/admin/sms/broadcasts", { method: "POST", body: { text, building_id: building || null } });
      setText("");
      setConfirming(false);
      setNotice(`Sending to ${reach} ${reach === 1 ? "tenant" : "tenants"}. It can take a minute to reach everyone.`);
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't send. Try again.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Send a text to tenants">
      <form onSubmit={send} noValidate className="mt-3 flex flex-col gap-4">
        <label className="flex max-w-xs flex-col gap-1 text-sm text-muted-foreground">
          Send to
          <select value={building} onChange={(e) => (setBuilding(e.target.value), setConfirming(false))} className={selectClass}>
            <option value="">All tenants with a room</option>
            {data.buildings.map((b) => (
              <option key={b.id} value={b.id}>
                Tenants at {b.name}
              </option>
            ))}
          </select>
        </label>
        <p className="-mt-2 text-sm text-muted-foreground" aria-live="polite">
          {audience
            ? audience.tenants === audience.with_phone
              ? `${audience.tenants} ${audience.tenants === 1 ? "tenant" : "tenants"}`
              : `${audience.tenants} ${audience.tenants === 1 ? "tenant" : "tenants"}, ${audience.with_phone} with a phone number`
            : "Counting…"}
        </p>
        <div>
          <label htmlFor="sms-text" className="text-sm font-medium text-muted-foreground">
            Message
          </label>
          <InputWrapper invalid={tooLong}>
            <textarea
              id="sms-text"
              rows={4}
              maxLength={400}
              value={text}
              onChange={(e) => (setText(e.target.value), setConfirming(false))}
              aria-describedby="sms-count"
              placeholder={`e.g. Merry Christmas, ${PLACEHOLDER}! From all of us at Altheo Homes.`}
              className="block w-full resize-y rounded-md bg-transparent p-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
          </InputWrapper>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => (setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${PLACEHOLDER}`), setConfirming(false))} className={outlineButtonClass}>
              Insert {PLACEHOLDER}
            </button>
            <span id="sms-count" className={`text-sm tabular-nums ${tooLong ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
              {longest} / {data.max_length} characters{text.match(PLACEHOLDER_RE) ? " with the longest name" : ""}
            </span>
          </div>
        </div>
        {text.trim() && audience?.example_name && (
          <div className="rounded-xl border border-border bg-secondary p-4 text-sm">
            <p className="text-muted-foreground">Preview for {audience.example_name}</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{personalise(text, audience.example_name)}</p>
          </div>
        )}
        {error && <FormError>{error}</FormError>}
        {notice && (
          <p role="status" className="text-sm font-medium text-success">
            {notice}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || off} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-60`}>
            {busy ? "Sending…" : confirming ? `Yes, text ${reach} ${reach === 1 ? "tenant" : "tenants"}${where ? ` at ${where}` : ""}` : "Send text"}
          </button>
          {confirming && !busy && (
            <button type="button" onClick={() => setConfirming(false)} className={outlineButtonClass}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </Panel>
  );
}

const counts = (c: Record<SmsStatus, number>) =>
  (["sent", "queued", "failed", "skipped"] as const)
    .filter((s) => c[s] > 0)
    .map((s) => `${c[s]} ${STATUS[s].text.toLowerCase()}`)
    .join(", ");

/** Texts (/admin/texts): broadcasts to tenants, and every automatic text with whether it went (#27). */
export function TextsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    apiFetch<Overview>("/api/admin/sms")
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load texts. Try again."));
  useEffect(() => {
    void load();
  }, []);

  return (
    <main className={`${sectionClass} py-8 md:py-10`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Texts</h1>
      {error && (
        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>
      )}
      {!data && !error && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {data && (
        <>
          <ModeNote mode={data.mode} sender={data.sender_id} />
          <div className="mt-6 flex flex-col gap-5">
            <Reveal>
              <Compose data={data} onSent={() => void load()} />
            </Reveal>
            <Reveal>
              <Panel title="Sent to tenants">
                {data.broadcasts.length === 0 ? (
                  <p className={emptyClass}>Nothing sent yet. Your texts to tenants will be listed here.</p>
                ) : (
                  <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Sent to tenants">
                    {data.broadcasts.map((b) => (
                      <li key={b.id} className="py-3">
                        <p className="break-words font-medium">{b.template}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {b.audience} · {formatDate(b.created_at)}
                          {b.sent_by ? ` · by ${b.sent_by}` : ""} · {counts(b.counts) || "nobody"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </Reveal>
            <Reveal>
              <Panel title="Automatic texts">
                <p className="mt-1 text-sm text-muted-foreground">Sent by themselves for repair updates, new and due sanitation bills, payments and room allocations.</p>
                {data.recent.length === 0 ? (
                  <p className={emptyClass}>None yet.</p>
                ) : (
                  <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Automatic texts">
                    {data.recent.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-muted-foreground">
                            {m.kind} · {m.to ?? "Removed account"} · {timeAgo(m.created_at)}
                          </p>
                          <p className="mt-1 break-words">{m.body}</p>
                          {m.error && m.status !== "sent" && <p className="mt-1 text-sm text-muted-foreground">{m.error}</p>}
                        </div>
                        <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].text}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </Reveal>
          </div>
        </>
      )}
    </main>
  );
}
