// Based on the 21st.dev SignInPage component, adapted for Altheo Homes:
// brand blue instead of violet, no blur or glass, labelled inputs, error/busy states,
// optional Google and reset links, and a shared two-column layout used by sign-up too.
import { useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// --- HELPER COMPONENTS (ICONS) ---

export const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
);

// --- TYPE DEFINITIONS ---

export interface Testimonial {
  avatarSrc: string;
  name: string;
  handle: string;
  text: string;
}

interface SignInPageProps {
  title?: ReactNode;
  description?: ReactNode;
  heroImageSrc?: string;
  /** Only real testimonials from real tenants. Leave empty otherwise. */
  testimonials?: Testimonial[];
  /** Shown above the form, e.g. the Altheo Homes name linking home. */
  brand?: ReactNode;
  /** Message for the whole form, e.g. "That email and password don't match." */
  error?: string;
  /** While signing in: the button shows "Please wait…" and ignores clicks. */
  busy?: boolean;
  onSignIn?: (event: FormEvent<HTMLFormElement>) => void;
  /** Leave out to hide "Continue with Google". */
  onGoogleSignIn?: () => void;
  /** Leave out to hide "Reset password". */
  onResetPassword?: () => void;
  onCreateAccount?: () => void;
}

// --- SUB-COMPONENTS ---

/** Solid input frame with a clear border; the border turns blue while typing. */
export const InputWrapper = ({ children, invalid }: { children: ReactNode; invalid?: boolean }) => (
  <div
    className={cn(
      "mt-1.5 rounded-md border bg-card transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
      invalid ? "border-destructive" : "border-input",
    )}
  >
    {children}
  </div>
);

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  /** Adds a show/hide button for passwords. */
  revealable?: boolean;
  delayClass?: string;
};

/** Labelled input for the sign-in/sign-up forms, with hint and error wired up for screen readers. */
export function AuthField({ label, hint, error, revealable, delayClass, id, type = "text", className, ...rest }: AuthFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [shown, setShown] = useState(false);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={cn("animate-element", delayClass, className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <InputWrapper invalid={Boolean(error)}>
        <div className="relative">
          <input
            {...rest}
            id={inputId}
            type={revealable && shown ? "text" : type}
            aria-invalid={error ? true : undefined}
            aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
            className={cn(
              "w-full rounded-md bg-transparent p-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none",
              revealable && "pr-12",
            )}
          />
          {revealable && (
            <button
              type="button"
              onClick={() => setShown((s) => !s)}
              aria-label={shown ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
            >
              {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          )}
        </div>
      </InputWrapper>
      {hint && (
        <p id={hintId} className="mt-1.5 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export const FormError = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
    {children}
  </p>
);

export const SubmitButton = ({ busy, children, delayClass }: { busy?: boolean; children: ReactNode; delayClass?: string }) => (
  <button
    type="submit"
    aria-busy={busy || undefined}
    disabled={busy}
    className={cn(
      "animate-element w-full rounded-md bg-primary py-4 font-semibold tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-progress disabled:opacity-80",
      delayClass,
    )}
  >
    {busy ? "Please wait…" : children}
  </button>
);

export const GoogleButton = ({ onClick, delayClass }: { onClick: () => void; delayClass?: string }) => (
  <>
    <div className={cn("animate-element relative flex items-center justify-center", delayClass)}>
      <span className="w-full border-t border-border"></span>
      <span className="absolute bg-background px-4 text-sm text-muted-foreground">Or continue with</span>
    </div>
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "animate-element flex w-full items-center justify-center gap-3 rounded-md border border-border bg-card py-4 font-medium transition-colors hover:bg-secondary",
        delayClass,
      )}
    >
      <GoogleIcon />
      Continue with Google
    </button>
  </>
);

export const TextLink = ({ onClick, children }: { onClick?: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className="font-semibold text-primary hover:underline">
    {children}
  </button>
);

const TestimonialCard = ({ testimonial, delay }: { testimonial: Testimonial; delay: string }) => (
  <div className={`animate-testimonial ${delay} flex w-64 items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm`}>
    <img src={testimonial.avatarSrc} className="h-10 w-10 rounded-xl object-cover" alt="" />
    <div className="text-sm leading-snug">
      <p className="font-medium">{testimonial.name}</p>
      <p className="text-muted-foreground">{testimonial.handle}</p>
      <p className="mt-1 text-foreground/80">{testimonial.text}</p>
    </div>
  </div>
);

/** Two columns: form on the left, photo on the right (photo hidden on phones). Used by sign in, sign up and onboarding. */
export function AuthSplitLayout({
  children,
  heroImageSrc,
  testimonials = [],
}: {
  children: ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
}) {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background font-geist text-foreground md:flex-row">
      <section className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md">{children}</div>
      </section>
      {heroImageSrc && (
        <section className="relative hidden flex-1 overflow-hidden p-4 md:block" aria-hidden="true">
          <div
            className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageSrc})` }}
          ></div>
          {testimonials.length > 0 && (
            <div className="absolute bottom-8 left-1/2 flex w-full -translate-x-1/2 justify-center gap-4 px-8">
              <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
              {testimonials[1] && (
                <div className="hidden xl:flex">
                  <TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" />
                </div>
              )}
              {testimonials[2] && (
                <div className="hidden 2xl:flex">
                  <TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" />
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// --- MAIN COMPONENT ---

export const SignInPage = ({
  title = <span className="text-foreground">Welcome back</span>,
  description = "Log in to see prices and manage your bookings.",
  heroImageSrc,
  testimonials = [],
  brand,
  error,
  busy,
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  onCreateAccount,
}: SignInPageProps) => (
  <AuthSplitLayout heroImageSrc={heroImageSrc} testimonials={testimonials}>
    <div className="flex flex-col gap-6">
      {brand && <div className="animate-element">{brand}</div>}
      <h1 className="animate-element animate-delay-100 font-serif text-5xl font-medium leading-[1.05] md:text-6xl">{title}</h1>
      <p className="animate-element animate-delay-200 text-muted-foreground">{description}</p>

      {error && <FormError>{error}</FormError>}

      <form className="space-y-5" onSubmit={onSignIn} noValidate>
        <AuthField
          delayClass="animate-delay-300"
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="ama@example.com"
        />
        <AuthField
          delayClass="animate-delay-400"
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          revealable
        />
        {onResetPassword && (
          <div className="animate-element animate-delay-500 flex justify-end text-sm">
            <TextLink onClick={onResetPassword}>Reset password</TextLink>
          </div>
        )}
        <SubmitButton busy={busy} delayClass="animate-delay-600">
          Log in
        </SubmitButton>
      </form>

      {onGoogleSignIn && <GoogleButton onClick={onGoogleSignIn} delayClass="animate-delay-700" />}

      <p className="animate-element animate-delay-900 text-center text-sm text-muted-foreground">
        New here? <TextLink onClick={onCreateAccount}>Create an account</TextLink>
      </p>
    </div>
  </AuthSplitLayout>
);
