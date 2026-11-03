import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../api";
import { useAuth } from "../auth/AuthContext";
import { cn } from "@/lib/utils";
import { buttonClass } from "./parts";
import type { Residence } from "./Residences";

type Values = { name: string; email: string; phone: string; room_type_id: string; message: string };
type Errors = Partial<Record<keyof Values, string>>;

const inputClass =
  "min-h-11 w-full border-0 border-b bg-transparent px-0 py-2.5 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-foreground focus:outline-none focus:ring-0";

function Line({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function validate(v: Values): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = "Enter a valid email address.";
  if (v.phone.trim() && !/^(0|\+233)\d{9}$/.test(v.phone.replace(/[\s\-()]/g, ""))) {
    e.phone = "Enter a Ghana phone number, like 024 123 4567.";
  }
  if (v.message.trim().length < 10) e.message = "Tell us a little more (at least 10 characters).";
  return e;
}

/** Footer contact form. Saves the message for the Altheo team (POST /api/contact). */
export function ContactForm({ residences, enquiry }: { residences: Residence[]; enquiry: Residence | null }) {
  const { user } = useAuth();
  const [values, setValues] = useState<Values>({ name: "", email: "", phone: "", room_type_id: "", message: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Fill in what we already know about a logged-in visitor.
  useEffect(() => {
    if (user) setValues((v) => ({ ...v, name: v.name || user.name, email: v.email || user.email, phone: v.phone || (user.phone ?? "") }));
  }, [user]);

  // "Enquire" on a residence picks that room and starts the message.
  useEffect(() => {
    if (!enquiry) return;
    setValues((v) => ({
      ...v,
      room_type_id: enquiry.id,
      message: v.message || `I'm interested in a ${enquiry.name} at ${enquiry.building}, ${enquiry.location}.`,
    }));
  }, [enquiry]);

  const set = (key: keyof Values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ detail: string }>("/api/contact", { method: "POST", body: values });
      setBanner({ tone: "ok", text: res.detail });
      setValues((v) => ({ ...v, room_type_id: "", message: "" }));
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors as Errors);
        setBanner(Object.keys(err.errors).length ? null : { tone: "error", text: err.message });
      } else {
        setBanner({ tone: "error", text: "Couldn't send your message. Try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  const described = (key: keyof Values) => (errors[key] ? `contact-${key}-error` : undefined);

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Contact Altheo Homes" className="grid gap-6 sm:grid-cols-2">
      <Line id="contact-name" label="Your name *" error={errors.name}>
        <input id="contact-name" className={cn(inputClass, errors.name ? "border-destructive" : "border-input")} autoComplete="name" value={values.name} onChange={set("name")} aria-invalid={errors.name ? true : undefined} aria-describedby={described("name")} />
      </Line>
      <Line id="contact-email" label="Email address *" error={errors.email}>
        <input id="contact-email" type="email" className={cn(inputClass, errors.email ? "border-destructive" : "border-input")} autoComplete="email" value={values.email} onChange={set("email")} aria-invalid={errors.email ? true : undefined} aria-describedby={described("email")} />
      </Line>
      <Line id="contact-phone" label="Phone number" error={errors.phone}>
        <input id="contact-phone" type="tel" inputMode="tel" className={cn(inputClass, errors.phone ? "border-destructive" : "border-input")} autoComplete="tel" placeholder="024 123 4567" value={values.phone} onChange={set("phone")} aria-invalid={errors.phone ? true : undefined} aria-describedby={described("phone")} />
      </Line>
      <Line id="contact-room" label="Residence of interest">
        <select id="contact-room" className={cn(inputClass, "border-input")} value={values.room_type_id} onChange={set("room_type_id")}>
          <option value="">Not sure yet</option>
          {residences.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.building}, {r.location}
            </option>
          ))}
        </select>
      </Line>
      <div className="sm:col-span-2">
        <Line id="contact-message" label="Message *" error={errors.message}>
          <textarea id="contact-message" rows={3} className={cn(inputClass, "resize-y", errors.message ? "border-destructive" : "border-input")} value={values.message} onChange={set("message")} aria-invalid={errors.message ? true : undefined} aria-describedby={described("message")} />
        </Line>
      </div>
      <div className="flex flex-col items-start gap-3 sm:col-span-2">
        {banner && (
          <p role={banner.tone === "error" ? "alert" : "status"} className={cn("text-sm font-medium", banner.tone === "error" ? "text-destructive" : "text-success")}>
            {banner.text}
          </p>
        )}
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={cn(buttonClass, "disabled:opacity-80")}>
          {busy ? "Sending…" : "Send a message"}
        </button>
      </div>
    </form>
  );
}
