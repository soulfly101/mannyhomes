import { render, screen } from "@testing-library/react";
import { Field } from "../../src/components";

test("the input is reachable by its label", () => {
  render(<Field label="MoMo number" placeholder="024 123 4567" />);
  expect(screen.getByLabelText("MoMo number")).toHaveAttribute("placeholder", "024 123 4567");
});

test("the hint describes the input", () => {
  render(<Field label="MoMo number" hint="You'll get a prompt on this phone." />);
  expect(screen.getByLabelText("MoMo number")).toHaveAccessibleDescription("You'll get a prompt on this phone.");
});

test("an error is announced, marks the input invalid and describes it", () => {
  render(<Field label="MoMo number" error="Enter a 10-digit MoMo number." />);
  const input = screen.getByLabelText("MoMo number");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Enter a 10-digit MoMo number.");
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a 10-digit MoMo number.");
});

test("without an error the input is not marked invalid", () => {
  render(<Field label="Name" />);
  expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
});

test("a prefix is shown before the value but not read out as part of the label", () => {
  render(<Field label="Rent per month" prefix="GH₵" defaultValue="1200" />);
  const input = screen.getByLabelText("Rent per month");
  expect(input).toHaveValue("1200");
  expect(screen.getByText("GH₵")).toHaveAttribute("aria-hidden", "true");
});
