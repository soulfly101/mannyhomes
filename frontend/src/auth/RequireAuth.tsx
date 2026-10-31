import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Card } from "../components/Card";
import { useAuth, type Role } from "./AuthContext";

/**
 * Sends logged-out visitors to log in, and people without a phone number to onboarding first.
 * With `roles`, anyone else sees a "no access" message instead of the page.
 */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();
  const here = location.pathname + location.search;

  if (user === undefined) return null;
  if (user === null) return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />;
  if (user.needs_onboarding && location.pathname !== "/onboarding") {
    return <Navigate to={`/onboarding?next=${encodeURIComponent(here)}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <main className="wrap auth-page">
        <Card as="section" aria-labelledby="no-access-title">
          <h1 id="no-access-title">You don't have access to this page</h1>
          <p className="muted">It's only for Altheo Homes staff. If you think that's wrong, ask an admin.</p>
        </Card>
      </main>
    );
  }
  return <>{children}</>;
}
