import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api";
import { useAuth, type RegisterInput } from "../auth/AuthContext";
import { safeNext } from "../auth/safeNext";
import { Banner, Button, Field, GoogleButton } from "../components";
import { AuthLayout } from "./AuthLayout";

type FieldErrors = Partial<Record<keyof RegisterInput, string>>;

const EMPTY: RegisterInput = { name: "", phone: "", email: "", password: "" };

/** Quick checks before sending; the server checks everything again. */
function validate(v: RegisterInput): FieldErrors {
  const errors: FieldErrors = {};
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
  const [values, setValues] = useState<RegisterInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof RegisterInput) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setFieldErrors((f) => ({ ...f, [key]: undefined }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
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
        setFieldErrors(err.errors as FieldErrors);
        setError(Object.keys(err.errors).length ? "" : err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Create your account" intro="Sign up to see prices and book an apartment.">
      {error && <Banner>{error}</Banner>}
      {googleEnabled && (
        <>
          <GoogleButton next={next} />
          <p className="auth-divider">or</p>
        </>
      )}
      <form className="form-stack" onSubmit={onSubmit} noValidate>
        <Field label="Full name" autoComplete="name" placeholder="Ama Mensah" value={values.name} onChange={set("name")} error={fieldErrors.name} />
        <Field
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="024 123 4567"
          hint="We use it for Mobile Money payments and updates about your home."
          value={values.phone}
          onChange={set("phone")}
          error={fieldErrors.phone}
        />
        <Field label="Email" type="email" autoComplete="email" placeholder="ama@example.com" value={values.email} onChange={set("email")} error={fieldErrors.email} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={values.password}
          onChange={set("password")}
          error={fieldErrors.password}
        />
        <Button type="submit" variant="primary" busy={busy} className="btn-block">
          Create account
        </Button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Log in</Link>
      </p>
    </AuthLayout>
  );
}
