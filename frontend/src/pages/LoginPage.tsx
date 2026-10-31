import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";
import { safeNext } from "../auth/safeNext";
import { Banner, Button, Field, GoogleButton } from "../components";
import { AuthLayout } from "./AuthLayout";

const GOOGLE_ERRORS: Record<string, string> = {
  google: "Google sign-in didn't work. Try again, or log in with your email.",
  google_cancelled: "Google sign-in was cancelled.",
};

export function LoginPage() {
  const { login, googleEnabled } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(GOOGLE_ERRORS[params.get("error") ?? ""] ?? "");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
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
    <AuthLayout title="Log in" intro="Welcome back. Log in to see prices and manage your bookings.">
      {error && <Banner>{error}</Banner>}
      {googleEnabled && (
        <>
          <GoogleButton next={next} />
          <p className="auth-divider">or</p>
        </>
      )}
      <form className="form-stack" onSubmit={onSubmit} noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="ama@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="primary" busy={busy} className="btn-block">
          Log in
        </Button>
      </form>
      <p className="auth-switch">
        New here? <Link to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link>
      </p>
    </AuthLayout>
  );
}
