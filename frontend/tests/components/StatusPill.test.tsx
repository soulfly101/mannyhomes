import { render, screen } from "@testing-library/react";
import { StatusPill, toneFor } from "../../src/components";

test.each([
  ["Paid", "ok"],
  ["Partial", "warn"],
  ["Unpaid", "danger"],
  ["Awaiting allocation", "warn"],
  ["Fully booked", "danger"],
  ["Resolved", "ok"],
  ["Closed", "neutral"],
])("%s uses the %s tone", (status, tone) => {
  expect(toneFor(status)).toBe(tone);
});

test("matching ignores case and surrounding spaces", () => {
  expect(toneFor("  in PROGRESS ")).toBe("warn");
});

test("unknown statuses fall back to neutral", () => {
  expect(toneFor("Something new")).toBe("neutral");
});

test("renders the status word with its tone class", () => {
  render(<StatusPill status="Unpaid" />);
  expect(screen.getByText("Unpaid")).toHaveClass("pill", "pill-danger");
});

test("a custom label and tone can be given", () => {
  render(<StatusPill status="available" label="3 free" />);
  expect(screen.getByText("3 free")).toHaveClass("pill-ok");
  render(<StatusPill status="x" tone="warn" label="Due soon" />);
  expect(screen.getByText("Due soon")).toHaveClass("pill-warn");
});
