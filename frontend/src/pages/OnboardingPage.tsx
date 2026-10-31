import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";
import { safeNext } from "../auth/safeNext";
import { Banner, Button, Field } from "../components";
import { AuthLayout } from "./AuthLayout";

/** Asks people who signed up with Google for the phone number we need for MoMo and SMS. */
export function OnboardingPage() {
  const { user, updateMe } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^(0|\+233)\d{9}$/.test(phone.replace(/[\s\-()]/g, ""))) {
      setPhoneError("Enter a Ghana phone number, like 024 123 4567.");
      return;
    }
    setBusy(true);
    try {
      await updateMe({ phone });
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.errors.phone) setPhoneError(err.errors.phone);
      else setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={`Welcome, ${user?.name.split(" ")[0] ?? "there"}`}
      intro="One last thing: add your phone number so you can pay with Mobile Money and get updates about your home."
    >
      {error && <Banner>{error}</Banner>}
      <form className="form-stack" onSubmit={onSubmit} noValidate>
        <Field
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="024 123 4567"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setPhoneError("");
          }}
          error={phoneError}
        />
        <Button type="submit" variant="primary" busy={busy} className="btn-block">
          Continue
        </Button>
      </form>
    </AuthLayout>
  );
}
