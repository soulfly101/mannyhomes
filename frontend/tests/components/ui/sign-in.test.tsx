import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthField, SignInPage } from "@/components/ui/sign-in";

test("renders the default title, description and labelled fields", () => {
  render(<SignInPage />);
  expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  expect(screen.getByText("Log in to see prices and manage your bookings.")).toBeInTheDocument();
  expect(screen.getByLabelText("Email address")).toHaveAttribute("autocomplete", "email");
  expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
});

test("submits the form", () => {
  const onSignIn = jest.fn((e) => e.preventDefault());
  render(<SignInPage onSignIn={onSignIn} />);
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

test("Google and reset password only appear when handled", async () => {
  const { rerender } = render(<SignInPage />);
  expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();

  const onGoogle = jest.fn();
  const onReset = jest.fn();
  rerender(<SignInPage onGoogleSignIn={onGoogle} onResetPassword={onReset} />);
  await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
  expect(onGoogle).toHaveBeenCalled();
  expect(onReset).toHaveBeenCalled();
});

test("shows the form error and a busy button", () => {
  render(<SignInPage error="That email and password don't match. Try again." busy />);
  expect(screen.getByRole("alert")).toHaveTextContent("That email and password don't match.");
  expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
});

test("no testimonials are shown unless given", () => {
  const { rerender, container } = render(<SignInPage heroImageSrc="/photos/hero.jpg" />);
  expect(container.querySelector(".animate-testimonial")).toBeNull();
  rerender(
    <SignInPage
      heroImageSrc="/photos/hero.jpg"
      testimonials={[{ avatarSrc: "/a.jpg", name: "Real Tenant", handle: "Oyarifa", text: "Great place." }]}
    />,
  );
  expect(screen.getByText("Great place.")).toBeInTheDocument();
});

test("AuthField links its hint and error to the input", () => {
  render(<AuthField label="Phone number" hint="Ghana number." error="Enter a Ghana phone number." />);
  const input = screen.getByLabelText("Phone number");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Ghana number. Enter a Ghana phone number.");
});
