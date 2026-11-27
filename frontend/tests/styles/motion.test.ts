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

const parts = readFileSync(join(SRC, "landing/parts.tsx"), "utf8");

test("photos pop out on hover, and only move when the device allows motion", () => {
  const pop = parts.match(/photoPop =\s*"([^"]+)"/)![1];
  const zoom = parts.match(/photoZoom = "([^"]+)"/)![1];
  expect(pop).toContain("motion-safe:hover:scale-[1.03]");
  expect(pop).toContain("hover:shadow-xl");
  expect(zoom).toContain("motion-safe:group-hover/photo:scale-105");
  for (const c of `${pop} ${zoom}`.split(/\s+/).filter((c) => /translate|scale/.test(c))) expect(c).toMatch(/^motion-safe:/);
});

test("scroll reveal uses translate, comes in from the sides, and is off for reduced motion", () => {
  expect(globals).toMatch(/\.reveal-left\[data-visible="false"\] \{ translate: -72px 0; \}/);
  expect(globals).toMatch(/\.reveal-right\[data-visible="false"\] \{ translate: 72px 0; \}/);
  const reduced = globals.slice(globals.indexOf(".reveal, .reveal[data-visible"));
  expect(reduced).toMatch(/opacity: 1;\s*translate: none;\s*transition: none;/);
});

test("sans-serif only, and glass and gradients only from the shared glass layer (DESIGN.md → Glass)", () => {
  const offenders = sourceFiles(SRC).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => /font-serif|Cormorant|bg-gradient|bg-linear|bg-radial|backdrop-blur|backdrop-filter/.test(line))
      .map((line) => `${file}: ${line.trim()}`),
  );
  expect(offenders).toEqual([]);
  const start = globals.indexOf("/* glass:start");
  const end = globals.indexOf("/* glass:end */");
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const outside = globals.slice(0, start) + globals.slice(end) + components;
  expect(outside).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter/);
});

test("every glass surface falls back to a solid one", () => {
  const layer = globals.slice(globals.indexOf("/* glass:start"), globals.indexOf("/* glass:end */"));
  for (const query of ["@supports not ((backdrop-filter: blur(1px))", "@media (prefers-reduced-transparency: reduce)", "@media print", "@media (forced-colors: active)"]) {
    const block = layer.slice(layer.indexOf(query));
    expect(layer).toContain(query);
    expect(block).toMatch(/\.glass-panel,\s*\.glass-rail,\s*\.glass-chip\s*\{[^}]*background: (var\(--card\)|#ffffff|Canvas);/);
  }
});

test("the older stylesheet's variables never override the theme's", () => {
  const tokens = readFileSync(join(SRC, "styles/tokens.css"), "utf8");
  const names = (css: string) => new Set([...css.matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]));
  const theme = names(globals.slice(0, globals.indexOf("@theme inline")));
  expect([...names(tokens)].filter((n) => theme.has(n))).toEqual([]);
});

test("dark colours are the same for the device setting and the admin toggle", () => {
  for (const css of [globals, readFileSync(join(SRC, "styles/tokens.css"), "utf8")]) {
    const block = (start: string) => {
      const from = css.indexOf("{", css.indexOf(start)) + 1;
      return [...css.slice(from, css.indexOf("}", from)).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => `${m[1]}=${m[2]}`);
    };
    const device = block(':root:not([data-theme="light"])');
    expect(device.length).toBeGreaterThan(5);
    expect(block(':root[data-theme="dark"]')).toEqual(device);
  }
});
