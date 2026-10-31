import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthContext";

/** Sends logged-out visitors to log in, and people without a phone number to onboarding first. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const here = location.pathname + location.search;

  if (user === undefined) return null;
  if (user === null) return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />;
  if (user.needs_onboarding && location.pathname !== "/onboarding") {
    return <Navigate to={`/onboarding?next=${encodeURIComponent(here)}`} replace />;
  }
  return <>{children}</>;
}
