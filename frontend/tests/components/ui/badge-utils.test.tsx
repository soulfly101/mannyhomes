import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

test("cn joins classes and later Tailwind classes win", () => {
  expect(cn("px-2 text-sm", false && "hidden", "px-4")).toBe("text-sm px-4");
});

test.each([
  ["success", "text-success"],
  ["danger", "text-destructive"],
  ["neutral", "text-secondary-foreground"],
] as const)("Badge %s tone", (tone, cls) => {
  render(<Badge tone={tone}>Label</Badge>);
  const badge = screen.getByText("Label");
  expect(badge).toHaveAttribute("data-tone", tone);
  expect(badge).toHaveClass(cls);
});
