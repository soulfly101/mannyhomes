import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";
import { safeNext } from "../auth/safeNext";
import { AuthField, AuthSplitLayout, FormError, SubmitButton } from "@/components/ui/sign-in";
import { AUTH_PHOTO, AuthBrand } from "./AuthBrand";

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
    <AuthSplitLayout heroImageSrc={AUTH_PHOTO}>
      <div className="flex flex-col gap-6">
        <div className="animate-element">
          <AuthBrand />
        </div>
        <h1 className="animate-element animate-delay-100 font-serif text-5xl font-medium leading-[1.05] md:text-6xl">
          Welcome, {user?.name.split(" ")[0] ?? "there"}
        </h1>
        <p className="animate-element animate-delay-200 text-muted-foreground">
          One last thing: add your phone number so you can pay with Mobile Money and get updates about your home.
        </p>
        {error && <FormError>{error}</FormError>}
        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          <AuthField
            delayClass="animate-delay-300"
            label="Phone number"
            name="phone"
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
          <SubmitButton busy={busy} delayClass="animate-delay-400">
            Continue
          </SubmitButton>
        </form>
      </div>
    </AuthSplitLayout>
  );
}
