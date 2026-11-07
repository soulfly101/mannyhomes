import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { ApiError, apiFetch } from "../api";
import { Reveal } from "../components/Reveal";
import { Badge } from "@/components/ui/badge";
import { FormError, InputWrapper } from "@/components/ui/sign-in";
import { cn } from "@/lib/utils";
import { formatDate } from "../format";
import { buttonClass, sectionClass } from "../landing/parts";
import { SitePage } from "../landing/SitePage";
import { CATEGORIES, CATEGORY_LABEL, isOpen, TENANT_STATUS, type Ticket, type TicketCategory } from "./tickets";

/** How often the page checks for status changes while a report is still open. */
export const TICKETS_POLL_MS = 10000;

type MyTickets = { tickets: Ticket[]; blocked_reason: string | null };

const cardClass = "rounded-xl border border-border bg-card p-6 shadow-sm";

function ReportForm({ onSent }: { onSent: (t: Ticket) => void }) {
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ category?: string; description?: string }>({});
  const [banner, setBanner] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problems: typeof errors = {};
    if (!category) problems.category = "Choose what kind of problem it is.";
    if (description.trim().length < 10) problems.description = "Describe the problem in a few more words.";
    setErrors(problems);
    setBanner("");
    setSent(false);
    if (Object.keys(problems).length > 0 || !category) return;
    setBusy(true);
    try {
      onSent(await apiFetch<Ticket>("/api/tickets", { method: "POST", body: { category, description } }));
      setCategory("");
      setDescription("");
      setSent(true);
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : "Couldn't send your report. Try again.");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {banner && <FormError>{banner}</FormError>}
      <fieldset>
        <legend className="text-sm font-medium text-muted-foreground">Issue category</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.code}
              type="button"
              aria-pressed={category === c.code}
              onClick={() => setCategory(c.code)}
              className={cn(
                "min-h-12 rounded-xl border-2 px-2 py-3 text-sm font-semibold transition duration-200 hover:shadow-sm motion-safe:hover:-translate-y-0.5",
                category === c.code ? "border-primary bg-accent" : "border-border bg-card hover:border-foreground/30",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        {errors.category && (
          <p role="alert" className="mt-1.5 text-sm font-medium text-destructive">
            {errors.category}
          </p>
        )}
      </fieldset>
      <div>
        <label htmlFor="ticket-description" className="text-sm font-medium text-muted-foreground">
          Description
        </label>
        <InputWrapper invalid={Boolean(errors.description)}>
          <textarea
            id="ticket-description"
            rows={5}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? "ticket-description-error" : "ticket-description-hint"}
            placeholder="What's wrong, and where in your room?"
            className="block w-full resize-y rounded-md bg-transparent p-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
        </InputWrapper>
        {errors.description ? (
          <p id="ticket-description-error" role="alert" className="mt-1.5 text-sm font-medium text-destructive">
            {errors.description}
          </p>
        ) : (
          <p id="ticket-description-hint" className="mt-1.5 text-sm text-muted-foreground">
            Our team sees this straight away.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={`${buttonClass} disabled:cursor-progress disabled:opacity-80`}>
          {busy ? "Sending…" : "Send report"}
        </button>
        {sent && (
          <span role="status" className="text-sm font-medium text-muted-foreground">
            Sent. You can follow it below.
          </span>
        )}
      </div>
    </form>
  );
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const status = TENANT_STATUS[ticket.status];
  return (
    <li className="border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">{CATEGORY_LABEL[ticket.category]}</p>
        <Badge tone={status.tone}>{status.text}</Badge>
      </div>
      <p className="mt-1 whitespace-pre-line break-words text-sm">{ticket.description}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Reported {formatDate(ticket.created_at)} · Room {ticket.room_number}, {ticket.building}
      </p>
    </li>
  );
}

/** Reporting a problem and following earlier reports (/repairs), tenants only. */
export function RepairsPage() {
  const [data, setData] = useState<MyTickets | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      apiFetch<MyTickets>("/api/tickets")
        .then((d) => {
          setData(d);
          setError("");
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load your reports. Try again.")),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // Admins change statuses from their side; keep checking while anything is still open.
  const anyOpen = data?.tickets.some(isOpen) ?? false;
  useEffect(() => {
    if (!anyOpen) return;
    const timer = window.setInterval(() => void load(), TICKETS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [anyOpen, load]);

  return (
    <SitePage>
      <section aria-labelledby="repairs-title" className={`${sectionClass} py-12 md:py-16`}>
        <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
        <h1 id="repairs-title" className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
          Report an issue
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Tell us what needs fixing. You'll see its status change here as our team works on it.</p>
        <div className="mt-8 grid max-w-3xl gap-6">
          {error && !data && <FormError>{error}</FormError>}
          {!data && !error && <p className="text-muted-foreground">Loading…</p>}
          {data && (
            <>
              <Reveal>
                <section aria-label="New report" className={cardClass}>
                  {data.blocked_reason ? (
                    <div role="alert">
                      <p>{data.blocked_reason}</p>
                      {data.blocked_reason.includes("sanitation") && (
                        <Link to="/bills" className={`${buttonClass} mt-5`}>
                          See my bills
                        </Link>
                      )}
                    </div>
                  ) : (
                    <ReportForm onSent={(t) => setData((d) => (d ? { ...d, tickets: [t, ...d.tickets] } : d))} />
                  )}
                </section>
              </Reveal>
              <section aria-labelledby="history-title" className={cardClass}>
                <h2 id="history-title" className="text-2xl font-bold tracking-tight">
                  Your reports
                </h2>
                {data.tickets.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">You haven't reported anything yet.</p>
                ) : (
                  <ul aria-label="Your reports" className="mt-4">
                    {data.tickets.map((t) => (
                      <TicketRow key={t.id} ticket={t} />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </SitePage>
  );
}
