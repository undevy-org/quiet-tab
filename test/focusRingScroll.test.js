import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// Source assertions for the city-modal focus ring when focus scrolls a list or the dialog (docs/docked-list-focus-ring.md).
// The behavior itself is measured by the E2E scenario dg-52-docked-list-focus-ring.mjs.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const stripJs = (js) => js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function allCss() {
  const names = ["design-tokens.css", "controls.css", "surfaces.css", "newtab.css"];
  return Object.fromEntries(await Promise.all(names.map(async (n) => [n, strip(await read(`../src/${n}`))])));
}

// Rules as { selector, body } pairs, flat (the @media blocks of these files hold no focus rules).
const rules = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));

const MARGIN_SELECTOR = ".city-modal :is(button, input, .weather-form__suggestion)";

describe("city modal focus ring when focus scrolls (scroll-margin)", () => {
  it("has a resting rule on the modal controls that keeps scroll-margin at least ring + 1 px", async () => {
    const { "surfaces.css": css } = await allCss();
    const rule = rules(css).find((r) => r.selector === MARGIN_SELECTOR);
    assert.ok(rule, `no rule for ${MARGIN_SELECTOR}`);
    const value = rule.body.match(/scroll-margin:\s*(\d+(?:\.\d+)?)px\s*;/);
    assert.ok(value, "scroll-margin must be a px literal (not calc/var)");
    const ring = 2 + 2; // forced-colors outline: width 2 + offset 2 (the box-shadow ring is 2)
    assert.ok(Number(value[1]) >= ring + 1, `scroll-margin ${value[1]}px is below ring (${ring}) + 1`);
    assert.equal(value[1], "5");
    assert.doesNotMatch(rule.body, /outline|box-shadow|background/);
  });

  it("is not placed inside a :focus-visible rule (the scroll happens at the moment of focus)", async () => {
    const { "surfaces.css": css } = await allCss();
    const inFocus = rules(css).filter((r) => r.selector.includes(":focus-visible") && /scroll-margin/.test(r.body));
    assert.deepEqual(inFocus.map((r) => r.selector), []);
  });

  it("uses no scroll-padding and no scroll-snap anywhere in src/*.css", async () => {
    for (const [name, css] of Object.entries(await allCss())) {
      assert.doesNotMatch(css, /scroll-padding|scroll-snap/, name);
    }
  });

  it("keeps the suggestion list scrolling and the ring rules unchanged", async () => {
    const { "surfaces.css": css } = await allCss();
    const list = rules(css).find((r) => r.selector === ".weather-form__suggestions");
    assert.ok(list);
    assert.match(list.body, /overflow-y:\s*auto;/);
    assert.doesNotMatch(list.body, /overflow:\s*visible/);
    const focus = rules(css).find((r) => r.selector === ".city-modal :is(button, input, .weather-form__suggestion):focus-visible");
    assert.ok(focus);
    assert.match(focus.body, /outline:\s*2px solid transparent;/);
    assert.match(focus.body, /outline-offset:\s*2px;/);
    const row = rules(css).find((r) => r.selector === ".city-modal .weather-form__suggestion:focus-visible");
    assert.ok(row);
    assert.match(row.body, /box-shadow:\s*0 0 0 2px var\(--focus-overlay-ring\);/);
  });

  it("leaves the popover thresholds and the docked decision as they are", async () => {
    const js = stripJs(await read("../src/newtab.js"));
    assert.match(js, /const POPOVER_MAX_HEIGHT = 240;/);
    assert.match(js, /const POPOVER_MIN_FREE = 96;/);
    assert.match(js, /const POPOVER_GAP = 6;/);
    assert.match(js, /const docked = free < POPOVER_MIN_FREE;/);
  });

  it("is documented in the changelog and the design system", async () => {
    const changelog = await read("../CHANGELOG.md");
    const unreleased = changelog.slice(changelog.indexOf("## [Unreleased]"), changelog.indexOf("\n## [", changelog.indexOf("## [Unreleased]") + 1));
    assert.match(unreleased, /focus ring[\s\S]*?dg-52-docked-list-focus-ring\.mjs/);
    const doc = await read("../docs/design-system.md");
    const item4 = doc.slice(doc.indexOf("4. Overlay focus"), doc.indexOf("5. Run `npm test`"));
    assert.match(item4, /scroll-margin/);
    const row = doc.split("\n").find((l) => l.startsWith("| `.weather-form__suggestions`"));
    assert.ok(row);
    assert.match(row, /scroll-margin/);
  });
});
