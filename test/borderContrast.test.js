import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const tokenCss = await read("../src/design-tokens.css");
const sources = {
  "controls.css": await read("../src/controls.css"),
  "surfaces.css": await read("../src/surfaces.css"),
  "newtab.css": await read("../src/newtab.css"),
};
const designSystem = await read("../docs/design-system.md");

function token(scope, name) {
  const m = scope.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(m, `${name} is declared`);
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

const light = tokenCss.slice(tokenCss.indexOf(":root {"), tokenCss.indexOf("@media (prefers-color-scheme: dark)"));
const dark = tokenCss.slice(tokenCss.indexOf("@media (prefers-color-scheme: dark)"));

describe("AS-CT-01: --color-border-control clears 3:1 in both themes", () => {
  for (const [label, scope, oldBorder] of [["light", light, "#d8dee6"], ["dark", dark, "#343b45"]]) {
    const declared = () => rgba(token(scope, "--color-border-control")).slice(0, 3);
    it(`${label}: against the panel and the page (unrounded)`, () => {
      for (const name of ["--color-surface", "--color-bg"]) {
        const r = ratio(declared(), rgba(token(scope, name)).slice(0, 3));
        assert.ok(r >= 3, `${name} ${r.toFixed(3)}`);
      }
    });
    it(`${label}: --color-border keeps its decorative value`, () => {
      assert.equal(token(scope, "--color-border"), oldBorder);
    });
    it(`${label}: the soft ring clears 3:1 on the focused field fill (--color-fill-soft)`, () => {
      const fill = rgba(token(scope, "--color-fill-soft")).slice(0, 3);
      const ring = rgba(token(scope, "--soft-ring"));
      const panel = rgba(token(scope, "--color-surface")).slice(0, 3);
      // The ring is drawn outside the field, so it sits on the panel and on the fill-soft focused background.
      assert.ok(ratio(over(ring, fill), fill) >= 3, `fill ${ratio(over(ring, fill), fill).toFixed(2)}`);
      assert.ok(ratio(over(ring, panel), panel) >= 3, `panel ${ratio(over(ring, panel), panel).toFixed(2)}`);
    });
  }
  it("--border-control is an alias of the token", () => {
    assert.equal(token(light, "--border-control"), "var(--color-border-control)");
  });
});

function rules(css) {
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] });
  }
  return out;
}

describe("AS-CT-05: only the six control-boundary rules use --border-control", () => {
  const six = [".chrome-tile", ".city-hint-tile", ".favorite-input", ".favorite-color-input", ".segmented", ".button"];
  const all = Object.entries(sources).flatMap(([file, css]) => rules(css).map((r) => ({ ...r, file })));
  const borderDecl = (r) => r.body.match(/(?:^|[;\s])border(?:-color)?:[^;]*/)?.[0] ?? "";
  for (const selector of six) {
    it(`${selector} draws its border with var(--border-control)`, () => {
      const rule = all.find((r) => r.selector === selector && /(?:^|[;\s])border:/.test(r.body));
      assert.ok(rule, selector);
      assert.match(borderDecl(rule), /var\(--border-control\)/);
    });
  }
  it("no other rule in controls.css, surfaces.css or newtab.css uses it", () => {
    const users = all.filter((r) => /var\(--border-control\)/.test(r.body)).map((r) => r.selector);
    // A hover STATE of the weather retry tile (docs/weather-tile-retry.md decision 2) is not a control boundary rule.
    const hoverStates = ['.weather-tile--retry[data-retry="ready"]:hover'];
    // docs/modal-overlay-design.md: the city-field is a bordered control (Direction D); the selected dialog segment draws an inset 1px ring.
    const modalOverlay = [
      ".city-field",
      ".desktop-dialog .segmented__option:has(input:checked)",
      ".onboarding-wizard__pill--active",
      ".onboarding-wizard__starter-check"
    ];
    assert.deepEqual(users.filter((s) => !six.includes(s) && !hoverStates.includes(s) && !modalOverlay.includes(s)), []);
  });
  it(".segmented__option keeps the decorative divider", () => {
    const option = all.find((r) => r.selector === ".segmented__option");
    assert.match(option.body, /border-right:[^;]*var\(--border\)/);
  });
});

describe("AS-OSR-04: the starter row stays readable when it is off", () => {
  for (const [label, scope] of [["light", light], ["dark", dark]]) {
    const rgb = (name) => rgba(token(scope, name)).slice(0, 3);
    it(`${label}: --color-text-muted on --color-surface is at least 4.5:1 (the off label)`, () => {
      const r = ratio(rgb("--color-text-muted"), rgb("--color-surface"));
      assert.ok(r >= 4.5, r.toFixed(3));
    });
    it(`${label}: --color-border-control on --color-surface is at least 3:1 (the check border)`, () => {
      const r = ratio(rgb("--color-border-control"), rgb("--color-surface"));
      assert.ok(r >= 3, r.toFixed(3));
    });
    it(`${label}: --focus-ring on --color-surface is at least 3:1 (the row focus ring)`, () => {
      const r = ratio(rgb("--focus-ring"), rgb("--color-surface"));
      assert.ok(r >= 3, r.toFixed(3));
    });
  }
  it("the check draws its border with var(--border-control)", () => {
    const all = rules(sources["surfaces.css"]);
    const checks = all.filter((r) => r.selector === ".onboarding-wizard__starter-check");
    assert.ok(checks.length > 0, "the check has a rule");
    assert.ok(checks.some((r) => /(?:^|[;\s])border:[^;]*var\(--border-control\)/.test(r.body)));
  });
});

describe("AS-CT-06: docs name the token", () => {
  const section = (heading) => {
    const start = designSystem.indexOf(heading);
    assert.ok(start >= 0, heading);
    const next = designSystem.indexOf("\n### ", start + heading.length);
    return designSystem.slice(start, next < 0 ? undefined : next);
  };
  it("design-system.md lists --color-border-control", () => {
    assert.match(designSystem, /--color-border-control/);
  });
  for (const heading of ["### `.favorite-input`", "### `.segmented` / `.segmented__option`", "### `.favorite-color-input`"]) {
    it(`${heading} does not use a bare --color-border`, () => {
      assert.doesNotMatch(section(heading).replace(/--color-border-control/g, ""), /--color-border\b/);
    });
  }
  it("the Components lines for those three name the control token", () => {
    for (const heading of ["### `.favorite-input`", "### `.segmented` / `.segmented__option`", "### `.favorite-color-input`"]) {
      assert.match(section(heading), /--color-border-control/, heading);
    }
  });
});

describe("AS-SRP-02/03 starter rows polish contrast", () => {
  // The letter icon is faded by the `opacity` of its unchecked rule (docs/starter-rows-polish.md decision 2): read it from the CSS.
  const letterOpacity = () => {
    const sel = '.onboarding-wizard__starter input[type="checkbox"]:not(:checked) + .onboarding-wizard__starter-surface .onboarding-wizard__starter-icon--letter';
    const found = rules(sources["surfaces.css"]).filter((r) => r.selector === sel);
    assert.equal(found.length, 1, `exactly one rule with selector ${sel} expected in surfaces.css, found ${found.length}`);
    const rule = found[0];
    const m = rule.body.match(/(?:^|[;\s])opacity:\s*([0-9.]+)\s*;/);
    assert.ok(m, `letter opacity rule has no numeric opacity: ${rule.body.trim()}`);
    return Number(m[1]);
  };
  // Glyph and chip are one element faded as a group: both are mixed with the backdrop at alpha.
  const letterRatio = (glyph, chip, backdrop, alpha) => ratio(over([...glyph, alpha], backdrop), over([...chip, alpha], backdrop));
  for (const [label, scope] of [["light", light], ["dark", dark]]) {
    const rgb = (name) => rgba(token(scope, name)).slice(0, 3);
    it(`${label}: --color-text and --color-text-muted on --color-fill-soft are at least 4.5:1 (the hovered label)`, () => {
      for (const name of ["--color-text", "--color-text-muted"]) {
        const r = ratio(rgb(name), rgb("--color-fill-soft"));
        assert.ok(r >= 4.5, `${name} ${r.toFixed(3)}`);
      }
    });
    it(`${label}: --color-border-control on --color-surface is at least 3:1 (the empty check on its own fill)`, () => {
      const r = ratio(rgb("--color-border-control"), rgb("--color-surface"));
      assert.ok(r >= 3, r.toFixed(3));
    });
    it(`${label}: the letter glyph over its chip at the CSS opacity is at least 3:1 on the panel`, () => {
      const alpha = letterOpacity();
      const r = letterRatio(rgb("--color-text"), rgb("--color-fill-soft"), rgb("--color-surface"), alpha);
      assert.ok(r >= 3, `alpha ${alpha}: ${r.toFixed(3)}`);
    });
    it(`${label}: the letter glyph over the hovered chip (--color-fill-soft-strong) at the CSS opacity is at least 3:1`, () => {
      const alpha = letterOpacity();
      for (const backdrop of ["--color-fill-soft", "--color-surface"]) {
        const r = letterRatio(rgb("--color-text"), rgb("--color-fill-soft-strong"), rgb(backdrop), alpha);
        assert.ok(r >= 3, `alpha ${alpha} on ${backdrop}: ${r.toFixed(3)}`);
      }
    });
  }
  it("forced colors: CanvasText over a Canvas chip at the CSS opacity is at least 3:1 (black on white and white on black)", () => {
    const alpha = letterOpacity();
    const white = [255, 255, 255];
    const black = [0, 0, 0];
    for (const [text, canvas] of [[black, white], [white, black]]) {
      const r = letterRatio(text, canvas, canvas, alpha);
      assert.ok(r >= 3, `alpha ${alpha} on rgb(${canvas}): ${r.toFixed(3)}`);
    }
  });
  it("doc: alpha 0.4 stays below 3:1 in the light theme (documents why the letter is not faded like the favicon)", () => {
    const rgb = (name) => rgba(token(light, name)).slice(0, 3);
    const r = letterRatio(rgb("--color-text"), rgb("--color-fill-soft"), rgb("--color-surface"), 0.4);
    assert.ok(r < 3, r.toFixed(3));
  });
});

describe("AS-ICB-01 icon backdrop", () => {
  const OFF = '.onboarding-wizard__starter input[type="checkbox"]:not(:checked) + .onboarding-wizard__starter-surface';
  const IMG_OFF = `${OFF} img.onboarding-wizard__starter-icon`;
  const LETTER_OFF = `${OFF} .onboarding-wizard__starter-icon--letter`;
  // The favicon img is faded only by the `opacity` of its unchecked rule (0.4 today). Every starter rule with an `opacity` (except the hidden native input,
  // the letter and the busy surface, which are not the favicon's own fade) is collected: the set must be exactly that one rule, so a late override or a base
  // opacity on the img cannot go unnoticed and a checked row is really at alpha 1.
  const faviconOpacity = () => {
    const OTHER = [LETTER_OFF, '.onboarding-wizard__starter input[type="checkbox"]', `.onboarding-wizard__starter input[type="checkbox"]:disabled + .onboarding-wizard__starter-surface`];
    const found = rules(sources["surfaces.css"]).flatMap((r) => r.selector.split(",").map((s) => ({ selector: s.trim(), body: r.body }))).filter((r) => r.selector.includes("onboarding-wizard__starter") && /(?:^|[;\s])opacity:/.test(r.body) && !OTHER.includes(r.selector));
    assert.deepEqual(found.map((r) => r.selector), [IMG_OFF], `the only opacity rule that can reach the favicon img is ${IMG_OFF}`);
    const m = found[0].body.match(/(?:^|[;\s])opacity:\s*([0-9.]+)\s*;/);
    assert.ok(m, `no numeric opacity in the rule for ${IMG_OFF}`);
    return Number(m[1]);
  };
  const glyphOverBackdrop = (backdrop, panel, alpha) => ratio(over([0, 0, 0, alpha], panel), over([...backdrop, alpha], panel));
  const panel = () => rgba(token(dark, "--color-surface")).slice(0, 3);
  const backdrop = () => rgba(token(dark, "--icon-backdrop")).slice(0, 3);

  it("light: --icon-backdrop is the keyword transparent (rgba() does not parse it, asserted as a string)", () => {
    assert.equal(token(light, "--icon-backdrop"), "transparent");
  });
  it("dark: --icon-backdrop is #eef1f5, read from the dark token slice", () => {
    assert.equal(token(dark, "--icon-backdrop"), "#eef1f5");
  });
  it("dark: a black glyph over the backdrop, both blended with --panel at the unchecked favicon opacity, is at least 3:1", () => {
    const alpha = faviconOpacity();
    const r = glyphOverBackdrop(backdrop(), panel(), alpha);
    assert.ok(r >= 3, `alpha ${alpha}: ${r.toFixed(3)}`);
  });
  it("dark: a black glyph over the backdrop in a checked row (alpha 1) is at least 10:1", () => {
    faviconOpacity(); // fails if any opacity rule other than the unchecked one can reach the img, so alpha 1 for a checked row holds
    const r = glyphOverBackdrop(backdrop(), panel(), 1);
    assert.ok(r >= 10, r.toFixed(3));
  });
});

describe("AS-FBO-06 icon outline: a quiet ring that still defines a black favicon plate", () => {
  const panel = () => rgba(token(dark, "--color-surface")).slice(0, 3);
  const ring = () => rgba(token(dark, "--icon-outline")).slice(0, 3);
  it("light: --icon-outline is the keyword transparent (asserted as a string, rgba() does not parse it)", () => {
    assert.equal(token(light, "--icon-outline"), "transparent");
  });
  it("dark: --icon-outline is #3d4652, read from the dark token slice", () => {
    assert.equal(token(dark, "--icon-outline"), "#3d4652");
  });
  it("dark: the ring against the panel is quiet: between 1.5:1 and 2.0:1 (computed 1.67)", () => {
    const r = ratio(ring(), panel());
    assert.ok(r >= 1.5 && r <= 2.0, r.toFixed(3));
  });
  it("dark: the ring against a black plate is at least 2.0:1 (computed 2.20), so it defines the plate", () => {
    const r = ratio(ring(), [0, 0, 0]);
    assert.ok(r >= 2.0, r.toFixed(3));
  });
});
