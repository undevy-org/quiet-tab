import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

// AS-CE-01..05 (docs/city-error-ux.md): source-level guards; the behavior itself is covered by e2e dg-47.
describe("city modal error feedback", () => {
  it("the input listener and the Clear handler empty the existing error slot", async () => {
    const code = await read("newtab.js");
    // AS-MO-17: after the slot is emptied the dialog height changed, so the list placement runs again (no resize event needed).
    assert.match(code, /function clearCityError\(\) \{\s*cityModalError = "";\s*errorNode\.textContent = "";\s*errorNode\.hidden = true;\s*placePopover\(\);\s*\}/);
    assert.match(code, /input\.addEventListener\("input", \(\) => \{\s*chosenCity = null;[^\n]*\n\s*clearCityError\(\);[\s\S]*?\}\);/);
    assert.match(code, /clear\.addEventListener\("click", \(\) => \{[^}]*clearCityError\(\);/);
  });

  it("the slot keeps role=alert on the same node, no aria-live, and the helper never rebuilds it", async () => {
    const code = await read("newtab.js");
    assert.match(code, /errorNode\.setAttribute\("role", "alert"\);/);
    const start = code.indexOf("function clearCityError()");
    const helper = code.slice(start, code.indexOf("\n  }\n", start));
    assert.doesNotMatch(helper, /createNode|replaceWith|innerHTML|aria-live|syncCityModal/);
    assert.match(helper, /placePopover\(\);/);
    const builderStart = code.indexOf('const errorNode = createNode("p"');
    const builder = code.slice(builderStart, code.indexOf("form.append(", builderStart));
    assert.doesNotMatch(builder, /aria-live/);
    assert.doesNotMatch(code, /city-modal[^\n]*aria-live/);
  });

  it("the error node sits in a feedback block with no role, aria or text of its own", async () => {
    const code = await read("newtab.js");
    assert.match(code, /const feedback = createNode\("div", "city-modal__feedback"\);\s*feedback\.append\(errorNode\);\s*form\.append\(field, feedback, actions\);/);
    assert.doesNotMatch(code, /feedback\.(setAttribute|textContent)/);
  });

  it("AS-MO-15: the feedback block has no min-height reserve and no reserve token; errors sit 8px below the input", async () => {
    const css = await read("surfaces.css");
    const rule = css.match(/\.city-modal__feedback \{([^}]*)\}/);
    assert.ok(rule, "rule .city-modal__feedback exists");
    assert.doesNotMatch(rule[1], /min-height/);
    assert.match(rule[1], /margin: 0;/);
    assert.match(rule[1], /padding: 0;/);
    assert.doesNotMatch(css, /--city-feedback-reserve/);
    const error = css.match(/\.city-modal__feedback \.status--error \{([^}]*)\}/);
    assert.ok(error, "rule .city-modal__feedback .status--error exists");
    assert.match(error[1], /margin: 8px 0 0;/);
  });

  // Coverage note (docs/city-modal-low-window.md): resetting `cityModalError` in the helper has no UI-visible effect today.
  // `syncCityModal` has four callers and each assigns the variable right before the call, `buildCityModal` reads it only at
  // open (`showCityModal` and `hideCityModal` reset it first), and the field is disabled while a request runs. The reset
  // guards a future caller; this source test is its only check.
  it("clearCityError resets the variable first (equivalent through the UI, covered here)", async () => {
    const code = await read("newtab.js");
    assert.match(code, /function clearCityError\(\) \{\s*cityModalError = "";/);
  });
});

// AS-MO-14, AS-MO-15, AS-MO-17 (docs/modal-overlay-design.md): placePopover keeps only the docked/overlay list logic; source-level guards,
// the behavior itself is covered by e2e dg-58 (groups 14, 17) and the rewritten dg-49 / dg-53.
describe("city modal placePopover without reserve machinery", () => {
  const place = async () => {
    const code = await read("newtab.js");
    const start = code.indexOf("function placePopover()");
    return code.slice(start, code.indexOf("\n  }\n", start));
  };
  const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");

  it("placePopover drops docked and scroll, measures free and tooTall, toggles docked and scroll, sets the list max-height, restores scrollTop, in this order", async () => {
    const body = stripComments(await place());
    const at = (re) => body.search(re);
    const order = [
      /classList\.remove\("weather-form__suggestions--docked"\)/,
      /classList\.remove\("city-modal__dialog--scroll"\)/,
      /const free =/,
      /const tooTall =/,
      /classList\.toggle\("weather-form__suggestions--docked"/,
      /classList\.toggle\("city-modal__dialog--scroll"/,
      /suggestionsList\.style\.maxHeight =/,
      /dialog\.scrollTop = scrollTop/
    ].map(at);
    assert.ok(order.every((i) => i >= 0), `all steps present: ${order}`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "steps are in the mandatory order");
  });

  it("no reserve, base, kept, compact class, custom property or feedbackReserve anywhere in src/", async () => {
    const body = stripComments(await place());
    assert.doesNotMatch(body, /reserve|\bbase\b|\bkept\b|compact|--city-feedback-reserve|feedbackReserve/);
    for (const name of ["newtab.js", "surfaces.css", "controls.css", "newtab.css", "cityPrompt.js"]) {
      const text = await read(name);
      assert.doesNotMatch(text, /feedbackReserve|--city-feedback-reserve|city-modal__dialog--compact/, name);
    }
    const code = await read("newtab.js");
    assert.doesNotMatch(code, /import \{[^}]*feedbackReserve[^}]*\} from "\.\/cityPrompt\.js";/);
    assert.doesNotMatch(code, /ResizeObserver/);
    assert.equal((code.match(/addEventListener\("resize"/g) ?? []).length, 3, "the resize listeners of the page are unchanged");
  });

  it("the modal has no compact rule and no transitions or animations", async () => {
    const css = await read("surfaces.css");
    assert.doesNotMatch(css, /city-modal__dialog--compact/);
    const rules = css.match(/\.city-modal[^{}]*\{[^}]*\}/g) ?? [];
    assert.ok(rules.length > 0);
    assert.equal(rules.filter((r) => /transition|animation/.test(r)).length, 0, "no transition or animation in the city modal rules");
  });

  it("the popover thresholds are unchanged", async () => {
    const code = await read("newtab.js");
    assert.match(code, /const POPOVER_MAX_HEIGHT = 240;/);
    assert.match(code, /const POPOVER_MIN_FREE = 96;/);
    assert.match(code, /const POPOVER_GAP = 6;/);
    assert.match(code, /const VIEWPORT_MARGIN = 16;/);
  });
});
