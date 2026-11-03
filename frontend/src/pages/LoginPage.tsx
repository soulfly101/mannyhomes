import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";
import { safeNext } from "../auth/safeNext";
import { SignInPage } from "@/components/ui/sign-in";
import { AUTH_PHOTO, AuthBrand, startGoogleSignIn } from "./AuthBrand";

const GOOGLE_ERRORS: Record<string, string> = {
  google: "Google sign-in didn't work. Try again, or log in with your email.",
  google_cancelled: "Google sign-in was cancelled.",
};

export function LoginPage() {
  const { login, googleEnabled } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState(GOOGLE_ERRORS[params.get("error") ?? ""] ?? "");
  const [busy, setBusy] = useState(false);

  const onSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const user = await login(email, password);
      navigate(user.needs_onboarding ? `/onboarding?next=${encodeURIComponent(next)}` : next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <SignInPage
      brand={<AuthBrand />}
      heroImageSrc={AUTH_PHOTO}
      error={error}
      busy={busy}
      onSignIn={onSignIn}
      onGoogleSignIn={googleEnabled ? () => startGoogleSignIn(next) : undefined}
      onCreateAccount={() => navigate(`/register?next=${encodeURIComponent(next)}`)}
    />
  );
}
