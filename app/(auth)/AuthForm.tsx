"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type AuthState } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const isUp = mode === "register";
  const [state, action, pending] = useActionState<AuthState, FormData>(isUp ? register : login, {});
  const v = state.values ?? {};

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {isUp && (
        <>
          <label className="field-label" htmlFor="name">
            Full name
            <input className="input" id="name" name="name" autoComplete="name" placeholder="Ama Mensah" defaultValue={v.name} required />
          </label>
          <label className="field-label" htmlFor="phone">
            Phone (Mobile Money)
            <input className="input" id="phone" name="phone" type="tel" autoComplete="tel" placeholder="024 123 4567" defaultValue={v.phone} required />
          </label>
        </>
      )}
      <label className="field-label" htmlFor="email">
        Email
        <input className="input" id="email" name="email" type="email" autoComplete="email" placeholder="ama@example.com" defaultValue={v.email} required />
      </label>
      <label className="field-label" htmlFor="password">
        Password
        <input className="input" id="password" name="password" type="password" autoComplete={isUp ? "new-password" : "current-password"} placeholder="At least 8 characters" required />
      </label>
      <span className="form-error" role="alert">{state.error}</span>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Please wait…" : isUp ? "Create account" : "Log in"}
      </button>
      <p className="m-0 text-center text-sm" style={{ color: "var(--muted)" }}>
        {isUp ? "Already have an account? " : "New to Altheo Homes? "}
        <Link href={(isUp ? "/login" : "/register") + (next ? `?next=${encodeURIComponent(next)}` : "")} style={{ color: "var(--accent)", fontWeight: 600 }}>
          {isUp ? "Log in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
