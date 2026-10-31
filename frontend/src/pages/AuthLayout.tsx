import type { ReactNode } from "react";
import { Card } from "../components";

/** Centred glass card used by the log in, sign up and onboarding pages. */
export function AuthLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="wrap auth-page">
      <Card as="section" className="rise auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{title}</h1>
        {intro && <p className="muted auth-intro">{intro}</p>}
        {children}
      </Card>
    </main>
  );
}
