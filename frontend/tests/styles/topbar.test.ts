import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "../../src/styles/components.css"), "utf8");

test("on phones the admin sections wrap to their own scrollable row, so Log out stays on screen", () => {
  const phones = css.slice(css.indexOf("@media (max-width: 640px)"));
  expect(phones).toMatch(/\.topbar \{[^}]*flex-wrap: wrap/);
  expect(phones).toMatch(/\.topbar-nav \{[^}]*order: 3;[^}]*flex: 1 0 100%;[^}]*overflow-x: auto/);
});
