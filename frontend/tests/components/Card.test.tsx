import { render, screen } from "@testing-library/react";
import { Card } from "../../src/components";

test("renders a glass card with extra classes", () => {
  render(<Card className="extra">Hello</Card>);
  expect(screen.getByText("Hello")).toHaveClass("glass", "card", "extra");
});

test("can render as a landmark element", () => {
  render(
    <Card as="section" aria-label="System status">
      Body
    </Card>,
  );
  expect(screen.getByRole("region", { name: "System status" })).toBeInTheDocument();
});
