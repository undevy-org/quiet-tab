import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
const [tokenCss, controlsCss, surfacesCss, newtabCss, designSystem, changelog] = await Promise.all([
  read("src/design-tokens.css"), read("src/controls.css"), read("src/surfaces.css"), read("src/newtab.css"),
  read("docs/design-system.md"), read("CHANGELOG.md")
]);

function token(scope, name) {
  const m = scope.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(m, name);
  return m[1].trim();
}
function rgba(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const fn = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*(\d+)%)?\s*\)$/);
  assert.ok(fn, value);
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4]) / 100];
}
const lum = ([r, g, b]) => { const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };

describe("placeholder color tokens (AS-PH-01)", () => {
  const light = tokenCss.slice(tokenCss.indexOf(":root {"), tokenCss.indexOf("@media (prefers-color-scheme: dark)"));
  const dark = tokenCss.slice(tokenCss.indexOf("@media (prefers-color-scheme: dark)"));
  for (const [label, scope] of [["light", light], ["dark", dark]]) {
    const muted = rgba(token(scope, "--color-text-muted"));
    for (const bgToken of ["--color-surface", "--color-fill-soft", "--color-fill-soft-strong"]) {
      it(`${label}: --color-text-muted on ${bgToken} reaches 4.5:1 (unrounded)`, () => {
        const panel = rgba(token(scope, "--color-surface")).slice(0, 3);
        const bg = over(rgba(token(scope, bgToken)), panel);
        const fg = over(muted, bg);
        const r = ratio(fg, bg);
        assert.ok(r >= 4.5, `${label} ${bgToken} ${r}`);
      });
    }
  }
  it("--muted stays an alias of --color-text-muted", () => {
    assert.match(tokenCss, /--muted:\s*var\(--color-text-muted\);/);
  });
});

describe("one ::placeholder rule, in controls.css (AS-PH-01, AS-PH-10)", () => {
  const rules = (css) => [...css.matchAll(/([^{}]*)::placeholder\s*\{([^}]*)\}/g)];
  it("controls.css has exactly one rule, on .favorite-input, with the muted color at opacity 1", () => {
    const found = rules(controlsCss);
    assert.equal(found.length, 1);
    assert.equal(found[0][1].trim(), ".favorite-input");
    assert.match(found[0][2], /color:\s*var\(--muted\);/);
    assert.match(found[0][2], /opacity:\s*1;/);
  });
  it("surfaces.css, newtab.css and the tokens file have none", () => {
    for (const [name, css] of [["surfaces.css", surfacesCss], ["newtab.css", newtabCss], ["design-tokens.css", tokenCss]]) {
      assert.equal(rules(css).length, 0, name);
    }
  });
});

describe("docs reflect the change (AS-PH-10)", () => {
  it("design-system.md lists the placeholder under .favorite-input and in the --color-text-muted row", () => {
    const section = designSystem.slice(designSystem.indexOf("### `.favorite-input`"));
    const body = section.slice(0, section.indexOf("\n### ", 5));
    assert.ok(body.includes("Placeholder: `var(--color-text-muted)`"), "placeholder line");
    assert.ok(body.includes("4.5:1"), "ratio");
    const row = designSystem.split("\n").find((l) => l.startsWith("| `--color-text-muted`"));
    assert.ok(row?.includes("field placeholder"), row);
  });
  it("the changelog has a Fixed entry under [Unreleased] naming the scenario", () => {
    const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"), changelog.indexOf("\n## [", 5) > 0 ? changelog.indexOf("\n## [", changelog.indexOf("## [Unreleased]") + 5) : undefined);
    assert.ok(unreleased.includes("### Fixed"));
    assert.ok(unreleased.includes("dg-50-placeholder-contrast.mjs"));
  });
});
