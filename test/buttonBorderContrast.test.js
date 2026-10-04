import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [tokenCss, controlsCss, surfacesCss, newtabCss, designSystem, borderDoc, changelog] = await Promise.all([
  read("src/design-tokens.css"), read("src/controls.css"), read("src/surfaces.css"), read("src/newtab.css"),
  read("docs/design-system.md"), read("docs/border-contrast.md"), read("CHANGELOG.md")
]);
const sources = { "controls.css": controlsCss, "surfaces.css": surfacesCss, "newtab.css": newtabCss };

function token(scope, name) {
  const m = scope.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(m, `${name} is declared`);
  return m[1].trim();
}
function rgb(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  assert.ok(hex, value);
  return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
}
const lum = ([r, g, b]) => { const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
const stripped = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
function rules(css) {
  return [...stripped(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
}
const decl = (rule, prop) => rule.body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+)`))?.[1].trim().replace(/\s+/g, " ");

const light = tokenCss.slice(tokenCss.indexOf(":root {"), tokenCss.indexOf("@media (prefers-color-scheme: dark)"));
const dark = tokenCss.slice(tokenCss.indexOf("@media (prefers-color-scheme: dark)"));

describe("AS-BB-01: .button draws its border with the control token; variants keep theirs", () => {
  const controlRules = rules(controlsCss);
  const button = controlRules.find((r) => r.selector === ".button");
  it(".button border is var(--control-border-width) solid var(--border-control)", () => {
    assert.ok(button, ".button rule");
    assert.equal(decl(button, "border"), "var(--control-border-width) solid var(--border-control)");
  });
  it(".button--primary and .button--danger keep their own border colors", () => {
    assert.equal(decl(controlRules.find((r) => r.selector === ".button--primary"), "border-color"), "var(--primary)");
    assert.equal(decl(controlRules.find((r) => r.selector === ".button--danger"), "border-color"), "var(--danger)");
  });
  it(".button--danger is declared after .button", () => {
    const order = controlRules.map((r) => r.selector);
    assert.ok(order.indexOf(".button--danger") > order.indexOf(".button"));
  });
  it("no .button rule in surfaces.css or newtab.css changes the border color", () => {
    for (const [file, css] of [["surfaces.css", surfacesCss], ["newtab.css", newtabCss]]) {
      const offenders = rules(css)
        .filter((r) => /(^|[\s,>])\.button(?![\w-])|\.button--/.test(r.selector) && /(^|[;\s])border(-color)?:/.test(r.body))
        .map((r) => `${file}: ${r.selector}`);
      assert.deepEqual(offenders, []);
    }
  });
  for (const [label, scope, oldBorder] of [["light", light, "#d8dee6"], ["dark", dark, "#343b45"]]) {
    it(`${label}: --color-border-control and --color-danger clear 3:1 against the panel (unrounded)`, () => {
      const panel = rgb(token(scope, "--color-surface"));
      for (const name of ["--color-border-control", "--color-danger"]) {
        const r = ratio(rgb(token(scope, name)), panel);
        assert.ok(r >= 3, `${name} ${r.toFixed(3)}`);
      }
    });
    it(`${label}: --color-border keeps its decorative value`, () => {
      assert.equal(token(scope, "--color-border"), oldBorder);
    });
  }
});

describe("AS-BB-04: hover and focus rules are untouched, no :active rule", () => {
  it("there is no .button:active rule anywhere", () => {
    for (const [file, css] of Object.entries(sources)) {
      assert.doesNotMatch(stripped(css), /\.button[^{}]*:active/, file);
    }
  });
  it(".button:hover:not(:disabled) still gives var(--primary)", () => {
    const hover = rules(controlsCss).find((r) => r.selector === ".button:hover:not(:disabled)");
    assert.equal(decl(hover, "border-color"), "var(--primary)");
  });
});

describe("AS-BB-10: docs and changelog reflect the change", () => {
  const section = (heading) => {
    const start = designSystem.indexOf(heading);
    assert.ok(start >= 0, heading);
    const next = designSystem.indexOf("\n### ", start + heading.length);
    return designSystem.slice(start, next < 0 ? undefined : next);
  };
  it("design-system.md ### .button uses var(--color-border-control), no bare var(--color-border)", () => {
    const s = section("### `.button`");
    assert.match(s, /var\(--color-border-control\)/);
    assert.doesNotMatch(s, /var\(--color-border\)/);
  });
  it("the --color-border-control row names button", () => {
    const row = designSystem.split("\n").find((l) => l.startsWith("| `--color-border-control`"));
    assert.ok(row, "row");
    assert.match(row, /button/i);
  });
  it('"Two border roles" lists buttons and no longer says "no fill or label"', () => {
    const start = designSystem.indexOf("**Two border roles.**");
    assert.ok(start >= 0);
    const para = designSystem.slice(start, designSystem.indexOf("\n\n", start));
    assert.match(para, /button/i);
    assert.doesNotMatch(para, /no fill or label/);
  });
  it("neither doc keeps the stale phrases", () => {
    for (const [name, text] of [["design-system.md", designSystem], ["border-contrast.md", borderDoc]]) {
      assert.doesNotMatch(text, /\(has a text label\)/, name);
      assert.doesNotMatch(text, /no fill or label/, name);
    }
  });
  it("border-contrast.md counts six control-boundary surfaces and points to the button spec", () => {
    assert.doesNotMatch(borderDoc, /\bfive\b/i);
    assert.match(borderDoc, /\bsix-surface\b/);
    assert.match(borderDoc, /\bsix\b/);
    assert.match(borderDoc, /docs\/button-border-contrast\.md/);
  });
  it("test/borderContrast.test.js lists .button among the control-boundary rules, six of them", async () => {
    const src = await read("test/borderContrast.test.js");
    assert.match(src, /only the six control-boundary rules/);
    assert.match(src, /"\.button"/);
    assert.doesNotMatch(src, /\bfive\b/i);
  });
  it("CHANGELOG [Unreleased] has a Changed entry for the secondary-button outline, with the E2E name", () => {
    const start = changelog.indexOf("## [Unreleased]");
    const end = changelog.indexOf("\n## [", start + 1);
    const block = changelog.slice(start, end < 0 ? undefined : end);
    const changed = block.slice(block.indexOf("### Changed"));
    assert.ok(block.includes("### Changed"));
    assert.match(changed, /Cancel/);
    assert.match(changed, /dg-51-button-border-contrast\.mjs/);
  });
});
