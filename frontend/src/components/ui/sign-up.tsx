// Sign-up page in the same two-column style as SignInPage (see sign-in.tsx).
import { useState, type FormEvent, type ReactNode } from "react";
import { AuthField, AuthSplitLayout, FormError, GoogleButton, SubmitButton, TextLink } from "./sign-in";

export type SignUpValues = { name: string; phone: string; email: string; password: string };
export type SignUpErrors = Partial<Record<keyof SignUpValues, string>>;

interface SignUpPageProps {
  title?: ReactNode;
  description?: ReactNode;
  heroImageSrc?: string;
  brand?: ReactNode;
  /** Message for the whole form, e.g. "An account with that email already exists." */
  error?: string;
  /** Messages shown under each field. */
  fieldErrors?: SignUpErrors;
  busy?: boolean;
  onSignUp: (values: SignUpValues) => void;
  /** Called when a field changes, so its error can be cleared. */
  onFieldChange?: (field: keyof SignUpValues) => void;
  /** Leave out to hide "Continue with Google". */
  onGoogleSignIn?: () => void;
  onSignInInstead?: () => void;
}

const EMPTY: SignUpValues = { name: "", phone: "", email: "", password: "" };

export function SignUpPage({
  title = <span className="text-foreground">Create your account</span>,
  description = "Sign up to see prices and book an apartment.",
  heroImageSrc,
  brand,
  error,
  fieldErrors = {},
  busy,
  onSignUp,
  onFieldChange,
  onGoogleSignIn,
  onSignInInstead,
}: SignUpPageProps) {
  const [values, setValues] = useState<SignUpValues>(EMPTY);
  const set = (field: keyof SignUpValues) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    onFieldChange?.(field);
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSignUp(values);
  };

  return (
    <AuthSplitLayout heroImageSrc={heroImageSrc}>
      <div className="flex flex-col gap-6">
        {brand && <div className="animate-element">{brand}</div>}
        <h1 className="animate-element animate-delay-100 text-5xl font-bold tracking-tight leading-[1.05] md:text-6xl">{title}</h1>
        <p className="animate-element animate-delay-200 text-muted-foreground">{description}</p>

        {error && <FormError>{error}</FormError>}

        <form className="space-y-5" onSubmit={submit} noValidate>
          <AuthField delayClass="animate-delay-300" label="Full name" name="name" autoComplete="name" placeholder="Ama Mensah" value={values.name} onChange={set("name")} error={fieldErrors.name} />
          <AuthField
            delayClass="animate-delay-300"
            label="Phone number"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="024 123 4567"
            hint="For Mobile Money payments and updates about your home."
            value={values.phone}
            onChange={set("phone")}
            error={fieldErrors.phone}
          />
          <AuthField delayClass="animate-delay-400" label="Email address" name="email" type="email" autoComplete="email" placeholder="ama@example.com" value={values.email} onChange={set("email")} error={fieldErrors.email} />
          <AuthField
            delayClass="animate-delay-400"
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Choose a password"
            hint="At least 8 characters."
            revealable
            value={values.password}
            onChange={set("password")}
            error={fieldErrors.password}
          />
          <SubmitButton busy={busy} delayClass="animate-delay-500">
            Create account
          </SubmitButton>
        </form>

        {onGoogleSignIn && <GoogleButton onClick={onGoogleSignIn} delayClass="animate-delay-600" />}

        <p className="animate-element animate-delay-700 text-center text-sm text-muted-foreground">
          Already have an account? <TextLink onClick={onSignInInstead}>Log in</TextLink>
        </p>
      </div>
    </AuthSplitLayout>
  );
}
