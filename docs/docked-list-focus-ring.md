# City suggestion list: focus ring cut off when the list scrolls

## Status

`draft` (stage 0, not yet through the spec gate)

Decision: **do it**, with a narrower and different fix than the backlog item implied. Backlog item 5 ("focus ring of the docked list cut by about 2.4 px; layout of `placePopover`; risk for the dg-48 thresholds") was reproduced and measured. The cut is real, but it is not a layout problem and it is not limited to the docked list: it happens whenever keyboard focus scrolls the suggestion list or the dialog by just enough to bring the focused row into view. The fix is one `scroll-margin` declaration; `placePopover`, its thresholds and every metric of the dialog stay exactly as they are (see "Default decisions").

## Intake log

| Date | Raw note (backlog item 5) | Verdict | Reference |
|------|---------------------------|---------|-----------|
| 2026-10-04 | "Focus ring of the docked list cut by about 2.4 px." | `confirmed`, wider than stated | Bottom cut 2.36 px (320x300) and 2.27 px (400x260, 360x280) on the row focused by ArrowDown/Tab in the docked list; top cut 1.64 / 1.73 px on ArrowUp. Same defect, 2.00 px, in the capped overlay list. See "Measurements". |
| 2026-10-04 | "Layout `placePopover`." | `rejected as the cause` | `placePopover` (`src/newtab.js:655`) decides only the mode (overlay or docked), the `max-height` and the dialog scroll class. The ring is cut by the scroll position the browser picks when focus moves, not by where the list sits. No layout change is needed to remove the cut. |
| 2026-10-04 | "Risk for the dg-48 thresholds." | `no risk with the chosen fix` | A prototype of the fix changes no box: list heights (134 / 94 / 334 / 240 / 111.4 / 113.2 px) and mode decisions are identical before and after; `dg-47`..`dg-49` give the same 330/335 on the prototype as on unmodified `main` (the five failures are the known 360 px pair, backlog item 8). |

## Why it happens (mechanism)

Focus on a row of the suggestion list is moved by script (`suggestionsList.querySelector("button")?.focus()` and `items[at + 1]?.focus()` in `src/newtab.js`) or by Tab. The browser then scrolls the nearest scroll containers so that the **border box** of the row is inside their scrollport, and stops as soon as it is. It does not know about the focus ring, which lies outside the border box: a 2 px `box-shadow` (`--focus-overlay-ring`, `src/surfaces.css:136`) in normal rendering, and a 2 px `outline` with 2 px offset (`src/surfaces.css:116`) in forced colors (4 px outside the box; there the shadow is dropped). A scroll container clips everything outside its padding box edge. So when a row is scrolled in "just enough", its bottom (ArrowDown, Tab) or top (ArrowUp) edge sits exactly at the clip edge and the ring there is cut by its full extent. Padding on the container does not help: scrolling to reveal ignores padding (the list has 6 px of it).

Two scroll containers can be involved, and both are affected:

- **Docked list** (`.weather-form__suggestions--docked`, low window): the list does not scroll itself (`max-height: none`), the **dialog** (`.city-modal__dialog--scroll`, `overflow-y: auto`) does.
- **Capped overlay list** (`max-height` up to `POPOVER_MAX_HEIGHT` 240 px, `overflow-y: auto`): the **list** scrolls. This is also the ordinary desktop case: the real request asks for 6 cities (`searchCities` default `count = 6`), 6 rows need 254 px and the list is capped at 240 px.

The remaining 0.36 / 0.27 px beyond the 2 px are Chrome's integer scroll offsets (the dialog content is fractional, 1.6 px slack in some windows).

## Measurements

Chromium via Playwright (`.private/e2e/lib/harness.mjs`), `main` at `9fa8690`, unpacked extension, Open-Meteo routed to N canned suggestions. Method: focus the field, press ArrowDown N times, ArrowUp N-1 times, then Tab through the modal; for every focused element the ring rectangle (the border box grown by the larger of the computed `box-shadow` spread and the visible `outline-width + outline-offset`) is compared with the clip rectangle of every scrolling ancestor (its `clientTop/Left/Height/Width` box). "Cut" = how far the ring extends beyond that clip. Light and dark give identical numbers (same geometry, only the ring color differs).

| Mode and window | Rows | Scroller | Cut at the bottom (ArrowDown / Tab) | Cut at the top (ArrowUp) |
|---|---|---|---|---|
| first-run 320x300, **docked** | 2, 3, 6, 8 | dialog | **2.36 px** (a row in the middle of the scroll; the first row and a last row that reaches the end of the scroll are not cut) | **1.64 px** (8 rows) |
| first-run 400x260, docked | 2, 3, 8 | dialog | **2.27 px** | **1.73 px** (8 rows) |
| first-run 360x280, docked | 3, 8 | dialog | **2.27 px** | **1.73 px** (8 rows) |
| first-run 1280x800, 500x600, overlay capped at 240 | 6, 8 | list | **2.00 px** (the last row) | **2.00 px** |
| first-run 320x340, 320x420, 500x300, overlay capped | 8 | list | **2.00 px** | **2.00 px** |
| change 400x260, 360x280, 320x300, overlay capped | 3 (400x260, 360x280), 6 | list | **2.00 px** | **2.00 px** (6 rows) |
| forced colors, docked (320x300, 400x260, 360x280) | 3 | dialog | **4.36 / 4.27 px** (outline 2 + offset 2 = 4 px extent) | |
| forced colors, overlay capped (320x340, 500x300; change 400x260, 360x280) | 3 | list | **4.00 px** | **4.00 px** |
| forced colors, 400x260 and 360x280 first-run, Tab to the clear button after the walk | 3 | dialog | | **1.73 px** (the "Clear city" icon button, dialog scrolled to 122 px) |
| docked, 3 rows (400x260, 360x280), ArrowUp from the first row back **to the field** with the dialog scrolled | 3 | dialog | | **1.73 px** on the field ring (normal rendering); forced colors 400x260 **3.73 px**; 320x300 is not cut |
| any window, **1 row**, or lists that do not scroll (320x500 with 3 rows, 1280x800 with 3 rows) | 1, 3 | none | 0 | 0 |

Not cut anywhere: left and right edges (the list's 6 px side padding holds the ring), *Not now* / *Cancel* and *Save* (they sit at the end of the dialog's scroll content, where the dialog padding gives room), light/dark colors. The field is cut in one case only (next row). Hover has no ring. Every cut row is a row the user can see being focused: the ring is visibly flattened on one side, and in forced colors up to the whole 2 px outline disappears on that edge.

Prototype of the fix (a copy of `main` in the scratchpad, `src/surfaces.css` only, see "Default decisions"): with `scroll-margin: 4px` the forced-colors docked case still leaves 0.36 / 0.27 px; with `scroll-margin: 5px` the cut is 0 in every combination measured above, the field-after-ArrowUp case included (16 combinations) (light, dark and forced colors; docked and overlay; N = 3, 6, 8; ArrowDown, ArrowUp, Tab), and every list height and mode decision is the same as on `main`.

## Default decisions (owner can override)

1. **Do it, and do it as one CSS declaration, not as a layout change.** `scroll-margin` on the rows (and the other focusable controls of the city modal) makes the browser keep that distance between the focused box and the scrollport edge. It is the intended property for exactly this ("scroll-snap-area margin box" is also used for scrolling into view) and was verified to work for focus-driven scrolling in Chromium. No thresholds (`POPOVER_MIN_FREE` 96, `POPOVER_MAX_HEIGHT` 240, `POPOVER_GAP` 6, `VIEWPORT_MARGIN`), no `placePopover` logic, no padding, no height changes. The dg-47/48/49 contracts are untouched by construction.
2. **Value: 5 px.** The widest ring is the forced-colors outline, 2 px width + 2 px offset = 4 px; one more pixel absorbs Chrome's integer scroll snapping (4 px measured 0.27 to 0.36 px short). It is a literal with a comment, not a token (it is not a design value anyone tunes; if the ring tokens change the unit test below fails and says so).
3. **Selector:** `.city-modal :is(button, input, .weather-form__suggestion)` in `src/surfaces.css`, next to the existing focus rules, on the resting state (the scroll happens at the moment of focus, so it must not wait for `:focus-visible`). Reason: same mechanism, one rule; it also fixes the "Clear city" icon button case measured in forced colors, and costs nothing for controls that never scroll. Not on the container (`scroll-padding`): that would be two rules (list and dialog) and would also move Save/Cancel and the error text.
4. **Scope:** the city modal only (`.city-modal`). The desktop dialogs (`.desktop-dialog`, `overflow-y: auto` at `src/surfaces.css:164`) have the same mechanism in a low window. Measured at stage 1: Add link (scrollHeight 505, clientHeight 266 / 366; 400x300, 320x400, forced colors at 400x300; Tab x7 and Shift+Tab x7): cut 0 px both on `main` and with the prototype. Edit link, weather edit and delete confirm are not measured. Not changed (Non-goals; backlog candidate).
5. **Mouse and touch are unaffected:** a click does not scroll to reveal the target, wheel scrolling ignores `scroll-margin`, and the ring is `:focus-visible` only.
6. **No change in how many rows are shown or how far the list scrolls at rest.** `scroll-margin` only changes the scroll offset reached by a focus move: up to 5 px more of the neighbouring content is shown. At the ends of the scroll the offset is clamped as before.
7. **Tests:** a source test pins the rule and the unchanged thresholds (the thresholds are pinned because the backlog worried about them; the test turns a future change of them into a deliberate edit, not an accident). The behavior is covered by a measuring E2E, not by a unit test: there is no pure logic to unit-test.
8. **A fix that needed a threshold change would not be done.** The prototype did not need one (measured above); if the implementation ever does, the item is recorded as "not done" and `src/` is reverted.

## Scope

- `src/surfaces.css`: one new rule `.city-modal :is(button, input, .weather-form__suggestion) { scroll-margin: 5px; }` with a comment. Nothing else in `src/`.
- `test/newtabSource.test.js:439` (existing test "modal controls get a transparent 2px outline only while focused…"): the line `assert.doesNotMatch(css, /\.city-modal :is\(button, input[^)]*\)\s*\{/)` would fail on the new resting rule, so it is edited by the implementer, keeping its invariant ("never an outline or ring on resting controls"): every rule whose selector is `.city-modal :is(button, input…)` without `:focus-visible` must not declare `outline`, `box-shadow` or `background`; `scroll-margin` is allowed. The assertion at `:438` and the other assertions of the test are unchanged. This is a test edit, not a behavior change; it happens in the same task as the CSS rule (plan Task 2).
- New unit test `test/focusRingScroll.test.js` (source assertions: the rule and its value; `POPOVER_MIN_FREE`, `POPOVER_MAX_HEIGHT`, `POPOVER_GAP` unchanged; the docs sentence).
- New E2E `.private/e2e/scenarios/dg-52-docked-list-focus-ring.mjs` (the last existing scenario is `dg-51`).
- `docs/design-system.md`: one sentence in the overlay-focus rule ("Adding new UI", item 4) and in the `.weather-form__suggestions` row: rows and controls in a scrolling overlay keep `scroll-margin` at least as large as the ring (outline 2 + offset 2, plus 1).
- `CHANGELOG.md`: `Fixed` entry under `[Unreleased]`.
- README screenshot: not affected.

## Process

This changes what the user sees (keyboard focus ring), so it follows the full UI-phase cycle: spec, plan in `quiet-tab-notes/superpowers/plans/`, independent design review (`design-review/PROTOCOL.md`), E2E, merge only after the owner confirms.

E2E commands: the full run is `node .private/e2e/run.mjs --repo . --base 67b3e32`; the new scenario alone: `node .private/e2e/run.mjs --repo . --only dg-52 --base 67b3e32`. Known on a Mac: `dg-48` AS-LW-03 (1 check) and `dg-49` AS-LW-06 (4 checks, 360x337 and 360x320) fail at 360 px on a clean base for a reason that is not established (backlog item 8); they are not caused by this change and `dg-52` avoids 360 px heights between 300 and 340 so it does not depend on them. **Run E2E strictly one at a time:** two parallel full runs hang the harness (CPU near 0; backlog item 8); `dg-52` and the full run never overlap. Before/after run of `dg-47`..`dg-49` on the prototype: 330/335 both.

### Procedure items (TEMPLATES) that do not apply

N/A: migration and storage (nothing persisted), first launch and empty state (the list is not shown without suggestions), error and recovery states (an error text is not part of this), large data beyond the 6-row real count (8 rows are tested as a stress case), new controls (none), new texts (none), Escape layers and focus return (unchanged, covered by existing scenarios; AS-FR-07 pins the ArrowUp-to-field step). Touch, pen, Firefox and Safari are not verified.

## Non-goals

- Changing `placePopover`, its thresholds, the list height, the popover position, the dialog size or any metric.
- Changing the ring itself (color, thickness, offset, `--soft-ring`, forced-colors outline) or adding a ring where there is none.
- The desktop dialogs (`.desktop-dialog`) and the Add menu: same mechanism possible in a low window. Add link measured, 0 px; the other dialogs and the Add menu are not measured.
- Other findings of the low-window phase (the 39 px jump at the threshold, backlog item 6) and the 360 px failures of `dg-48`/`dg-49` (item 8).
- Scroll behavior on mouse hover or touch.

## Accepted exceptions

- **Up to 5 px more neighbouring content is revealed when focus scrolls the list or dialog** (decision 6). Accepted: that is the purpose of the margin; the extent is the ring plus one pixel.
- **Two non-row cases were measured before the fix and are covered by the same rule (`button`, `input`):** (1) the "Clear city" icon button, forced colors only, after a prior scroll of the dialog (1.73 px; E2E in the one window where it reproduced, 400x260 first-run); (2) the field ring when ArrowUp returns focus to the field with the dialog scrolled (docked 400x260 and 360x280 with 3 rows: 1.73 px; forced colors 400x260: 3.73 px; 320x300 not cut). Both are 0 with the prototype.
- **`dg-48`/`dg-49` 360 px failures on a Mac** are known and unrelated (backlog item 8).

## Acceptance scenarios

Common setup of the E2E (`dg-52`): extension build under test, Open-Meteo routed to N canned suggestions named `Tbilisi 1..N` (as `dg-48` `setNet` "suggest"), seeded default metrics and chrome tiles (`widgetStorageV2`), first-run mode with `autoPrompt: true` and no city, change mode with `quietTabWeatherPromptDismissed` stored and a click on the hint tile (as `dg-48` `openModal`). Windows and modes below are the ones measured; a window whose mode (docked or overlay) differs from the stated one fails the check, so a changed threshold cannot silently skip the case. The ring is measured as in "Measurements" (ring rectangle against the clip rectangle of every scrolling ancestor; ring extent read from the computed `box-shadow` spread and the visible `outline`, never hard-coded); "not cut" means every side's cut is <= 0.05 px. Walk: focus the field, ArrowDown N times, ArrowUp N-1 times, ArrowUp once more (back to the field), then Tab from the field through the modal to *Save* (every Tab stop measured, 50 ms between steps). Before the first ArrowDown of every case `dg-52` waits for `waitForSelector(".weather-form__suggestion")` plus 450 ms, and again after every `reload` or window resize, so the popover has settled.

### AS-FR-01 The rule exists and moves nothing

- Given: `src/surfaces.css`, `src/newtab.js`, `src/design-tokens.css`.
- When: the rules are parsed (comments stripped).
- Then: a rule with selector `.city-modal :is(button, input, .weather-form__suggestion)` declares `scroll-margin: 5px` (the literal, not a `calc`/`var`; a larger literal is also accepted); it is not placed inside a `:focus-visible` rule; no `scroll-padding` and no `scroll-snap-*` anywhere in `src/*.css`; `.weather-form__suggestions` keeps `overflow-y: auto` (no `overflow: visible`); `src/newtab.js` still declares `const POPOVER_MAX_HEIGHT = 240;`, `const POPOVER_MIN_FREE = 96;`, `const POPOVER_GAP = 6;` and `free < POPOVER_MIN_FREE` in `placePopover`; the focus rules (`outline: 2px solid transparent`, `outline-offset: 2px`, `box-shadow: 0 0 0 2px var(--focus-overlay-ring)`) are unchanged; the existing test in `test/newtabSource.test.js` ("modal controls get a transparent 2px outline only while focused…") stays green after its assertion at `:439` is narrowed (Scope): the resting `.city-modal :is(button, input…)` rule must not declare `outline`, `box-shadow` or `background`, and the new rule does not; the sum of the largest outline extent and one pixel (`2 + 2 + 1`) is not larger than the declared margin.
- Verified by: new `test/focusRingScroll.test.js` and the narrowed assertion in `test/newtabSource.test.js`. Expected before the change: `focusRingScroll` red (no rule); `newtabSource` green before and after the rule (the narrowed assertion is written first and is green on `main`; the unnarrowed one is red once the rule exists, which is why it is edited).

### AS-FR-02 Docked list: the ring is whole on every row, in both directions

- Given: first-run, 3 rows and 8 rows, windows 320x300 and 400x260 (docked, the dialog scrolls), light and dark (`page.emulateMedia({ colorScheme })`, 300 ms wait as in `dg-46`).
- When: the walk.
- Then: before each measurement `activeElement` is the expected row (row index from the step); the list has class `weather-form__suggestions--docked` and the dialog `city-modal__dialog--scroll`; the computed `box-shadow` is the resolved `--focus-overlay-ring` with 2 px spread (characterization); the cut on all four sides against every scrolling ancestor is <= 0.05 px, for every row, down and up.
- Verified by: `dg-52-docked-list-focus-ring.mjs`. Expected before the change: red (cut 2.36 at 320x300 and 2.27 at 400x260 on the middle rows down, 1.64 / 1.73 up with 8 rows; the field ring after ArrowUp back to the field at 400x260 with 3 rows, 1.73 px).

### AS-FR-03 Overlay list that scrolls: the ring is whole

- Given: first-run 1280x800 and 500x600 with 6 rows (the real request count; list capped at 240 px), first-run 320x340 with 8 rows, change mode 400x260 with 3 rows and 320x300 with 6 rows (capped overlay in a low window), light and dark.
- When: the walk.
- Then: the list is NOT docked and its `scrollHeight` is larger than its `clientHeight` in the cases that are meant to scroll (assert both; 6 rows at 1280x800: 254 against 240); no cut on any side, every row, down, up and by Tab, against the list and the dialog.
- Verified by: `dg-52`. Expected before the change: red (cut 2.00 px).

### AS-FR-04 The rest of the Tab walk: the field, the clear button, *Cancel* / *Not now*, *Save*

- Given: first-run 320x300 and 400x260 (3 rows, docked), forced colors off and on (AS-FR-05), light.
- When: after the ArrowDown/ArrowUp walk, focus the field and press Tab through the modal (clear button, rows, dismiss button, Save).
- Then: every stop is whole; the stop order is the field, "Clear city", the N rows in order, the dismiss button ("Not now" in first-run, "Cancel" in change mode), "Save" (assert the order by accessible names). After Save the focus trap returns Tab to the field: that stop is measured too.
- Verified by: `dg-52`. Expected before the change: green in normal rendering for the Tab walk; red for the forced-colors clear button at 400x260 (1.73 px) and, through the walk's ArrowUp step, for the field ring (AS-FR-02, AS-FR-05).

### AS-FR-05 Forced colors: the outline is whole

- Given: `page.emulateMedia({ forcedColors: "active", colorScheme })` (reset to `none` in `finally`, as `dg-50`), dark and light, first-run 320x300 and 400x260 (docked, 3 rows), 1280x800 (overlay, 6 rows), change 400x260 (overlay, 3 rows).
- When: the walk and the Tab walk.
- Then: the computed ring extent of a focused row is 4 px (`outline-style` not `none`, a non-transparent `outline-color`, width 2 px, offset 2 px; read, not assumed); no cut on any side, every stop.
- Verified by: `dg-52`. Expected before the change: red (4.36 / 4.27 px docked, 4.00 px overlay, 1.73 px clear button, field ring after ArrowUp 3.73 px at 400x260 docked).

### AS-FR-06 Lists that do not scroll are untouched

- Given: first-run 320x500 and 1280x800 with 3 rows (no scrolling), first-run 320x300 and 400x260 with 1 row (docked, nothing to scroll in the list), light.
- When: ArrowDown to the first row.
- Then: no cut (they were not cut before); the dialog's `scrollTop` and the list's `scrollTop` are the same before and after the focus move in the windows where the content fits (320x500 with 3 rows, 1280x800 with 3 rows; the 1-row cases may scroll the dialog slightly to reveal the row and the margin: recorded, not asserted). Metrics recorded as absolute numbers and asserted +/- 0.5 px: list height at 1280x800 and 320x500 with 3 rows 134; with 1 row 54; docked 320x300 with 3 rows 134, with 8 rows 334; overlay capped 1280x800 with 6 rows 240; 320x340 first-run with 8 rows 111.4; 500x300 first-run with 8 rows 113.2. These are the `main` numbers; they prove no box moved.
- Verified by: `dg-52`. Characterization: green before and after.

### AS-FR-07 Keyboard behavior is unchanged

- Given: first-run 320x300 (docked, 3 rows) and 1280x800 (overlay, 6 rows).
- When: ArrowDown from the field, ArrowDown to the last row, ArrowDown on the last row (stays), ArrowUp back to the first row, ArrowUp from the first row, Escape.
- Then: ArrowDown focuses the first row (`data-weather-action="select-city"`); ArrowDown on the last row keeps focus there; ArrowUp from the first row focuses the field and the list stays open; Escape closes the list first (the suggestion layer of `escapeLayer`), the modal stays open; the Tab order is the one in AS-FR-04. A mouse click on a row (after the walk, pointer at the row's center) chooses it: the field gets the row's label (existing behavior).
- Verified by: `dg-52` (these steps are the walk itself) plus the existing `13-city-modal`, `dg-47`, `dg-15` untouched.

### AS-FR-08 Layout contracts of the low-window phase are unchanged

- Given: the existing scenarios.
- When: `dg-47`, `dg-45`, `dg-48`, `dg-49`, `15-city-modal-layout`, `13-city-modal`, `dg-15`, `dg-39`, `dg-41` run.
- Then (the runs are sequential, never two harness processes at once): the same results as on unmodified `main`: all green except the known `dg-48` AS-LW-03 (1) and `dg-49` AS-LW-06 (4) at 360 px on a Mac (backlog item 8); no new failure. The run record states the counts before and after.
- Verified by: the existing E2E suite (`node .private/e2e/run.mjs --repo . --base 67b3e32`) and `npm test`.

### AS-FR-09 Ring color and contrast are unchanged

- Given: first-run 1280x800, 3 rows, both themes.
- When: focus is on a row (ArrowDown).
- Then: the computed `box-shadow` is `--focus-overlay-ring` (`rgb(17 19 24 / 55%)` light, `rgb(244 246 248 / 60%)` dark) with 0 offset, 0 blur, 2 px spread; the row background is `--soft-fill-strong` (unchanged, as `test/newtabSource.test.js:435` asserts for the source).
- Verified by: `dg-52` (characterization, green before and after); existing `dg-41`.

### AS-FR-10 Docs and changelog

- Given: `CHANGELOG.md`, `docs/design-system.md`.
- When: read after the change.
- Then: `CHANGELOG.md` `[Unreleased]` / `Fixed` has an entry (suggested: "City dialog: when you move through the city suggestions with the arrow keys or Tab and the list scrolls, the focus ring is no longer cut off on its top or bottom edge. E2E: `dg-52-docked-list-focus-ring.mjs`."); `docs/design-system.md` states the `scroll-margin` rule for scrolling overlays in "Adding new UI" item 4 and in the `.weather-form__suggestions` row.
- Verified by: `test/focusRingScroll.test.js` (the changelog line mentions `dg-52`, the design-system text contains `scroll-margin`). Expected before Task 3: red on these docs checks only (the code assertions turn green with Task 2).

## Review focus

- **Scenarios and states:** the keyboard walk through a scrolling list in each mode: docked (low window, dialog scrolls) and capped overlay (normal desktop with the real 6 results). Look at the first, a middle and the last row, ArrowUp from the bottom, and the first Tab into the list. Does the ring look whole on the edge that was cut, in both themes?
- **Visual and layout:** the 5 px margin reveals a little more of the neighbouring row when focus scrolls; check that no row looks jumpy and that the docked list at 320x300 and 400x260 and the overlay at 1280x800 look as before at rest. All box sizes must be exactly as on `main` (AS-FR-06 numbers).
- **Accessibility and text:** forced colors (the 4 px outline is the case that needed the 5 px), the clear button, *Save* and *Cancel* reach. No new text.
- **Risk of the fix itself:** `scroll-margin` on `button` and `input` of the city modal also applies when the modal opens (change mode focuses the field) and when Tab or Shift+Tab reaches *Save* at the end of a scrolled dialog; confirm nothing scrolls differently at rest or hides the title.
- **Not covered:** `.desktop-dialog` controls in a low window (Add link measured, 0 px; Edit link, weather edit and delete confirm not measured).

## Changes after review

Review report: `quiet-tab-notes/pipeline/reports/docked-list-focus-ring-spec-review.md`.

- **C1** (closed, variant a): the exact selector made `test/newtabSource.test.js:439` red. Scope, AS-FR-01 and plan Task 2 now include narrowing that assertion to the invariant "no `outline`/`box-shadow`/`background` on a resting `.city-modal :is(button, input…)` rule"; the false statement "assertions at :435 stay green" removed. The test edit itself is the implementer's.
- **I1** (closed): "the field" removed from "Not cut anywhere"; a Measurements row for the field ring after ArrowUp (1.73 px docked, 3.73 px forced colors 400x260, 320x300 not cut); AS-FR-02, AS-FR-05, AS-FR-04 expected-red lists and Accepted exceptions updated; plan M3 reason corrected.
- **I2** (closed): Add link measured (0 px base and prototype); other dialogs "not measured" in Scope, Non-goals and Review focus. Scope stays `.city-modal`.
- **I3** (closed): Process and AS-FR-08 require sequential harness runs; `dg-52` waits for `.weather-form__suggestion` plus 450 ms, and after reload or resize.
- **M1** (closed): literal `5px` only in AS-FR-01.
- **M2** (closed): AS-FR-04 measures the stop after Save (Tab returns to the field).
- **M3**: no change (4 px is not enough, 5 px confirmed).
- **M4** (closed): AS-FR-10 expected red before Task 3 on docs checks only.
