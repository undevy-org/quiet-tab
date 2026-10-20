import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("design system wiring", () => {
  it("loads stylesheets in token → control → surface → app order", async () => {
    const html = await readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
    const hrefs = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, ["design-tokens.css", "controls.css", "surfaces.css", "newtab.css"]);
  });

  it("defines core control tokens", async () => {
    const css = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    assert.match(css, /--control-height:\s*40px;/);
    assert.match(css, /--radius-control:\s*8px;/);
    assert.match(css, /--title-margin-bottom:\s*12px;/);
    assert.match(css, /--control-disabled-opacity:\s*0\.62;/);
  });
});

describe("grid / page chrome tokens (AS-DS-16)", () => {
  it("declares Phase 2 grid and page chrome tokens in design-tokens.css", async () => {
    const css = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    assert.match(css, /--radius-tile:\s*13px;/);
    assert.match(css, /--radius-drop-highlight:\s*14px;/);
    assert.match(css, /--radius-status-chip:\s*10px;/);
    assert.match(css, /--shadow-status:\s*var\(--shadow-popover\);/);
    assert.match(css, /--status-chip-padding-y:\s*10px;/);
    assert.match(css, /--status-chip-padding-x:\s*14px;/);
    assert.match(css, /--status-chip-offset-bottom:\s*16px;/);
    assert.match(css, /--tile-remove-size:\s*24px;/);
    assert.match(css, /--tile-remove-offset:\s*8px;/);
    assert.match(css, /--font-size-weather-primary-cell-64:\s*16px;/);
    assert.match(css, /--font-size-weather-secondary-cell-64:\s*10px;/);
    assert.match(css, /--font-size-weather-primary-cell-56:\s*14px;/);
    assert.match(css, /--font-size-weather-secondary-cell-56:\s*9px;/);
    assert.match(css, /--line-height-page:\s*1\.45;/);
    assert.match(css, /--space-grid-8:\s*8px;/);
    assert.match(css, /--space-grid-10:\s*10px;/);
    assert.match(css, /--space-grid-12:\s*12px;/);
  });
});

describe("newtab.css typography tokens (AS-DS-15)", () => {
  it("uses design tokens on body, status, and tooltip", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /body \{[^}]*font-family:\s*var\(--font-family\)/s);
    assert.match(css, /body \{[^}]*line-height:\s*var\(--line-height-page\)/s);
    assert.match(css, /\.status \{[^}]*font-size:\s*var\(--font-size-md\)/s);
    assert.match(css, /\.status \{[^}]*line-height:\s*var\(--line-height-body\)/s);
    assert.match(css, /\.desktop-status \{[^}]*font-size:\s*var\(--font-size-md\)/s);
    assert.match(css, /\.desktop-status \{[^}]*line-height:\s*var\(--line-height-body\)/s);
    assert.match(css, /\.tooltip \{[^}]*font-size:\s*var\(--font-size-sm\)/s);
  });
});

describe("newtab.css grid chrome tokens (AS-DS-17)", () => {
  it("uses Phase 2 tokens for radii, shadows, status chip, spacing, and remove badge", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.favorite-tile \{[^}]*border-radius:\s*var\(--radius-tile\)/s);
    assert.match(css, /\.chrome-tile \{[^}]*border-radius:\s*var\(--radius-tile\)/s);
    assert.match(css, /\.weather-tile \{[^}]*border-radius:\s*var\(--radius-tile\)/s);
    assert.match(css, /\.city-hint-tile \{[^}]*border-radius:\s*var\(--radius-tile\)/s);
    assert.match(css, /\.desktop-grid > \.drop-highlight \{[^}]*border-radius:\s*var\(--radius-drop-highlight\)/s);
    assert.match(css, /\.desktop-status \{[^}]*border-radius:\s*var\(--radius-status-chip\)/s);
    assert.match(css, /\.desktop-status \{[^}]*box-shadow:\s*var\(--shadow-status\)/s);
    assert.match(css, /\.desktop-status \{[^}]*padding:\s*var\(--status-chip-padding-y\) var\(--status-chip-padding-x\)/s);
    assert.match(css, /\.desktop-status \{[^}]*bottom:\s*var\(--status-chip-offset-bottom\)/s);
    assert.match(css, /\.tooltip \{[^}]*border-radius:\s*var\(--radius-control\)/s);
    assert.match(css, /\.tooltip \{[^}]*box-shadow:\s*var\(--shadow-tooltip\)/s);
    assert.match(css, /\.desktop-grid > \.tile-remove \{[^}]*width:\s*var\(--tile-remove-size\)/s);
    assert.match(css, /\.desktop-grid > \.tile-remove \{[^}]*height:\s*var\(--tile-remove-size\)/s);
    assert.match(css, /\.desktop-grid > \.tile-remove \{[^}]*- var\(--tile-remove-offset\)/s);
    assert.doesNotMatch(css, /border-radius:\s*13px/);
    assert.doesNotMatch(css, /border-radius:\s*14px/);
    assert.doesNotMatch(css, /\.desktop-status \{[^}]*padding:\s*10px 14px/s);
    assert.doesNotMatch(css, /\.desktop-status \{[^}]*bottom:\s*16px/s);
    assert.doesNotMatch(css, /\.desktop-status \{[^}]*box-shadow:\s*0 12px 32px/s);
    assert.doesNotMatch(css, /\.tooltip \{[^}]*box-shadow:\s*0 18px 50px/s);
  });
});

describe("overlay control CSS (AS-DS-10)", () => {
  it("uses control-height tokens and forbids legacy magic heights in controls.css", async () => {
    // declarations only: a comment such as "min-height, not height: ..." must not trip the pins below
    const css = (await readFile(new URL("../src/controls.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(css, /min-height:\s*var\(--control-height\)/);
    // run 49 (docs/typography-copy.md decision 3): the option grows with a wrapped label, so it has `min-height`, not `height`.
    // `height:` alone also matches inside `min-height:`, so the pins carry a left guard `(?<![-\w])`.
    assert.match(css, /(?<![-\w])min-height:\s*calc\(var\(--control-height\) - 2 \* var\(--control-border-width\)\)/);
    assert.match(css, /\.segmented__option \{[^}]*(?<![-\w])min-height:\s*calc\(var\(--control-height\) - 2 \* var\(--control-border-width\)\)/s);
    assert.doesNotMatch(css, /\.segmented__option \{[^}]*(?<![-\w])height\s*:/s, ".segmented__option has no standalone height (neither height: 38px nor height: calc(...) beside the min-height)");
    assert.doesNotMatch(css, /height:\s*34px/);
    assert.doesNotMatch(css, /min-height:\s*44px/);
    assert.doesNotMatch(css, /\.add-menu__item[^}]*min-height:\s*36px/);
  });

  it("declares .button--danger after .button so the modifier wins the equal-specificity cascade", async () => {
    const css = await readFile(new URL("../src/controls.css", import.meta.url), "utf8");
    const base = css.search(/^\.button \{/m);
    const danger = css.search(/^\.button--danger \{/m);
    assert.ok(base > -1 && danger > base, `.button at ${base}, .button--danger at ${danger}`);
    assert.match(css.slice(danger, css.indexOf("}", danger)), /border-color: var\(--danger\);\s*color: var\(--danger\);/);
  });

  it("keeps vertical padding on suggestion rows so a wrapped city name does not touch the row edges", async () => {
    const tokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    const css = await readFile(new URL("../src/controls.css", import.meta.url), "utf8");
    assert.match(tokens, /--list-row-padding-y:\s*8px;/);
    assert.match(css, /\.weather-form__suggestion \{[^}]*padding: var\(--list-row-padding-y\) var\(--control-padding-x\);/s);
  });

  it("modal titles use title-margin-bottom token in surfaces.css", async () => {
    const css = await readFile(new URL("../src/surfaces.css", import.meta.url), "utf8");
    assert.match(css, /\.desktop-dialog__title\s*\{[^}]*margin:\s*0 0 var\(--title-margin-bottom\)/s);
    assert.match(css, /\.city-modal__title\s*\{[^}]*margin:\s*0 0 var\(--title-margin-bottom\)/s);
  });
});

// Run 49 (docs/typography-copy.md decisions 1 and 2, AS-TYP-01, AS-TYP-02): overlay text is 14 px at the default font size and
// follows the browser's font size (rem); tiles and the cell stay in px. The pins that `body` takes `var(--font-size-md)` and that `html` sets
// no size live in test/newtabSource.test.js (one place, as the spec gives it); the `.segmented__option` min-height pins are the rewritten ones
// of AS-DS-10 above.
describe("typography tokens in rem and the 14 px body (run 49)", () => {
  const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
  // Every declaration that sets a text size, in whatever form: `font-size`, a `--font-size-*` custom property, and the `font` shorthand
  // (its size is the token before an optional /line-height). The last declaration of a rule may have no `;`.
  const fontSizeDeclarations = (css) => {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const out = [];
    for (const m of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim().replace(/\s+/g, " ");
      for (const d of m[2].matchAll(/(?:^|[;\s])(font-size|--font-size-[\w-]+|font)\s*:\s*([^;]*?)\s*(?:;|$)/gi)) out.push({ selector, property: d[1].toLowerCase(), value: d[2] });
    }
    return out;
  };
  // `15px`, `15px !important`, `calc(15px + 0px)`, `600 15px/1.2 system-ui` all hold a px length
  const usesPx = (value) => /\d\s*px\b/i.test(value);

  it("the px detector finds a size in every form it can be written in (so the tests below cannot be walked around)", () => {
    const sample = [
      ".last { color: red; font-size: 15px }", // no terminating semicolon
      ".important { font-size: 15px !important; }",
      ".calc { font-size: calc(15px + 0px); }",
      ".shorthand { font: 600 15px/1.2 system-ui; }",
      ".custom { --font-size-big: 21px; }",
      ".upper { font-size: 15PX; }",
      ".upperprop { FONT-SIZE: 15px; }", // CSS property names are case-insensitive
      ".rem { font-size: 0.9rem; }",
      ".token { font-size: var(--font-size-md) }",
      ".inherit { font: inherit; }",
      "/* .comment { font-size: 99px; } */"
    ].join("\n");
    const found = fontSizeDeclarations(sample);
    assert.deepEqual(found.filter((d) => usesPx(d.value)).map((d) => d.selector), [".last", ".important", ".calc", ".shorthand", ".custom", ".upper", ".upperprop"]);
    assert.deepEqual(found.filter((d) => !usesPx(d.value)).map((d) => d.selector), [".rem", ".token", ".inherit"]);
  });

  it("declares the four overlay sizes in rem: xs 0.75, sm 0.8125, md 0.875, title 1.125 (12, 13, 14 and 18 px at 16 px)", async () => {
    const css = await read("design-tokens.css");
    assert.match(css, /--font-size-xs:\s*0\.75rem;/);
    assert.match(css, /--font-size-sm:\s*0\.8125rem;/);
    assert.match(css, /--font-size-md:\s*0\.875rem;/);
    assert.match(css, /--font-size-title:\s*1\.125rem;/);
    assert.doesNotMatch(css, /--font-size-(?:xs|sm|md|title):\s*[\d.]+px/);
  });

  it("no font size in design-tokens.css, controls.css or surfaces.css is in px, except the weather tile tokens and the starter icon letter", async () => {
    const px = [];
    for (const file of ["design-tokens.css", "controls.css", "surfaces.css"]) {
      for (const d of fontSizeDeclarations(await read(file))) {
        if (!usesPx(d.value)) continue;
        const weatherToken = file === "design-tokens.css" && /^--font-size-weather-/.test(d.property);
        const starterLetter = file === "surfaces.css" && d.selector === ".onboarding-wizard__starter-icon--letter";
        if (!weatherToken && !starterLetter) px.push(`${file}: ${d.selector} { ${d.property}: ${d.value} }`);
      }
    }
    assert.deepEqual(px, [], "overlay text follows the browser font size");
  });

  it("the two literal sizes of surfaces.css use tokens: the starter label --font-size-sm, the city field hint --font-size-xs", async () => {
    const css = await read("surfaces.css");
    assert.match(css, /\.onboarding-wizard__starter-label \{[^}]*font-size:\s*var\(--font-size-sm\);/s);
    assert.match(css, /\.city-field__hint \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  });

  it("the tooltip, the page status chip and the page-level error text size themselves with tokens only, so they scale with the font (Ruling of decision 2)", async () => {
    const rules = fontSizeDeclarations(await read("newtab.css")).filter((d) => d.property === "font-size");
    const sizeOf = (selector) => rules.filter((d) => d.selector.split(",").map((x) => x.trim()).includes(selector));
    for (const [selector, token] of [[".tooltip", "--font-size-sm"], [".desktop-status", "--font-size-md"], [".status", "--font-size-md"]]) {
      const found = sizeOf(selector);
      assert.ok(found.length > 0, `${selector} sets a font-size`);
      for (const d of found) assert.equal(d.value, `var(${token})`, `${selector} font-size`);
    }
  });

  it("the starter icon letter stays in px (12 px in a fixed 22 px box) and so do the weather tile tokens", async () => {
    const surfaces = await read("surfaces.css");
    assert.match(surfaces, /\.onboarding-wizard__starter-icon--letter \{[^}]*font-size:\s*12px;/s);
    const tokens = await read("design-tokens.css");
    for (const name of ["primary-cell-64", "secondary-cell-64", "primary-cell-56", "secondary-cell-56"]) {
      assert.match(tokens, new RegExp(`--font-size-weather-${name}:\\s*\\d+px;`), name);
    }
  });

  it("tile text keeps explicit px sizes in newtab.css (it never inherits the body size)", async () => {
    const css = await read("newtab.css");
    const tile = fontSizeDeclarations(css).filter((d) => d.property === "font-size" && usesPx(d.value));
    assert.ok(tile.length >= 10, `newtab.css still sizes tile text in px (${tile.length} declarations)`);
    assert.match(css, /\.favorite-letter[^{}]*\{[^}]*font-size:\s*15px;/s);
    assert.match(css, /\.city-hint-tile \{[^}]*font-size:\s*13px;/s);
  });
});
