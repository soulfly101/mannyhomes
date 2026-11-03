import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignUpPage } from "@/components/ui/sign-up";

test("collects the four fields and submits them", async () => {
  const onSignUp = jest.fn();
  render(<SignUpPage onSignUp={onSignUp} />);
  await userEvent.type(screen.getByLabelText("Full name"), "Ama Mensah");
  await userEvent.type(screen.getByLabelText("Phone number"), "0241234567");
  await userEvent.type(screen.getByLabelText("Email address"), "ama@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(onSignUp).toHaveBeenCalledWith({ name: "Ama Mensah", phone: "0241234567", email: "ama@example.com", password: "correct horse" });
});

test("puts field errors under the right inputs and reports edits", async () => {
  const onFieldChange = jest.fn();
  render(<SignUpPage onSignUp={jest.fn()} fieldErrors={{ email: "Enter a valid email address." }} onFieldChange={onFieldChange} />);
  expect(screen.getByLabelText("Email address")).toHaveAccessibleDescription("Enter a valid email address.");
  expect(screen.getByLabelText("Full name")).not.toHaveAttribute("aria-invalid");
  await userEvent.type(screen.getByLabelText("Email address"), "a");
  expect(onFieldChange).toHaveBeenCalledWith("email");
});

test("Google appears only when handled; log in link works", async () => {
  const onSignIn = jest.fn();
  const { rerender } = render(<SignUpPage onSignUp={jest.fn()} onSignInInstead={onSignIn} />);
  expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  expect(onSignIn).toHaveBeenCalled();
  rerender(<SignUpPage onSignUp={jest.fn()} onGoogleSignIn={jest.fn()} />);
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
});

test("shows the form error and a busy button", () => {
  render(<SignUpPage onSignUp={jest.fn()} error="An account with that email already exists. Log in instead." busy />);
  expect(screen.getByRole("alert")).toHaveTextContent("already exists");
  expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
});
