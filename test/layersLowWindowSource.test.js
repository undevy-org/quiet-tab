import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// Run 46 (docs/layers-low-window.md, rev. 5): source pins written red first (TDD, Task 2 of the plan). The behaviour itself is
// measured by E2E dg-86; here only structural facts of src/ that the spec fixes (decisions 1 to 13). Where the spec leaves the
// mechanism to the plan, the pin names the observable property and admits every mechanism.
const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
const norm = (text) => text.replace(/\s+/g, " ").trim();
const stripCss = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const cssRules = (css) => [...stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(",").map(norm), body: norm(m[2]), at: m.index }));
const rulesFor = (css, selector) => cssRules(css).filter((r) => r.selectors.includes(selector));
const hasDecl = (rules, decl) => rules.some((r) => r.body.includes(decl));

function stripJs(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

const js = async () => stripJs(await read("newtab.js"));
function fn(code, name) {
  const start = code.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.notEqual(start, -1, `function ${name} exists`);
  const end = code.indexOf("\n}\n", start);
  assert.notEqual(end, -1, `function ${name} is closed`);
  return code.slice(start, end + 2);
}
const allCss = async () => (await Promise.all(["design-tokens.css", "surfaces.css", "controls.css", "newtab.css"].map(read))).join("\n");

describe("layers and the low window source (run 46, docs/layers-low-window.md)", () => {
  it("AS-LLW-01 / decision 11: the covered chip is derived from the DOM by body:has(.desktop-dialog, .city-modal), instant, kept in the tree, z-index 50", async () => {
    const css = await allCss();
    const covered = cssRules(css).filter((r) => r.selectors.some((s) => /^body:has\(\.desktop-dialog, \.city-modal\) (?:#desktop-status|\.desktop-status)$/.test(s)));
    assert.ok(covered.length > 0, "a rule under body:has(.desktop-dialog, .city-modal) paints the chip away");
    for (const rule of covered) {
      assert.doesNotMatch(rule.body, /display:\s*none|visibility:\s*hidden|transition|animation/, "no display none, visibility hidden or transition (the chip stays in the AX tree, hides instantly)");
    }
    assert.ok(covered.some((r) => /opacity:\s*0|clip-path|color:\s*transparent/.test(r.body)), "the chip is made unpainted");
    assert.ok(hasDecl(rulesFor(css, ".desktop-status"), "z-index: 50;"), "the chip stays at z-index 50");
    const code = await js();
    assert.doesNotMatch(code, /desktopStatus\.(?:classList\.(?:add|toggle)|dataset\.\w+\s*=|toggleAttribute)\([^)]*(?:cover|behind|under|modal)/i, "no JS flag for the covered state");
  });

  it("decision 12: --status-reserve is written by a ResizeObserver on #desktop-status from the border box plus --status-chip-offset-bottom", async () => {
    const code = await js();
    assert.match(code, /new ResizeObserver\(/, "a ResizeObserver exists");
    assert.match(code, /\.observe\(desktopStatus\)/, "it observes the chip");
    assert.match(code, /setProperty\(\s*"--status-reserve"/, "it writes --status-reserve");
    const at = code.indexOf('"--status-reserve"');
    const around = code.slice(Math.max(0, at - 700), at + 300);
    assert.match(around, /borderBoxSize|offsetHeight/, "height is the border box, not contentRect");
    assert.doesNotMatch(around, /contentRect/, "contentRect leaves out padding and border");
    assert.match(around, /--status-chip-offset-bottom|STATUS_CHIP_OFFSET/, "the chip offset is added");
  });

  it("decision 12: .desktop padding-bottom and html scroll-padding-bottom come from --status-reserve (no layout input is touched)", async () => {
    const css = await allCss();
    const desktop = rulesFor(css, ".desktop");
    assert.ok(desktop.some((r) => /padding-bottom: calc\(var\(--grid-pad, 16px\) \+ var\(--status-reserve, 0px\)\)/.test(r.body)), ".desktop padding-bottom adds the reserve to the grid pad");
    assert.ok(hasDecl(rulesFor(css, "html"), "scroll-padding-bottom: var(--status-reserve, 0px)"), "html scroll-padding-bottom is the reserve");
    assert.doesNotMatch(await js(), /--status-reserve[^\n]*(?:viewportRows|clientHeight)/, "the reserve is not fed into the layout inputs");
  });

  it("decision 7 / 12: revealAddedTile's bottom edge accounts for the chip reserve", async () => {
    const reveal = fn(await js(), "revealAddedTile");
    assert.match(reveal, /--status-reserve|statusReserve|desktopStatus/, "the safe bottom edge is the window height minus the reserve while a chip is shown");
  });

  it("AS-LLW-06 / decision 6: showDialogError focuses with preventScroll, then scrolls the slot instantly (never smooth)", async () => {
    const body = fn(await js(), "showDialogError");
    const focusAt = body.search(/\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
    assert.notEqual(focusAt, -1, "the field is focused with preventScroll: true");
    assert.doesNotMatch(body, /\.focus\(\)/, "no plain focus() left in the function");
    const scrollAt = body.search(/scrollTo\(|scrollTop\s*=|scrollBy\(|scrollIntoView\(/);
    assert.notEqual(scrollAt, -1, "the dialog is scrolled by code");
    assert.ok(scrollAt > focusAt, "the scroll comes after the focus");
    assert.doesNotMatch(body, /smooth/, "the scroll is instant");
    assert.match(body, /data-dialog-error|slot/, "the slot is what is scrolled to");
  });

  it("decision 7: closeDesktopDialog restores focus without scrolling the page; focusWidgetTarget reveals by the nearest edge only on request", async () => {
    const code = await js();
    const close = fn(code, "closeDesktopDialog");
    assert.match(close, /focusWidgetTarget\([^;]*,/, "closeDesktopDialog passes a mode to focusWidgetTarget");
    const focus = fn(code, "focusWidgetTarget");
    assert.match(focus, /preventScroll/, "the mode focuses with preventScroll");
    assert.match(focus, /scrollIntoView\(\{[^}]*block:\s*"nearest"[^}]*behavior:\s*"auto"[^}]*\}\)|scrollIntoView\(\{[^}]*behavior:\s*"auto"[^}]*block:\s*"nearest"[^}]*\}\)/, "the neighbour reveal is instant and by the nearest edge");
  });

  it("decision 7 (b): recoverFromGoneLink passes the reveal mode in both branches (dialog and dialog-less)", async () => {
    const body = fn(await js(), "recoverFromGoneLink");
    assert.match(body, /closeDesktopDialog\(\{\s*restoreFocusTo:\s*neighbours,\s*\w+/, "the dialog branch names a mode");
    assert.match(body, /focusWidgetTarget\(neighbours,\s*\S/, "the dialog-less branch names a mode");
  });

  it("decision 3: a stacked modal hides the card under it by .desktop-dialog[inert] { visibility: hidden }", async () => {
    const rules = rulesFor(await allCss(), ".desktop-dialog[inert]");
    assert.ok(hasDecl(rules, "visibility: hidden;"), "the inert dialog is not painted");
  });

  it("decision 1 (guard, green by nature): the Tab handler on trapRoot keeps Reload out of reach and the Reload button exists only in showLayoutRestoreFailure", async () => {
    const code = await js();
    assert.match(code, /const trapRoot = onboardingWizardRoot \?\? cityModalRoot \?\? desktopDialogRoot;\s*if \(event\.key !== "Tab" \|\| !trapRoot\) return;/, "one handler for the three layers");
    assert.match(code, /!trapRoot\.contains\(active\)\)\s*\{\s*event\.preventDefault\(\);\s*\(event\.shiftKey \? last : first\)\.focus\(\)/, "a Tab from outside the layer is redirected into it");
    const restore = fn(code, "showLayoutRestoreFailure");
    assert.match(restore, /desktop-status__reload/, "the Reload button is made here");
    assert.equal((code.match(/desktop-status__reload/g) ?? []).length, 1, "and nowhere else");
  });

  it("decision 4: scroll-margin 5px on the controls of a desktop dialog (resting state, a literal)", async () => {
    assert.ok(hasDecl(rulesFor(await read("surfaces.css"), ".desktop-dialog :is(button, input)"), "scroll-margin: 5px;"));
  });

  it("decision 13: .desktop-dialog scroll-padding-bottom is the footer's full box (gap + control + card padding)", async () => {
    const rules = rulesFor(await allCss(), ".desktop-dialog");
    assert.ok(hasDecl(rules, "scroll-padding-bottom: calc(var(--modal-actions-margin-top) + var(--control-height) + var(--surface-modal-padding));"));
  });

  it("decision 13: .desktop-dialog .favorite-form__footer is sticky with the padding recipe, an opaque panel and z-index 1", async () => {
    const rules = rulesFor(await allCss(), ".desktop-dialog .favorite-form__footer");
    assert.ok(rules.length > 0, "the selector exists");
    for (const decl of [
      "position: sticky;",
      "bottom: 0;",
      "padding-bottom: var(--surface-modal-padding);",
      "margin-bottom: calc(-1 * var(--surface-modal-padding));",
      "margin-top: 0;",
      "background: var(--panel);",
      "z-index: 1;"
    ]) {
      assert.ok(hasDecl(rules, decl), decl);
    }
    assert.ok(rules.some((r) => /padding-top: (?:var\(--modal-actions-margin-top\)|calc\(var\(--modal-actions-margin-top\) - 1px\));/.test(r.body)), "the 16px gap moves into the footer's padding-top");
  });

  it("decision 13: the divider is a real 1px border-top in --border on the footer (a scrolling dialog only; the mechanism is the plan's)", async () => {
    const css = await allCss();
    const divider = cssRules(css).filter((r) => r.selectors.some((s) => s.includes(".desktop-dialog") && s.includes(".favorite-form__footer")) && /border-top: 1px solid var\(--border\);/.test(r.body));
    assert.ok(divider.length > 0, "a footer rule draws border-top: 1px solid var(--border)");
    assert.ok(divider.every((r) => !r.selectors.includes(".desktop-dialog .favorite-form__footer")), "not on the resting footer rule: a fitting dialog has no divider");
  });

  it("decision 8: the remove badge offset is 6px at the 56 cell (cells 64 and 72 keep 8px)", async () => {
    const css = await allCss();
    assert.ok(hasDecl(rulesFor(css, ':root[data-cell="56"]'), "--tile-remove-offset: 6px;"), "6px at :root[data-cell=56]");
    assert.ok(hasDecl(rulesFor(css, ":root"), "--tile-remove-offset: 8px;"), "8px stays the default");
  });

  it("decision 9: the busy title ring is box-shadow 2px of the solid --focus-ring", async () => {
    const rules = rulesFor(await read("surfaces.css"), ".city-modal__title:focus-visible");
    assert.ok(rules.length > 0, "the title focus-visible rule exists");
    assert.ok(hasDecl(rules, "box-shadow: 0 0 0 2px var(--focus-ring);"), "solid token");
    assert.ok(!hasDecl(rules, "var(--focus-overlay-ring)"), "no translucent overlay ring left on the title");
  });

  it("decision 9: the locked starter list keeps the solid --focus-ring and no longer relies on an inset outline the opaque rows cover", async () => {
    const css = await read("surfaces.css");
    const ring = cssRules(css).filter((r) => r.selectors.some((s) => s.includes('[data-starters-locked="true"]') && s.includes(":focus-visible")));
    assert.ok(ring.length > 0, "a focus-visible rule for the locked list exists");
    assert.ok(hasDecl(ring, "var(--focus-ring)"), "the solid token");
    assert.ok(!hasDecl(ring, "var(--focus-overlay-ring)"), "never the translucent one");
    assert.ok(!hasDecl(ring, "outline-offset: -2px;"), "an inset outline is painted under the opaque rows (run 46 step 1: 49 of 245 pixels)");
  });

  it("decision 10: .city-modal .city-location-link:focus-visible sets outline-offset 0 after the shared :is(...) rule that sets 2px", async () => {
    const css = stripCss(await read("surfaces.css"));
    const link = rulesFor(css, ".city-modal .city-location-link:focus-visible");
    assert.ok(hasDecl(link, "outline-offset: 0;"), "the rule has outline-offset: 0");
    const shared = rulesFor(css, ".city-modal :is(button, input, .weather-form__suggestion):focus-visible");
    assert.ok(hasDecl(shared, "outline-offset: 2px;"), "the shared rule still sets 2px");
    assert.ok(link[link.length - 1].at > shared[shared.length - 1].at, "equal specificity (0,3,0) is decided by order: the link rule comes later");
  });
});
