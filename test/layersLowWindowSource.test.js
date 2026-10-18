import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// Run 46 (docs/layers-low-window.md, rev. 5): source pins written red first (TDD, Task 2 of the plan). The behaviour itself is
// measured by E2E dg-86; here only structural facts of src/ that the spec fixes (decisions 1 to 13). Where the spec leaves the
// mechanism to the plan, the pin names the observable property and admits every mechanism.
const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
const norm = (text) => text.replace(/\s+/g, " ").trim();
const stripCss = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
// A selector list splits on commas outside parentheses only: `body:has(.a, .b) #x` and `.x :is(button, input)` are one selector each.
function splitSelectors(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") depth -= 1;
    else if (text[i] === "," && depth === 0) {
      parts.push(norm(text.slice(from, i)));
      from = i + 1;
    }
  }
  parts.push(norm(text.slice(from)));
  return parts;
}
const cssRules = (css) => [...stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: splitSelectors(m[1]), body: norm(m[2]), at: m.index }));
const rulesFor = (css, selector) => cssRules(css).filter((r) => r.selectors.includes(selector));
// Declarations are compared whole (split on `;`), so `margin-bottom: 0` never satisfies `bottom: 0`.
const decls = (rule) => rule.body.split(";").map(norm).filter(Boolean);
const hasDecl = (rules, decl) => rules.some((r) => decls(r).includes(decl.replace(/;$/, "")));
const hasAnyDecl = (rules, list) => list.some((d) => hasDecl(rules, d));
const valueIncludes = (rules, text) => rules.some((r) => r.body.includes(text));

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
// The top-level statement (a column-0 line up to the closing `}` in column 0) that contains `index`.
function enclosing(code, index) {
  const starts = [...code.slice(0, index).matchAll(/^[^\s}].*$/gm)];
  const start = starts.length ? starts[starts.length - 1].index : 0;
  const end = code.indexOf("\n}\n", index);
  return code.slice(start, end === -1 ? code.length : end + 2);
}
// The body of one `case "<kind>": {` of the dialog builder, up to the next case.
function caseBody(code, kind) {
  const start = code.indexOf(`case "${kind}": {`);
  assert.notEqual(start, -1, `case ${kind} exists`);
  const next = code.indexOf('\n    case "', start + 10);
  const end = code.indexOf("\n      break;\n    }", start); // the case's own break: edit-weather is the last case and would run to the end of the file
  return code.slice(start, end !== -1 && (next === -1 || end < next) ? end : next === -1 ? code.length : next);
}
// Argument lists of every `name(...)` call in `text` (balanced parentheses), each as an array of top-level entries: a bare list of
// arguments, and for an object argument its keys (`{ restoreFocusTo: x, y }` gives ["restoreFocusTo: x", "y"] under `.keys`).
function calls(text, name) {
  const found = [];
  const re = new RegExp(`\\b${name}\\(`, "g");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    for (; i < text.length && depth > 0; i += 1) {
      if ("([{".includes(text[i])) depth += 1;
      else if (")]}".includes(text[i])) depth -= 1;
    }
    const inner = text.slice(from, i - 1);
    const split = (t) => {
      const out = [];
      let d = 0;
      let at = 0;
      for (let k = 0; k < t.length; k += 1) {
        if ("([{".includes(t[k])) d += 1;
        else if (")]}".includes(t[k])) d -= 1;
        else if (t[k] === "," && d === 0) {
          out.push(norm(t.slice(at, k)));
          at = k + 1;
        }
      }
      out.push(norm(t.slice(at)));
      return out.filter(Boolean);
    };
    const args = split(inner);
    const keys = args[0]?.startsWith("{") ? split(args[0].slice(1, args[0].lastIndexOf("}"))) : [];
    found.push({ args, keys });
  }
  return found;
}
// A reveal mode is passed: a second argument, or an object key besides restoreFocusTo. The option's name is the plan's.
const passesMode = (call) => call.args.length > 1 || call.keys.some((k) => !/^restoreFocusTo\b/.test(k));
const allCss = async () => (await Promise.all(["design-tokens.css", "surfaces.css", "controls.css", "newtab.css"].map(read))).join("\n");

describe("layers and the low window source (run 46, docs/layers-low-window.md)", () => {
  it("AS-LLW-01 / decision 11: the covered chip is derived from the DOM by body:has(.desktop-dialog, .city-modal), instant, kept in the tree, z-index 50", async () => {
    const css = await allCss();
    const covered = cssRules(css).filter((r) => r.selectors.some((s) => /^body:has\(\.desktop-dialog, \.city-modal\) (?:#desktop-status|\.desktop-status)(?::not\(\[hidden\]\))?$/.test(s)));
    assert.ok(covered.length > 0, "a rule under body:has(.desktop-dialog, .city-modal) paints the chip away");
    for (const rule of covered) {
      assert.doesNotMatch(rule.body, /display:\s*none|visibility:\s*hidden|transition|animation/, "no display none, visibility hidden or transition (the chip stays in the AX tree, hides instantly)");
    }
    assert.ok(covered.some((r) => /opacity:\s*0(?![.\d])|clip-path|color:\s*transparent/.test(r.body)), "the chip is made unpainted");
    assert.ok(hasDecl(rulesFor(css, ".desktop-status"), "z-index: 50;"), "the chip stays at z-index 50");
    const code = await js();
    assert.doesNotMatch(code, /desktopStatus\.(?:classList\.(?:add|toggle)|dataset\.\w+\s*=|toggleAttribute)\([^)]*(?:cover|behind|under|modal)/i, "no JS flag for the covered state");
  });

  it("decision 12: --status-reserve is written by a ResizeObserver on #desktop-status from the border box plus --status-chip-offset-bottom", async () => {
    const code = await js();
    const at = code.indexOf("new ResizeObserver(");
    assert.notEqual(at, -1, "a ResizeObserver exists");
    const block = enclosing(code, at);
    const target = block.match(/\.observe\(\s*(\w+)\s*\)/);
    assert.ok(target, "it observes one element");
    assert.match(code, new RegExp(`const ${target[1]} = document\\.(?:querySelector\\(["']#desktop-status["']\\)|getElementById\\(["']desktop-status["']\\))`), "that element is #desktop-status");
    assert.match(block, /setProperty\(\s*"--status-reserve"/, "it writes --status-reserve");
    assert.match(block, /borderBoxSize|offsetHeight/, "height is the border box, not contentRect");
    assert.doesNotMatch(block, /contentRect/, "contentRect leaves out padding and border");
    assert.match(block, /--status-chip-offset-bottom|STATUS_CHIP_OFFSET/, "the chip offset is added");
  });

  it("decision 12: .desktop padding-bottom and html scroll-padding-bottom come from --status-reserve (no layout input is touched)", async () => {
    const css = await allCss();
    const desktop = rulesFor(css, ".desktop");
    assert.ok(desktop.some((r) => /padding-bottom: calc\(var\(--grid-pad, 16px\) \+ var\(--status-reserve, 0px\)\)/.test(r.body)), ".desktop padding-bottom adds the reserve to the grid pad");
    assert.ok(hasDecl([...rulesFor(css, "html"), ...rulesFor(css, ":root")], "scroll-padding-bottom: var(--status-reserve, 0px)"), "the root's scroll-padding-bottom is the reserve");
    assert.doesNotMatch(await js(), /--status-reserve[^\n]*(?:viewportRows|clientHeight)/, "the reserve is not fed into the layout inputs");
  });

  it("decision 7 / 12: revealAddedTile's bottom edge accounts for the chip reserve (through isSafelyInsideWindow, which it calls)", async () => {
    const code = await js();
    assert.match(fn(code, "revealAddedTile"), /isSafelyInsideWindow\(/, "the reveal asks the shared window test");
    const inside = fn(code, "isSafelyInsideWindow");
    assert.match(inside, /--status-reserve/, "it reads the property by name");
    assert.match(inside, /getPropertyValue|getComputedStyle/, "it reads its value");
    assert.match(inside, /clientHeight\s*-/, "the safe bottom edge is the window height minus the reserve while a chip is shown");
  });

  it("AS-LLW-06 / decision 6: showDialogError focuses with preventScroll, then scrolls the slot instantly (never smooth)", async () => {
    const code = await js();
    const body = fn(code, "showDialogError");
    const focusAt = body.search(/\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
    assert.notEqual(focusAt, -1, "the field is focused with preventScroll: true");
    assert.doesNotMatch(body, /\.focus\(\)/, "no plain focus() left in the function");
    // The scroll lives in a helper the function calls after the focus (the spec fixes the order, not the function boundary).
    const callAt = body.search(/scrollDialogErrorIntoView\(/);
    assert.ok(callAt > focusAt, "the scroll helper is called after the focus");
    const helper = fn(code, "scrollDialogErrorIntoView");
    assert.match(helper, /scrollTop\s*=|scrollTo\(|scrollBy\(|scrollIntoView\(/, "the dialog is scrolled by code");
    assert.doesNotMatch(helper, /smooth/, "the scroll is instant");
    assert.match(helper, /slot/, "the slot is what is scrolled to");
    assert.match(helper, /\.favorite-form__footer/, "the sticky footer is the lower bound");
  });

  it("decision 7: focusWidgetTarget focuses the opener with preventScroll: true and reveals a neighbour by the nearest edge, instant", async () => {
    const focus = fn(await js(), "focusWidgetTarget");
    assert.match(focus, /preventScroll:\s*true/, "the opener is focused without scrolling the page");
    assert.match(focus, /scrollIntoView\(\{[^}]*block:\s*"nearest"[^}]*\}\)/, "the reveal is by the nearest edge");
    assert.match(focus, /scrollIntoView\(\{[^}]*behavior:\s*"auto"[^}]*\}\)/, "and instant");
    assert.match(focus, /\.focus\(\)/, "without a mode the plain focus() of the other callers stays");
  });

  it("decision 7 (b): Save in Edit link and Edit weather pass a reveal mode to closeDesktopDialog", async () => {
    const code = await js();
    for (const kind of ["edit-link", "edit-weather"]) {
      const closes = calls(caseBody(code, kind), "closeDesktopDialog");
      assert.equal(closes.length, 1, `${kind} closes once`);
      assert.ok(passesMode(closes[0]), `${kind}: the close after a successful Save passes a mode`);
    }
  });

  it("decision 7 (b): a successful Delete and Hide pass a reveal mode that depends on success; a failure restores the opener only", async () => {
    const code = await js();
    for (const name of ["confirmDeleteFavorite", "hideWeatherMetric"]) {
      const closes = calls(fn(code, name), "closeDesktopDialog");
      assert.equal(closes.length, 1, `${name} closes once`);
      assert.ok(passesMode(closes[0]), `${name}: a mode is passed`);
      const modeEntries = [...closes[0].keys.filter((k) => !/^restoreFocusTo\b/.test(k)), ...closes[0].args.slice(1)];
      assert.ok(modeEntries.some((e) => /\bok\b/.test(e)), `${name}: the mode is tied to the write succeeding (ok)`);
    }
  });

  it("decision 7 (b): recoverFromGoneLink passes a reveal mode in both branches (dialog and dialog-less)", async () => {
    const body = fn(await js(), "recoverFromGoneLink");
    const closes = calls(body, "closeDesktopDialog");
    const focuses = calls(body, "focusWidgetTarget");
    assert.equal(closes.length, 1, "the dialog branch");
    assert.equal(focuses.length, 1, "the dialog-less branch");
    assert.ok(passesMode(closes[0]), "the dialog branch passes a mode");
    assert.ok(passesMode(focuses[0]), "the dialog-less branch passes a mode");
  });

  it("decision 7 (a): Cancel, Escape, backdrop, the close after Add link and restoreFocusTo: null pass no mode; the other focusWidgetTarget callers keep a plain focus", async () => {
    const code = await js();
    const all = calls(code, "closeDesktopDialog");
    const plain = all.filter((c) => c.args.length === 0);
    assert.equal(plain.length, 4, "exactly add-link, backdrop, Cancel and Escape close with no argument (Save, Delete, Hide and gone-link carry a mode)");
    const add = calls(caseBody(code, "add-link"), "closeDesktopDialog");
    assert.ok(add.length === 1 && add[0].args.length === 0, "the close after a successful Add link passes no mode (revealAddedTile is the only scroll)");
    const heal = calls(fn(code, "leaveEditModeAfterFailedHeal"), "closeDesktopDialog");
    assert.ok(heal.length === 1 && heal[0].args.length === 1 && heal[0].keys.length === 1 && /^restoreFocusTo:\s*null$/.test(heal[0].keys[0]), "restoreFocusTo: null, nothing else");
    for (const name of ["restoreWeatherMetric", "closeAddMenu"]) {
      for (const call of calls(fn(code, name), "focusWidgetTarget")) assert.equal(call.args.length, 1, `${name}: focusWidgetTarget keeps one argument and the plain focus()`);
    }
  });

  it("decision 3: a stacked modal hides the card under it by .desktop-dialog[inert] { visibility: hidden }", async () => {
    const rules = rulesFor(await allCss(), ".desktop-dialog[inert]");
    assert.ok(hasDecl(rules, "visibility: hidden;"), "the inert dialog is not painted");
  });

  it("decision 1 (guard pin, green by nature): one Tab handler on trapRoot redirects a Tab from outside the layer; Reload exists only in showLayoutRestoreFailure", async () => {
    const code = await js();
    assert.match(code, /trapRoot\s*=\s*onboardingWizardRoot\s*\?\?\s*cityModalRoot\s*\?\?\s*desktopDialogRoot/, "the three layers share one root");
    assert.match(code, /!trapRoot\.contains\(active\)/, "an active element outside the layer is caught");
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
      "bottom: calc(-1 * var(--surface-modal-padding));", // spec said bottom: 0; Chromium measures sticky from the container's content box, so the card padding is added back (observable: 20px under the buttons)
      "padding-bottom: var(--surface-modal-padding);",
      "margin-bottom: calc(-1 * var(--surface-modal-padding));",
      "margin-top: 0;",
      "z-index: 1;"
    ]) {
      assert.ok(hasDecl(rules, decl), decl);
    }
    assert.ok(hasAnyDecl(rules, ["background: var(--panel);", "background-color: var(--panel);"]), "opaque --panel background");
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
    assert.equal(cssRules(css).filter((r) => decls(r).some((d) => d.startsWith("--tile-remove-offset:"))).length, 2, "declared in exactly two rules: the default and the 56 cell");
  });

  it("decision 9: the busy title ring is box-shadow 2px of the solid --focus-ring", async () => {
    const rules = rulesFor(await read("surfaces.css"), ".city-modal__title:focus-visible");
    assert.ok(rules.length > 0, "the title focus-visible rule exists");
    assert.ok(hasDecl(rules, "box-shadow: 0 0 0 2px var(--focus-ring);"), "solid token");
    assert.ok(!valueIncludes(rules, "var(--focus-overlay-ring)"), "no translucent overlay ring left on the title");
  });

  it("decision 9: the locked starter list keeps the solid --focus-ring and no longer relies on an inset outline the opaque rows cover", async () => {
    const css = await read("surfaces.css");
    const ring = cssRules(css).filter((r) => r.selectors.some((s) => s.includes('[data-starters-locked="true"]') && s.includes(":focus-visible")));
    assert.ok(ring.length > 0, "a focus-visible rule for the locked list exists");
    assert.ok(valueIncludes(ring, "var(--focus-ring)"), "the solid token");
    assert.ok(!valueIncludes(ring, "var(--focus-overlay-ring)"), "never the translucent one");
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
