import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";
import { safeNext } from "../auth/safeNext";
import { SignUpPage, type SignUpErrors, type SignUpValues } from "@/components/ui/sign-up";
import { AUTH_PHOTO, AuthBrand, startGoogleSignIn } from "./AuthBrand";

/** Quick checks before sending; the server checks everything again. */
function validate(v: SignUpValues): SignUpErrors {
  const errors: SignUpErrors = {};
  if (v.name.trim().length < 2) errors.name = "Enter your full name.";
  if (!/^(0|\+233)\d{9}$/.test(v.phone.replace(/[\s\-()]/g, ""))) {
    errors.phone = "Enter a Ghana phone number, like 024 123 4567.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errors.email = "Enter a valid email address.";
  if (v.password.length < 8) errors.password = "Use at least 8 characters for your password.";
  return errors;
}

export function RegisterPage() {
  const { register, googleEnabled } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [fieldErrors, setFieldErrors] = useState<SignUpErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSignUp = async (values: SignUpValues) => {
    const errors = validate(values);
    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      await register(values);
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors as SignUpErrors);
        setError(Object.keys(err.errors).length ? "" : err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
      setBusy(false);
    }
  };

  return (
    <SignUpPage
      brand={<AuthBrand />}
      heroImageSrc={AUTH_PHOTO}
      error={error}
      fieldErrors={fieldErrors}
      busy={busy}
      onSignUp={onSignUp}
      onFieldChange={(field) => setFieldErrors((f) => ({ ...f, [field]: undefined }))}
      onGoogleSignIn={googleEnabled ? () => startGoogleSignIn(next) : undefined}
      onSignInInstead={() => navigate(`/login?next=${encodeURIComponent(next)}`)}
    />
  );
}
