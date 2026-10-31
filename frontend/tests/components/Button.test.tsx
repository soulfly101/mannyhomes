import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../../src/components";

test("defaults to a secondary, non-submitting button", () => {
  render(<Button>View rooms</Button>);
  const button = screen.getByRole("button", { name: "View rooms" });
  expect(button).toHaveClass("btn", "btn-secondary");
  expect(button).toHaveAttribute("type", "button");
});

test("applies the chosen variant", () => {
  render(<Button variant="primary">Book now</Button>);
  expect(screen.getByRole("button", { name: "Book now" })).toHaveClass("btn-primary");
});

test("calls onClick when not busy", () => {
  const onClick = jest.fn();
  render(<Button onClick={onClick}>Pay GH₵ 200</Button>);
  fireEvent.click(screen.getByRole("button"));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("while busy, shows please wait and ignores clicks", () => {
  const onClick = jest.fn();
  render(
    <Button busy onClick={onClick}>
      Pay GH₵ 200
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Please wait…" });
  expect(button).toHaveAttribute("aria-busy", "true");
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});
