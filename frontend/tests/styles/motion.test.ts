// Site-wide rule: everything clickable lifts on hover and presses in when clicked (DESIGN.md → Motion).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "../../src");
const globals = readFileSync(join(SRC, "styles/globals.css"), "utf8");
const components = readFileSync(join(SRC, "styles/components.css"), "utf8");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

test("every kind of clickable element gets the hover lift and press, only when motion is allowed", () => {
  const block = globals.slice(globals.indexOf("@media (prefers-reduced-motion: no-preference)"));
  expect(block).not.toBe(globals);
  for (const selector of ['a[href]', "button", '[role="button"]', '[role="tab"]', "summary", 'input[type="submit"]']) {
    expect(block).toContain(selector);
  }
  expect(block).toMatch(/:hover\s*{\s*translate: 0 -2px;/);
  expect(block).toMatch(/:active\s*{\s*translate: 0 0;\s*scale: 0\.97;/);
  // Disabled and busy buttons stay still.
  expect(block).toContain(':not(:disabled, [aria-disabled="true"], [aria-busy="true"])');
});

test("clickable elements animate translate and scale so the movement glides", () => {
  expect(globals).toMatch(/transition-property:[^;]*\btranslate\b[^;]*\bscale\b/);
  expect(components).toMatch(/\.btn \{[^}]*transition:[^;]*translate[^;]*scale/);
});

test("only the text-field frame uses transition-colors (it would stop clickable things from gliding)", () => {
  const offenders = sourceFiles(SRC).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.includes("transition-colors") && !line.includes("focus-within:border-primary"))
      .map((line) => `${file}: ${line.trim()}`),
  );
  expect(offenders).toEqual([]);
});
