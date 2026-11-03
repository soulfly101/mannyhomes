import { Link } from "react-router";

/** "Altheo Homes" wordmark linking home, shown above the sign-in/sign-up forms. */
export function AuthBrand() {
  return (
    <Link to="/" className="text-lg font-bold tracking-tight text-foreground no-underline hover:text-primary">
      Altheo Homes
    </Link>
  );
}

export const AUTH_PHOTO = "/photos/hero.jpg";

export const startGoogleSignIn = (next: string) => {
  window.location.assign(`/api/auth/google/start?next=${encodeURIComponent(next)}`);
};
