# Overlay modals: unified actions, dialog forms, city modal

## Status

`draft` (product-approved target 2026-10-06; pipeline sections added for run #16; revised after spec review round 1, see § Changes after review).

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-06 | Unify modal footers (50/50, icons), Direction B/D for desktop dialogs, city modal without feedback reserve and without "Current:", hide-weather confirm with distinct icon from delete; visual canon = right column of `approved-target-comparison.html` §4–12. | `confirmed` | Commit `429b7bd`, mockups under `docs/superpowers/mockups/2026-10-06-overlay-modals/` |

## Current behaviour (`main` at `429b7bd`)

- Desktop dialogs use `.favorite-form__footer` with `border-top` and `padding: var(--form-footer-padding-y) 0` (14px) (`src/controls.css:93-99`); rows carry `border-top` and 12px vertical padding (`controls.css:34-44`). The Edit link footer holds **Delete** on the left (`newtab.js:440-446`); at `max-width: 400px` Delete takes its own full-width row (`surfaces.css:184-219`, edit-link only).
- Confirm delete uses `justify-content: flex-end` (not 50/50) (`surfaces.css:291-299`); `.button--danger` carries `margin-right: auto` (`controls.css:101-103`).
- Edit weather has `.desktop-dialog__city` (city name + `text-button` "Change city" / "Set a city") (`newtab.js:1356-1366`, `surfaces.css:301-314`), not a form row control.
- Segmented controls inside dialogs use the global primary fill (`controls.css:144-148`). `createSegmentedControl` has no caller outside dialogs (`newtab.js:396, 415, 484`).
- City modal: paragraph `Current: …` in change mode (`newtab.js:931`); `.city-modal__feedback` has a permanent two-line `min-height` and `placePopover` shrinks it via `--city-feedback-reserve` / `city-modal__dialog--compact` (`newtab.js:671-700`, `surfaces.css:97-105`, `docs/city-modal-low-window.md`, `docs/dialog-threshold-jump.md`). The change-mode input starts empty (`newtab.js:615`).
- Weather metric **−** hides immediately (`hideWeatherMetric`, `newtab.js:1496`), no confirmation dialog.

## Default decisions (owner can override)

1. **One pipeline run (#16), one implementation PR** — styles/DOM and flows ship together so the final gate can match mock §4–12 including hide confirm and city prefill.
2. **Supersede the city feedback reserve** — remove permanent `min-height`, `--city-feedback-reserve`, `city-modal__dialog--compact` and `feedbackReserve` (`src/cityPrompt.js:35`) with its tests; errors may move the field and the buttons (accepted). `placePopover` keeps docked/overlay list logic only.
3. **Canonical pixels** — right column of [`approved-target-comparison.html`](superpowers/mockups/2026-10-06-overlay-modals/approved-target-comparison.html) at modal width 420px, light theme; §1–3 unchanged. Where this spec and the mock disagree, the mock wins and its CSS is the check (its lines 40–54). Known gap: the mock's `css/` folder has no `surfaces.css`, so text-to-buttons spacing in confirm dialogs (body margin) cannot be read from it; the spacing contract below governs there.
4. **Tokens follow the mock** (reason: the approved visual is what the owner signed off) — dialog form-row padding **10px** (token `--form-row-padding-y` changes 12px → 10px; its only consumer is the dialog row, `controls.css:38`), icon–label gap in modal action buttons **8px** (= `--form-footer-gap`; `--control-gap-icon` stays 6px for every other button and segmented), `--modal-actions-margin-top` **16px**. `--form-footer-padding-y` has no consumer after the footer padding goes (`grep` over `src/`: `controls.css:97` only), so it is deleted.
5. **Error spacing follows the mock** (reason: mock line 51 `margin: 8px 0 0`): **8px** from the field/last row to the error text, **16px** from the error text to the buttons. `.desktop-dialog__error` becomes `margin: 8px 0 0` (today `12px 0`, `surfaces.css:221`); the confirm body loses its `4px` bottom margin so text → buttons is exactly 16px.
6. **Hide confirm title** — `Hide ${metric}?` with the metric name in lower case, except the acronym: `Hide temperature?`, `Hide precipitation?`, `Hide air quality?`, `Hide UV index?` (implemented as an explicit four-entry map next to `METRIC_LABELS`, `newtab.js:590`). A hint tile (`weather:hint`) stands for the first enabled metric, so its − opens the confirm for that metric (its badge carries `data-remove-for` = that metric id, `newtab.js:1246-1250`, `1519`).
7. **Hide uses primary + `eyeOff`**, not `button--danger` — to tell it from Delete link (`trash2`, danger). Reason: hiding is reversible from Add, deleting is not.
8. **Dialog kind for hide** — `confirm-hide-weather` in `DIALOG_KINDS` (`src/desktopUiState.js:3`); behaviour in § Hide confirm contract and AS-MO-09, AS-MO-16.
9. **City prefill (change mode)** — the input is prefilled with the stored city's display label: `name, country`, or only `name` when `country` is empty (admin1 is not stored, `src/weatherStore.js:13-24`, so the label can be shorter than the suggestion label `name, admin1, country` the user once picked, `newtab.js:703`; accepted). The stored city is also set as `chosenCity` (label = the prefilled text), so **Save without editing** calls `weatherService.selectLocation` with the stored coordinates (no geocoding, `newtab.js:1008-1013`). Editing the text drops `chosenCity` as today and Save runs `setCity`. Caret: change mode puts the caret **at the end, no selection** (`setSelectionRange(len, len)`, no `select()`); first-run mode has no prefill, no focus and no selection (it never steals focus, `newtab.js:1052`). **Clear** empties the field; Save with an empty field reports `Enter a city name`.
10. **City-field is one `<button type="button">`** in the City row (not a link, not a second control), with `aria-labelledby` naming the row label, the city value and the visible hint so the visible text is part of the accessible name (WCAG 2.5.3). It keeps `data-weather-action="open-city-modal"` and the value node keeps `data-weather-dialog-city` (focus return and E2E depend on them).
11. **Error-driven layout** — after an error is shown or cleared, `placePopover` runs again (`syncCityModal` already does on show, `newtab.js:942-955`; `clearCityError` gains the call and its pin is rewritten). The input may move when the dialog height changes (Accepted exceptions).
12. **Selected segment** — soft fill + font weight 600 + inset 1px `--border-control` ring, as in the approved mock. The contrast of the soft fill alone is low (measured in the review run: `--color-fill-soft-strong` on the panel 1.25:1); this is an accepted exception (owner approved the mock). Forced colors drop fill and ring; the selected option then stays distinguishable by font weight and the group's own border only. No new CSS for forced colors and **no new animation or transition** anywhere in this phase.
13. **Mock deviation (known)** — mock §11 draws the city-field without the "Change" hint, §7 with it. The spec requires the hint always (it is the visible affordance; §7 is the canon for the field).
14. **Data compatibility: not required (no-users policy, `agent-config/CLAUDE.md`)**. Storage is unchanged.

## Visual reference

| Reference | Path |
|-----------|------|
| Production baseline (audit) | [`docs/superpowers/mockups/2026-10-06-overlay-modals/baseline-production-catalog.html`](superpowers/mockups/2026-10-06-overlay-modals/baseline-production-catalog.html) |
| **Development target** | [`docs/superpowers/mockups/2026-10-06-overlay-modals/approved-target-comparison.html`](superpowers/mockups/2026-10-06-overlay-modals/approved-target-comparison.html) |

Mock sections **4–12** (target column) = mandatory visual acceptance. Sections **1–3** = no change.

## Goals

1. Unified **modal actions** footer (two buttons, 50/50, icons).
2. Unified **vertical rhythm** from content to actions (no extra horizontal dividers or double bottom inset).
3. Add link / Edit link / Edit weather — Direction **B** + **D** (below).
4. City modal — no feedback reserve, no "Current:"; change city with **prefill**.
5. Delete link vs hide weather — different semantics and **different commit icons** (`trash2` vs `eyeOff`), the hide gets its own confirm.

## Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--modal-actions-margin-top` (**new**, `src/design-tokens.css`) | **16px** | From the last content, row or error text to the **top** of the modal actions row |
| `--form-row-padding-y` (**value changes 12px → 10px**) | **10px** | Vertical padding per dialog form row (rows have no borders) |
| `--form-footer-padding-y` (**deleted**) | — | No consumer after the footer padding goes; removed from `design-tokens.css:59`, `controls.css:97`, `docs/design-system.md:106` |

Existing (values unchanged; usage updated):

| Token | Value | Use |
|-------|-------|-----|
| `--surface-modal-padding` | **20px** | Card padding; **only** bottom inset under buttons |
| `--surface-modal-max-width` | **420px** | `min()` with viewport margin |
| `--form-footer-gap` | **8px** | Gap between the two action buttons **and** between a modal action button's icon and label |
| `--control-height` | **40px** | Min-height of buttons, fields, city-field |
| `--control-gap-icon` | **6px** | Icon–label gap in every button **except** modal action buttons; segmented options |
| `--form-row-gap` | **12px** | Label ↔ control in a row (Direction B) |
| `--font-size-sm` | **13px** | Row labels |
| `--font-size-title` | **18px** | Modal titles |
| `--title-margin-bottom` | **12px** | Below title |

Local values (not tokens): error text `margin: 8px 0 0` in `.desktop-dialog__error` and in `.city-modal__feedback .status--error`; city-field hint `font-size: 12px` (no token exists; `--font-size-sm` is 13px).

### Spacing contract (measured anchors)

Measured with `getBoundingClientRect()` in light theme, modal width 420px (viewport 1280×800), dialog not scrolled, tolerance **±0.5px**. "Row" = the border box of the last `.favorite-form__row`; "footer" = `.favorite-form__footer` or `.city-modal__actions`.

| From | To | Value |
|------|----|-------|
| Title bottom | first content top | 12px (unchanged) |
| Last row bottom | footer top (no error) | **16px** |
| Last row bottom | visible error top | **8px** |
| Visible error bottom | footer top | **16px** |
| Confirm body bottom (`.desktop-dialog__body`) | footer top (no error) | **16px** |
| Confirm body bottom | visible error top / error bottom → footer top | **8px** / **16px** |
| City input bottom (list closed) | footer top (no error; `.city-modal__feedback` height 0) | **16px** |
| City input bottom | visible error top / error bottom → footer top | **8px** / **16px** |
| Footer buttons bottom | dialog padding-box bottom (`rect.bottom` − border width) | **20px** |
| Left / right button | width difference; gap between them; height | ≤ 0.5px; **8px**; ≥ 40px |
| Button icon right edge | label left edge (Range rect of the text) | **8px** |
| Dialog row | computed `border-*-width`, `padding-top/bottom` | 0px; **10px** |
| Footer | computed `border-top-width`, `padding-top/bottom` | 0px; 0px |

**Anti-patterns:** no `--form-footer-padding-y`; no summing `--surface-modal-padding` with extra footer padding; no `border-top` on `.favorite-form__row` inside desktop dialogs; no `border-top` on the actions row; no `min-height` reserve on `.city-modal__feedback`; no bottom margin on `.desktop-dialog__error` or `.desktop-dialog__body` (the 16px comes only from `--modal-actions-margin-top`); no hardcoded `16px` on `.city-modal__actions`.

## Modal actions (desktop dialogs §4–7, §12; city modal §8–11)

- **Count:** exactly **2** buttons.
- **Layout:** `display: flex`; `gap: var(--form-footer-gap)`; each button `flex: 1`; `min-height: var(--control-height)`; `justify-content: center`; icon + label; icon gap `var(--form-footer-gap)` (8px, mock lines 44–45).
- **Margin above row:** `margin-top: var(--modal-actions-margin-top)` (**16px**).
- **Order:** secondary (Cancel / Not now) **left**; commit **right**.
- **States:** Save in **Edit weather** is disabled at rest and enabled only after the size changes (`newtab.js:1376`, kept; mock §7 draws it so); Save in the city modal is disabled only while the field is empty or a request runs (`newtab.js:650-655`); buttons are disabled while a write runs (`favoritesBusy`).

### Footer rules removed or rewritten (by name)

| Where | Rule | Change |
|-------|------|--------|
| `src/controls.css:93-99` | `.favorite-form__footer` `padding`, `border-top` | removed; `margin-top: var(--modal-actions-margin-top)`, `gap` kept |
| `src/controls.css:101-103` | `.favorite-form__footer .button--danger { margin-right: auto }` | deleted |
| `src/surfaces.css:206-218` | `data-dialog="edit-link"` footer wrap, `> .button`, `> .button--danger` inside `@media (max-width: 400px)` | deleted (no Delete there) |
| `src/surfaces.css:291-299` | `data-dialog="confirm-delete"` `justify-content: flex-end`, `margin-top: 12px`, `.button--danger { margin-right: 0 }` | deleted; 50/50 like every dialog |
| `src/surfaces.css:285-289` | `.desktop-dialog__body { margin: 0 0 4px }` | `margin: 0` |
| `src/surfaces.css:221-225` | `.desktop-dialog__error { margin: 12px 0 }` | `margin: 8px 0 0` |
| `src/surfaces.css:66-70` | `.city-modal__actions { margin-top: 16px }` | `var(--modal-actions-margin-top)` |
| `src/surfaces.css:97-105` | `.city-modal__feedback { min-height: var(--city-feedback-reserve, …) }` and its comment | no `min-height`; `margin: 0; padding: 0` |
| `src/surfaces.css:84-89` | `.city-modal__current` in the selector list | removed |
| `src/surfaces.css:301-314` | `.desktop-dialog__city`, `.desktop-dialog__city-name` | deleted |
| `src/surfaces.css:260-262`, `src/controls.css:233-251` | `.desktop-dialog .text-button:focus-visible`, `.text-button`, `.text-button:disabled` | deleted (its only user is the old city row, `newtab.js:1359`) |

### Commit icons (`icons.js`; `eyeOff` already exists at `icons.js:26`)

| Modal | Right label | Class | Icon |
|-------|-------------|-------|------|
| Add link | Add | `button--primary` | `check` |
| Edit link | Save | `button--primary` | `check` |
| Edit weather | Save | `button--primary` | `check` |
| City modal | Save | `button--primary` | `check` |
| Delete link? | Delete | `button--danger` | `trash2` |
| Hide <metric>? | Hide | `button--primary` | `eyeOff` (not `trash2`) |

Secondary: **`x`** + Cancel or Not now.

### Copy (English UI; all texts set through `textContent`, see § UI strings and states)

| Mock § | Title | Body | Buttons |
|--------|-------|------|---------|
| 6 | Delete link? | This removes the link from your grid. | Cancel \| Delete |
| 12 | Hide temperature? / Hide precipitation? / Hide air quality? / Hide UV index? | This hides the tile from your grid. You can add it again from Add. | Cancel \| Hide |

First-run city description paragraph — **unchanged**.

## Direction B — desktop form dialogs

**Scope:** `.desktop-dialog` forms (Add link, Edit link, Edit weather).

1. Remove `border-top` on `.favorite-form__row` in modals; `padding: var(--form-row-padding-y) 0` (10px).
2. Keep **100px** label column (`--form-label-width`); the `max-width: 400px` label-above-control layout (`surfaces.css:184-203`) stays and also applies to the city-field.
3. **Segmented (scoped):** checked option inside `.desktop-dialog` uses soft fill, not `var(--primary)`:

   ```css
   .desktop-dialog .segmented__option:has(input:checked) {
     background: var(--soft-fill-strong);
     color: var(--text);
     font-weight: var(--font-weight-control);
     box-shadow: inset 0 0 0 1px var(--border-control);
   }
   ```

   The global rule (`controls.css:144-148`) stays as is; it has no consumer outside dialogs today and remains the base (AS-MO-11). Selected-state distinguishability: Default decision 12.

4. Unified modal actions row (no footer `border-top`). Confirm delete — 50/50, not `justify-content: flex-end`.

**Edit link:** Cancel \| Save only — **no** Delete in the footer (delete only via edit mode − → Delete link?); `createFavoriteForm` no longer builds the Delete button and the edit-dialog Delete click wiring (`newtab.js:1327-1333`) is removed.

## Direction D — edit weather city row

Replace `.desktop-dialog__city` + `text-button`. Row label **City** (`createFormRow` today attaches `aria-labelledby` only to an INPUT or a radiogroup, `newtab.js:357-361`; it is extended so a button control gets `aria-labelledby`, see below).

**city-field** (`<button type="button" class="city-field">`), looks like `.favorite-input`: `min-height: var(--control-height)` (40px), `border: 1px solid var(--border-control)`, `border-radius: var(--radius-control)`, `padding: 0 var(--control-padding-x)`, panel background, full width of the control column (`flex: 1; min-width: 0`, `flex: 1 1 100%` under 400px next to the other controls, `controls.css:53-54`, `surfaces.css:194-197`). Children: value `<span data-weather-dialog-city>` (truncated, `text-overflow: ellipsis`, `white-space: nowrap`, `min-width: 0`, `flex: 1`) and hint `<span>` (12px, `--muted`, `flex: none`).

| State | Value | Hint | Notes |
|-------|-------|------|-------|
| City set | display label (`name, country`, or `name`) | `Change` | |
| No city, or city read error (`weatherLocationError`) | `No city set` | `Set a city` | same row, same control |
| `weatherService` missing | as above | as above | `disabled` (look = `--control-disabled-opacity`, like `.button:disabled`); not focusable |
| `weatherBusy` or `favoritesBusy` | unchanged | unchanged | click ignored (as today, `newtab.js:1364`); not disabled |
| Long name | ellipsis | hint stays visible | full label in the `title` attribute |

- **Accessible name:** `aria-labelledby="<row label id> <value id> <hint id>"`, no `aria-label`; e.g. `City Zürich, Switzerland Change`, `City No city set Set a city`.
- **Focus ring:** like `.favorite-input` in dialogs (`surfaces.css:246-249`): `.desktop-dialog .city-field:focus-visible { background: var(--soft-fill); box-shadow: 0 0 0 2px var(--focus-overlay-ring); }`; the transparent outline for forced colors comes from the shared `.desktop-dialog :is(button, input):focus-visible` rule (`surfaces.css:241-244`). `test/focusTokens.test.js:80` replaces the `.text-button` entry with `.desktop-dialog .city-field:focus-visible`.
- **Hint contrast:** `--muted` on the panel, light theme, ≥ 4.5:1 (5.84:1 measured in the review run).
- **Activation:** Enter and Space (native button) open the city modal (change mode) stacked over the weather dialog; the opener selector `WEATHER_DIALOG_CITY_SELECTOR` is unchanged, so closing the city modal returns focus to the city-field.
- **Tab order** inside the Edit weather dialog: City → Size (one stop) → Cancel → Save (Save skipped while disabled) → wraps to City (existing trap, `newtab.js:2417-2441`).
- `syncWeatherDialogCity` (`newtab.js:1402`) updates the value, hint, `title` and the `disabled` state after the city modal closes.

Size row: Direction B segmented.

## City modal

1. Remove permanent `min-height` on `.city-modal__feedback` and all `--city-feedback-reserve` / `city-modal__dialog--compact` / `feedbackReserve` logic in `placePopover`. The wrapper `div.city-modal__feedback` stays (no role, no aria, no text of its own).
2. Errors: `.status--error` is visible only when there is text; **8px** above it (from the input), **16px** below it (to the actions); the card may grow when an error appears (Accepted exceptions). The slot keeps `role="alert"` on the same node.
3. Change city: remove `.city-modal__current` / "Current: …" (`newtab.js:930-933`); **prefill** per Default decision 9. `createCityForm(mode)` receives the location (`buildCityModal` already has it).
4. Actions: same modal-actions rules; `margin-top: var(--modal-actions-margin-top)` on `.city-modal__actions`.
5. **`placePopover` after the change** keeps these steps in order: drop the docked class and the scroll class; measure `free = innerHeight − input.bottom − POPOVER_GAP − VIEWPORT_MARGIN` and `tooTall` (dialog taller than `innerHeight − 2 × VIEWPORT_MARGIN`); toggle docked (`free < POPOVER_MIN_FREE`) and scroll (`docked || tooTall`); set the list `max-height`; restore `scrollTop`. Gone: `reserve`, `base`, `kept`, `--city-feedback-reserve`, `city-modal__dialog--compact`, the `feedbackReserve` import (`newtab.js:39`). Thresholds `POPOVER_MIN_FREE` / `POPOVER_GAP` / `POPOVER_MAX_HEIGHT` are unchanged; the window heights at which the list flips move, because the resting dialog loses the 39.2px reserve (the harness measures the heights, never types them).
6. `clearCityError` (`newtab.js:835`) keeps its body and then calls `placePopover()`; `syncCityModal` already ends with `activeCityForm?.place()`.

## Hide confirm contract

Edit mode − on an enabled weather tile (or on the hint tile, which stands for its metric) opens `confirm-hide-weather` for that metric; `handleEditModeClick` no longer calls `hideWeatherMetric` directly. The dialog is built like confirm delete: title, body (`aria-describedby`), error slot, footer; the opener is `{ id: metricId, badge: true }`.

1. **Neighbour:** `domId` (the tile the − sits next to: `badge.previousElementSibling?.dataset.widgetId ?? item.id`, `newtab.js:1519`) is computed **when Hide is pressed**, from the opener's − badge, then `neighborTargets(domId)` gives the focus targets. For a hint tile `domId` is `weather:hint`, the write target is the metric.
2. **Success:** one `updateWeatherMetric(metricId, { enabled: false })` write; the dialog closes; focus goes to the next tile in DOM order, else the previous, else Settings (`closeDesktopDialog({ restoreFocusTo: next })`); the polite live region says `<Metric> hidden` (`Temperature hidden`, `Precipitation hidden`, `Air quality hidden`, `UV index hidden`), same mechanism as `Link deleted`.
3. **Write failure:** the message goes to the page alert `#desktop-status` (`role="alert"`), the dialog closes, focus returns to the − badge of that metric (pattern of `confirmDeleteFavorite`, `newtab.js:1485-1493`; `dg-37` hide UV stays green with the new step). The tile stays shown and stored enabled.
4. **Cancel, Escape, backdrop:** close without a write; focus returns to the − badge; while a write runs (`favoritesBusy`) all three do nothing.
5. **Initial focus:** Cancel (first button; `openDesktopDialog` focuses the first `input, button`).
6. **Repeat press:** a second Hide press while the write runs does nothing (`favoritesBusy` guard); exactly one storage write happens.
7. **Metric already hidden in another tab:** the page has no `storage.onChanged` listener, so the open dialog is not updated; the write is idempotent (`widgetsService.updateWeatherMetric` finds the item and keeps `enabled: false`, `widgetsService.js:317-352`), the dialog closes as in the success path. Opening the confirm for a metric that is not enabled in the page's own state throws `Weather tile not found` in `buildDialogContent`, same as `edit-weather` (`newtab.js:1353`).
8. **Restore path:** the body's "add it again from Add" is true for every metric including a hint's: Add menu → `restore-weather` → metric name (`fillAddMenu`, `newtab.js:1574`).

## Product flows

| Flow | Behaviour |
|------|-----------|
| Delete favorite | Edit mode − → Delete link? → Delete |
| Edit link | No Delete button in the dialog |
| Hide weather metric | Edit mode − → Hide <metric>? → Hide (§ Hide confirm contract) |
| Change city | Prefill input; open from city-field (stacked) or from the hint tile |

## UI strings and states

All strings are set with `textContent` / text nodes (no `innerHTML`; `test/newtabSource.test.js` already pins this, `newtab.js` has none). New or changed strings:

| String | Where it is visible |
|--------|---------------------|
| `Hide temperature?`, `Hide precipitation?`, `Hide air quality?`, `Hide UV index?` | confirm-hide title (`aria-labelledby`) |
| `This hides the tile from your grid. You can add it again from Add.` | confirm-hide body (`aria-describedby`) |
| `Hide`, `Cancel` | confirm-hide buttons |
| `Temperature hidden`, `Precipitation hidden`, `Air quality hidden`, `UV index hidden` | polite live region after a successful hide |
| `City` (row label), city label / `No city set`, `Change` / `Set a city` | city-field; also its accessible name and `title` |
| `Zürich, Switzerland`-style label | city modal input in change mode (prefill) |
| Removed: `Current: <name>`, `Change city` (button text) | — |
| Unchanged: city error texts, `Enter a city name`, first-run description, Delete link copy, all Add/Edit labels | — |

## Scope

Code:
- `src/design-tokens.css`: add `--modal-actions-margin-top`; `--form-row-padding-y: 10px`; delete `--form-footer-padding-y` (line 59).
- `src/controls.css`, `src/surfaces.css`: per § Footer rules removed or rewritten, Direction B/D styles, city-field, scoped segmented, city feedback/error spacing, deleted `.desktop-dialog__city*` and `.text-button`.
- `src/newtab.js`: dialog footers and `createFavoriteForm` (no Delete); `confirm-hide-weather` branch of `buildDialogContent`, `handleEditModeClick` and a confirm-hide runner (replaces the direct call to `hideWeatherMetric`); city-field row and `createFormRow` for a button control; `syncWeatherDialogCity`; city prefill (`createCityForm(mode, location)`, `chosenCity`, caret) and removal of `.city-modal__current`; `placePopover` simplification and `clearCityError` call; no `widgetsService` API changes.
- `src/desktopUiState.js`: `confirm-hide-weather` in `DIALOG_KINDS`.
- `src/cityPrompt.js:35`: delete `feedbackReserve`; remove the import at `src/newtab.js:39`.

Unit / source tests (rewrite or add):
- `test/cityPrompt.test.js:84-135` (`feedbackReserve` block) and its import at `:3`: delete.
- `test/cityModalFeedback.test.js`: rewrite `:21-27` (the `clearCityError` pin gains `placePopover()`), `:36-39` (reserve rule), `:42-48` and `:61-95` (`placePopover` step order, `feedbackReserve` import, `--city-feedback-reserve` CSS pins) for AS-MO-14, AS-MO-15, AS-MO-17.
- `test/newtabSource.test.js`: `:271` (Delete button pin: confirm-delete only, plus a negative pin for `createFavoriteForm`), `:526` (`"Current: "` removed from the string list), `:600` (cityPrompt import), `:853-885` (Task 10 pins: `syncWeatherDialogCity` strings, `WEATHER_DIALOG_CITY_SELECTOR`, `hideWeatherMetric`, the `confirm-hide-weather` case), `:900` (`hideCityModal` + `syncWeatherDialogCity`), `:1014-1015` (narrow edit-link footer pins: delete); new pins for the scoped segmented rule and the global rule (AS-MO-11), tokens and rows (AS-MO-15).
- `test/desktopUiState.test.js`: pin `confirm-hide-weather` in `DIALOG_KINDS`.
- `test/focusTokens.test.js:80`: `.text-button` entry → `.desktop-dialog .city-field:focus-visible`.

E2E (notes repo, `.private/e2e/scenarios/`):
- New `dg-58-modal-overlay.mjs`: group *n* = AS-MO-*n* for every scenario that has an E2E (AS-MO-11 and AS-MO-15 are unit-only, no group).
- Rewrite or retire (reserve): `dg-48-city-modal-low-window.mjs`, `dg-49-city-modal-placement-order.mjs`, `dg-53-dialog-threshold-jump.mjs`, `lib/cityModalSweep.mjs` (`COMPACT`, `PROP`, `reserveCss`, lines 10-13, 86-95); `dg-47-city-error-ux.mjs` (AS-CE-04/05 no-shift, 0px gap); `15-city-modal-layout.mjs` (the three checks named in `docs/city-error-ux.md`, `"Current: X"` comment at `:102`).
- Rewrite (changed DOM or numbers): `dg-04-edit-favorite.mjs:85-90` (Delete in the edit dialog → absent); `dg-51-button-border-contrast.mjs` (`:99-101` openDelete via edit, `:162-163`, `:299-306` Delete full width at 400px, `:322` and reference keys `*/edit-link/delete` at `:10, :12`, `:349-350` AS-BB-09 `.text-button`); `dg-46-control-border-contrast.mjs:136-139` (row `border-top`); `dg-37-write-failure.mjs:83-85` (gap to the footer divider) and `:52-55` (hide UV now through the confirm); `dg-07-hide-weather.mjs:31, :36, :39` (no dialog for a weather −, focus rules); `dg-41-control-metrics.mjs` (`:53` city open, `:85`, `:118-136` city modal metrics, title margin); `10-weather-grid-states.mjs:16, :143, :162`; `13-city-modal.mjs:43-48, :86, :91, :104, :135, :196, :447, :515-519` (city row line, `Current: Tbilisi`, `.desktop-dialog__city`, button text `Change city`); `dg-29-weather-modal.mjs:36, :77, :85` (city row text button, focus return); `dg-39-dialog-narrow.mjs:81` (`[data-weather-dialog-city]` in the control sweep) and `:103-116`.
- Re-check (selectors `data-weather-action="open-city-modal"` and `data-weather-dialog-city` are kept): `dg-15`, `dg-23`, `dg-25`, `dg-32`, `dg-40`, `dg-45`, `dg-50:192-197`, `dg-52`, `dg-54:56`, `dg-47:68`.
- Full E2E `--base origin/main`; every touched scenario is named in the run record.

Docs:
- `docs/design-system.md`: tokens (`:99`, `:104` row padding 10px, `:106` footer padding row deleted), `.text-button` section and mentions (`:33`, `:87`, `:127`, `:226-228`), `.desktop-dialog__city` (`:245`), city modal controls (`:268`), Edit weather (`:536`), AS-DS-1 and AS-DS-10 wording (`:551`, `:626`), modal actions, dialog segmented, city-field, city error spacing.
- `docs/architecture.md`: `:208` (the "Change city" button), `:255-266` (error line, feedback block, reserve → 8/16px, no reserve), `:300-301`; hide confirm paragraph.
- Amend or supersede (see § Superseded scenarios): `docs/city-modal-low-window.md`, `docs/dialog-threshold-jump.md`, `docs/city-error-ux.md`.
- `CHANGELOG.md` `[Unreleased]`; private `agent-config/CLAUDE.md` (dialog kinds, city prefill).

## Superseded scenarios (retire or rewrite)

| Earlier spec | Scenarios | Fate |
|--------------|-----------|------|
| `docs/city-modal-low-window.md` | AS-LW-01 (buttons visible at rest) | rewritten as AS-MO-13 |
| | AS-LW-02, AS-LW-03, AS-LW-04 (reserve, compact, error in a compact window) | retired; list-order part of AS-LW-06 (`dg-49`) rewritten without reserve numbers |
| | AS-LW-05 (docs say what the product does) | rewritten: docs updated in this phase |
| `docs/dialog-threshold-jump.md` | AS-DJ-01, 02, 03, 05, 07, 08, 11, 12 (reserve continuity, `feedbackReserve` unit, source guards, 360px failures of the reserve) | retired with `dg-53` and `feedbackReserve` |
| | AS-DJ-04, AS-DJ-06, AS-DJ-09, AS-DJ-10 (list flip, window-not-history, widths/themes, keyboard) | restated without reserve inside AS-MO-14, AS-MO-17, AS-MO-18, AS-MO-12 |
| `docs/city-error-ux.md` | AS-CE-04 (no shift), AS-CE-05 (reserved room, 0px gap, 39.2px block) | retired (Accepted exceptions) |
| | AS-CE-01, 02, 03 (error clearing on edit, list inside viewport) | kept; AS-CE-02 wording loses "at rest, with the reserve" |

## Process

Full UI-phase cycle: this spec → spec review and spec gate → plan in `quiet-tab-notes/superpowers/plans/2026-10-06-modal-overlay-design.md` → E2E-first implementation → checkpoint and final design review → independent verification → merge. Implementation branch from `main` at spec gate pass.

## Non-goals

- Tooltip, desktop status chip, add menu (mock §1–3).
- Dark-theme pixel parity unless called out in Accepted exceptions (gate uses light theme at 420px modal width).
- Sticky action rows or auto-scroll to keep buttons visible when a tall error appears in a low window (accepted: scroll the dialog).
- Windows lower than 280px (320 wide) / 280px (400 wide) for the city modal at rest: out of scope.
- New persisted fields or layout version changes. Data compatibility: not required (no-users policy, `agent-config/CLAUDE.md`).
- Changing first-run city description copy, city error **texts**, or `placePopover` thresholds `POPOVER_MIN_FREE` / `POPOVER_GAP` / `POPOVER_MAX_HEIGHT`.
- New animations, transitions or live regions beyond the single `<Metric> hidden` announcement.

## Accepted exceptions

- **City error moves the field and the buttons** — no permanent feedback reserve; showing or clearing an error changes the dialog height, and because the dialog is centered the dialog is centered, so the input moves up and the buttons down by half of (8px + error height) each (reverses `docs/city-error-ux.md` decision 3, AS-CE-04, AS-CE-05 where this spec applies).
- **Low window with error** — in a viewport that already scrolls the city dialog, a visible error may push Save/Not now out of view; full error text is shown, Enter/Submit still work.
- **Docked vs overlay suggestions list** — flip band and overlay list height step from `docs/dialog-threshold-jump.md` may remain for list placement; only reserve-related compact behaviour is removed. If visual review finds a regression in list mode, fix within `placePopover` without reintroducing a permanent reserve.
- **Hide uses primary + eyeOff** — not `button--danger`, to distinguish from Delete link.
- **Selected segment contrast** — Default decision 12: soft fill 1.25:1 against the panel, accepted; weight + inset ring + (forced colors) weight and group border are the cues.
- **Prefill label shorter than the suggestion label** — admin1 is not stored (Default decision 9).
- **Mock §11 lacks the "Change" hint** — Default decision 13.
- **Save in the change modal without editing re-selects the stored city** — it calls `selectLocation` (a weather refresh), not a no-op.

## Acceptance scenarios

Common setup unless stated: unpacked extension in the E2E harness; light theme; viewport **1280×800** unless a scenario names another size; a stored city **Zürich, Switzerland** (country `Switzerland`, or harness default) for change-mode tests; edit mode entered via long-press Settings or harness helper; strings through `textContent` only. Measurements: `getBoundingClientRect()`, tolerance ±0.5px, anchors as in § Spacing contract. E2E `dg-58` group *n* = AS-MO-*n*.

### AS-MO-01 Add link — modal actions and Direction B
- Given: edit mode; Add tile opens Add link (also reachable outside edit mode).
- When: the dialog is open at rest; then a validation error appears (empty URL, Add pressed).
- Then: dialog rows have computed `border-top-width` 0 and vertical padding 10px; segmented Icon/Color selected option has a soft fill (`background` equals `--soft-fill-strong`, not `--primary`), font-weight 600 and a 1px inset ring; the footer is two equal-width buttons (width difference ≤ 0.5px, gap 8px) with **Cancel** (x) left and **Add** (check) right, icon–label gap 8px; last row bottom → footer top is **16px**; with the error visible: row bottom → error top **8px**, error bottom → footer top **16px**; footer bottom → dialog padding-box bottom **20px**; footer has no border and no padding; the error slot is the single `role="alert"` node of the dialog.
- Verified by: E2E `dg-58` (group 1); design review vs mock §4.

### AS-MO-02 Edit link — no Delete in the dialog
- Given: a favorite on the grid; edit mode.
- When: the link tile is opened for edit at 1280×800, 500×800 and **320×600**.
- Then: the footer shows only **Cancel** and **Save** (50/50); the dialog DOM has no `[data-favorite-action="delete"]` and no `.button--danger`, at every width; the only way to delete is closing the dialog and using −.
- Verified by: E2E `dg-58` (group 2); unit pin in `test/newtabSource.test.js` (`createFavoriteForm` builds no Delete).

### AS-MO-03 Delete link? — 50/50 destructive footer
- Given: edit mode; − on a link opens confirm.
- When: the dialog is open; then Delete is pressed with a failing write (harness).
- Then: title **Delete link?**; body **This removes the link from your grid.**; **Cancel** left, **Delete** (trash2, danger) right, equal width (≤ 0.5px), not a right-aligned pair; body bottom → footer top **16px**; on a write failure the page alert shows the message, the dialog closes, focus returns to the − badge (unchanged from today).
- Verified by: E2E `dg-58` (group 3); `dg-37` for the failure path.

### AS-MO-04 Edit weather — city-field and Save row
- Given: temperature tile enabled with a city set; also an enabled tile opened from the hint tile (no city).
- When: the tile is opened in edit mode.
- Then: a **City** row holds the city-field (AS-MO-10), **Size** uses the soft segmented, the footer is **Cancel** \| **Save** (check), 50/50, 16px below the last row (or below the error); **Save is disabled at rest** and becomes enabled only after the size changes; a failed save shows the message in the dialog's alert slot.
- Verified by: E2E `dg-58` (group 4); design review vs mock §7.

### AS-MO-05 City modal first-run — actions, no reserve strip
- Given: fresh install; first-run city modal open.
- When: at rest with empty field and no error.
- Then: **Not now** \| **Save** 50/50; `.city-modal__feedback` has height 0 and no `min-height`; input bottom → footer top **16px**; first-run description unchanged; the field is not focused.
- Verified by: E2E `dg-58` (group 5); design review vs mock §8.

### AS-MO-06 City modal change — prefill, no Current line
- Given: a stored city (country present; and a stored city with an empty country); change mode opened from the hint tile or the weather dialog.
- When: the modal is open; then (a) Save without editing, (b) the text is edited and Save pressed, (c) Clear is pressed, (d) Cancel or Escape.
- Then: no **Current:** paragraph; the input value is **Zürich, Switzerland** (or just the name when country is empty); caret at the end, nothing selected, no suggestions request, list closed; Save is enabled; **Cancel** \| **Save** 50/50. (a) calls the select-location path (no geocoding request), the modal closes and the city is unchanged. (b) runs the geocoding path (`setCity`) as today. (c) empties the field, Save disabled, Clear hidden, focus in the field; Enter on the empty field shows `Enter a city name`. (d) closes without any write.
- Verified by: E2E `dg-58` (group 6).

### AS-MO-07 City modal error spacing
- Given: change or set city modal; submit with an empty city or the harness triggers a validation, not-found or network error.
- When: the error text is visible; then the field is edited.
- Then: input bottom → error top **8px**, error bottom → footer top **16px**; the error node has `role="alert"` and is the same node before and after; actions remain 50/50; editing empties the slot and the dialog returns to its resting height (feedback height 0).
- Verified by: E2E `dg-58` (group 7); `dg-47` (rewritten).

### AS-MO-08 Stacked change city from weather dialog
- Given: Edit weather open; city-field activated.
- When: the stacked city modal opens; then Save with a chosen suggestion; then (second run) Escape.
- Then: the weather dialog stays underneath (inert); the change modal prefills the city (AS-MO-06 rules); after Save the dialog's City row shows the new label, the dialog is still open and **focus is on the city-field**; Escape closes only the city modal, focus on the city-field, city unchanged.
- Verified by: E2E `dg-58` (group 8); design review vs mock §11 (hint absent there, Default decision 13).

### AS-MO-09 Hide confirm — titles for every metric
- Given: edit mode; each of the four weather metrics enabled (and a no-city state where the hint tile stands for the first enabled metric).
- When: − is pressed on the tile (or on the hint tile).
- Then: the title is **Hide temperature?**, **Hide precipitation?**, **Hide air quality?**, **Hide UV index?** respectively (hint tile: the title of the metric it stands for); body **This hides the tile from your grid. You can add it again from Add.**; **Cancel** \| **Hide** with **eyeOff** on Hide (primary, not danger); body bottom → footer top **16px**; nothing is written until Hide is pressed.
- Verified by: E2E `dg-58` (group 9); `dg-07` (rewritten).

### AS-MO-10 City-field — states, name, keyboard, size
- Given: Edit weather open in each state: city set; no city (opened from the hint tile); city read error; `weatherService` missing; a 60-character city name; widths 1280, 500 and 320.
- When: the row is inspected; the field is focused by Tab; Enter, then Space (second run) activates it.
- Then: height ≥ 40px (≥ 39.5 measured); value/hint per the state table; accessible name `City Zürich, Switzerland Change` (or `City No city set Set a city`) read through the accessibility tree; the visible hint text is contained in the name; the long name is truncated (`scrollWidth > clientWidth`), hint visible, `title` holds the full label, no horizontal scroll at 320; Enter and Space each open the stacked city modal; Tab order City → Size → Cancel → Save (Save skipped while disabled); with `weatherService` missing the field is `disabled`; the focus ring is `box-shadow` `--focus-overlay-ring` 2px plus a transparent outline (under forced-colors emulation the computed outline is not transparent; otherwise design review only); hint contrast ≥ 4.5:1; after the city modal closes focus is on the city-field; a click while `weatherBusy` does nothing.
- Verified by: E2E `dg-58` (group 10); `test/focusTokens.test.js` pin for the ring rule.

### AS-MO-11 Segmented outside dialogs unchanged (unit-only)
- Given: `controls.css` and `surfaces.css` source.
- When: read by the unit test.
- Then: the global rule `.segmented__option:has(input:checked)` still uses `var(--primary)` / `var(--primary-contrast)`; the soft fill appears only under `.desktop-dialog …`. No segmented control exists outside dialogs today (`createSegmentedControl` callers are all in dialog forms), so there is no E2E for this scenario.
- Verified by: `test/newtabSource.test.js` (scoped rule pin); no E2E group.

### AS-MO-12 Keyboard — Escape, focus, Tab trap
- Given: each of these opened, in edit mode where needed: (1) Add link from the Add tile; (2) Edit link from a tile; (3) Delete link? from a − badge; (4) Edit weather from a tile; (5) Hide confirm from a − badge; (6) city modal first-run; (7) city modal change from the hint tile; (8) city modal stacked over Edit weather.
- When: Escape is pressed (stacked: twice); separately Tab and Shift+Tab are pressed from the last and first control.
- Then: (1) closes, focus on the Add tile; (2) on the edited tile; (3) and (5) on the − badge, nothing deleted or hidden; (4) on its tile; (6) closes and records the dismissal as today, focus on Settings when focus was inside the modal; (7) closes, city unchanged, focus on the opener; (8) the first Escape closes only the city modal (focus on the city-field), the second closes the dialog (focus on the tile). Escape while a write or city request runs does nothing. Tab wraps inside the open modal in every case.
- Verified by: existing E2E where present (`dg-29`, `dg-40`, `13-city-modal`); `dg-58` (group 12) for (3), (5) and the stacked case.

### AS-MO-13 Low window — buttons visible at rest without error
- Given: first-run city modal; viewport **320×280** and **400×280** (harness).
- When: opened at rest, no error, field not focused.
- Then: `dialog.scrollTop` is 0; the bottom of the Save and Not now buttons ≤ the dialog's bottom − 1px (`getBoundingClientRect`); no horizontal scroll (`document` and dialog `scrollWidth ≤ clientWidth`). Windows lower than 280px are out of scope. At these heights the old reserve was already 0, so the margin is expected to be unchanged from today (about 2.6px at 320×280 in the review run).
- Verified by: E2E `dg-58` (group 13); rewrites the AS-LW-01 intent of `dg-48`.

### AS-MO-14 placePopover without reserve machinery
- Given: city modal in first-run and change mode, widths 320, 400 and 1280, window heights swept in the harness from 260 to 800.
- When: `placePopover` runs on open, on resize, and after an error shows or clears.
- Then: `city-modal__dialog--compact` and `--city-feedback-reserve` never appear; docked/overlay list behaviour runs: for each width and mode the list flips from overlay to docked at one measured window height (derived from the page, never typed in), monotonically; the overlay list's bottom ≤ `innerHeight − 16 + 0.5`; the docked list does not overlap the actions row. The old AS-DJ numeric thresholds are retired (§ Superseded scenarios).
- Verified by: `test/cityModalFeedback.test.js`; E2E `dg-58` (group 14), rewritten `dg-49` and `dg-53`.

### AS-MO-15 Token and source pins (unit-only)
- Given: built CSS and `design-tokens.css`.
- When: read by tests.
- Then: `--modal-actions-margin-top: 16px`; `--form-row-padding-y: 10px`; `--form-footer-padding-y` absent from `src/`; desktop dialog rows have no `border-top`; footer rules have no `border-top`/padding; `.city-modal__feedback` has no `min-height`; no `--city-feedback-reserve`, `city-modal__dialog--compact`, `feedbackReserve`, `.city-modal__current`, `.desktop-dialog__city`, `.text-button` in `src/`; the Edit link narrow footer rules are gone.
- Verified by: `test/newtabSource.test.js`, `test/cityModalFeedback.test.js`, `test/cityPrompt.test.js`, `test/desktopUiState.test.js` (`confirm-hide-weather` in `DIALOG_KINDS`); no E2E group.

### AS-MO-16 Hide confirm — focus, failure, Escape, repeat, announcement
- Given: edit mode; Temperature enabled with Precipitation after it; also UV last; a hint tile case; a failing-write harness; a second tab that already hid the metric.
- When: Hide is pressed; Hide is pressed with a failing write; Cancel, Escape and the backdrop are used; Hide is double-pressed; the hint tile's − is used.
- Then: success: one write, dialog closed, focus on the next tile (Precipitation), after UV on Settings, live region says `Temperature hidden` / `UV index hidden`; failure: page alert in `#desktop-status`, dialog closed, focus on the − badge, tile still shown and stored enabled; Cancel, Escape, backdrop: no write, focus on the − badge; initial focus on Cancel; a double press produces exactly one storage write; hint tile: the first enabled metric is hidden and focus follows `neighborTargets` of the hint; metric already hidden elsewhere: the write succeeds idempotently and the dialog closes as in the success path.
- Verified by: E2E `dg-58` (group 16); `dg-07`, `dg-37` (rewritten).

### AS-MO-17 City error and the list threshold
- Given: city modal in a window whose height is within 40px of the measured list flip (AS-MO-14), a suggestions list open or openable.
- When: an error appears (Save on an unknown name), then the text is edited so the error clears and suggestions show.
- Then: after each step `docked`/`scroll` state equals the state of a fresh modal opened at the same window height and the same error presence (state is a function of window and error presence, not of history); the overlay list stays inside the viewport and the docked list does not overlap Save; `place()` was called after clearing the error (state correct without a resize event).
- Verified by: E2E `dg-58` (group 17); unit pin for the `clearCityError` call (`test/cityModalFeedback.test.js`).

### AS-MO-18 Narrow and low windows — every dialog
- Given: each of Add link, Edit link, Delete link?, Edit weather (city set and a 60-character name), Hide confirm, city modal first-run and change; viewports **500×800**, **320×600** and **1280×600**.
- When: opened at rest and with an error where an error slot exists.
- Then: no horizontal scroll (document and dialog); dialog width `min(420, vw − 32)` with 16px side margins; both footer buttons equal width (≤ 0.5px), height ≥ 40px and fully inside the dialog; the spacing contract values hold; if the dialog scrolls (`scrollHeight > clientHeight`), after scrolling to the end the footer bottom + 20px ≤ the dialog's padding-box bottom; at 320 the row label sits above its control and the city-field spans the full width.
- Verified by: E2E `dg-58` (group 18); `dg-39` (rewritten sweep).

## Review focus

- **Visual (lens 2):** side-by-side with the target column of `approved-target-comparison.html` at **420px** modal width, light theme, §4–12; spacing anchors of § Spacing contract (16px / 8px / 20px, row padding 10px, icon gap 8px); soft segmented vs primary; city-field vs old text-button; delete vs hide icons.
- **Scenarios (lens 1):** edit link without Delete; hide confirm (all four metrics, hint tile, failure, repeat press); city prefill (Save without editing, edit, Clear, Cancel); error spacing and list threshold after an error (AS-MO-17); low window without error (AS-MO-13); stacked city; rewrite of `dg-48`/`dg-49`/`dg-53` and the supersession table.
- **Accessibility (lens 3):** city-field name (visible text in name), focus ring, Tab order in dialogs, hint contrast, forced-colors on the city-field and selected segment; icon buttons keep labels; the only new live text is `<Metric> hidden`; the `role="alert"` in `.desktop-dialog__error` is the single alert slot of a dialog.
- **Regression:** full E2E `--base origin/main`; `test/focusTokens.test.js` for the city-field ring.

## Changes after review

Round 1 (spec review `modal-overlay-design-spec-review.md` C1–C4, I1–I8, M1–M6; design review run `2026-10-06-76ba999-spec-r1` L0-01..14):

| Finding | Change |
|---------|--------|
| C1, L0-01, L0-02 | Error spacing 8px field → error, 16px error → buttons; `.desktop-dialog__error` `margin: 8px 0 0`; body margin 0; Spacing contract with anchors and tolerance; AS-MO-01/03/05/07 rewritten |
| C2, L0-14 | Tokens follow the mock: row padding 10px, modal icon gap 8px; token table, Modal actions and all 12px mentions updated; `--form-footer-padding-y` deleted |
| C3, L0-04 | Hide titles for all four metrics (`Hide UV index?`); AS-MO-09 on every metric and the hint tile |
| C4, L0-05 | § Hide confirm contract and AS-MO-16 (neighbour at confirm time, success/failure focus, Escape/backdrop, initial focus, repeat press, announcement, hidden elsewhere) |
| I1 | `place()` after error show and clear; input movement in Accepted exceptions; AS-MO-17 |
| I2 | Scope lists `feedbackReserve` removal and every unit-test consumer by file and line |
| I3 | Scope lists the E2E scenarios and `lib/cityModalSweep.mjs` by file and line; `data-weather-action` and `data-weather-dialog-city` kept |
| I4, L0-06, L0-07 | § Direction D: element, accessible name, states, ellipsis, ring, forced colors, focus return; AS-MO-10 (the former AS-MO-10 is merged into AS-MO-02) |
| I5, L0-12 | Measurement method; AS-MO-13 criterion and windows; AS-MO-14 sweep instead of numbers; AS-MO-11 and AS-MO-15 unit-only; AS-MO-12 lists eight scenarios; AS-MO-08 focus on the city-field |
| I6, L0-09, L0-10 | Cross-reference fixed (hide → AS-MO-09, AS-MO-16); duplicate AS-MO-10 merged; dg-58 group = AS number, unit-only scenarios named; Task A/B references removed (Default decision 1 reworded); mock §11 deviation recorded; AS-MO-11 states there is no consumer outside dialogs |
| I7, L0-13 | § Footer rules removed or rewritten by name and line; Save disabled at rest in Edit weather |
| I8 | Docs list extended (`architecture.md` lines, `design-system.md` lines, AS-DS-1/10) |
| L0-03 | Default decision 9: prefill label, `chosenCity`, Save without editing, caret, Clear, Cancel; AS-MO-06 |
| L0-08 | AS-MO-18 matrix 500×800, 320×600, 1280×600 for every dialog |
| L0-11 | Default decision 12 and Accepted exceptions: selected segment cues |
| M1 | Current behaviour: Delete on its own row only for edit-link at ≤ 400px |
| M2 | `surfaces.css:69` hardcoded 16px → token; modal button gap 8px |
| M3 | Review focus: the dialog's single `role="alert"` slot |
| M4 | § City modal item 5: the steps `placePopover` keeps and the ones that go |
| M5 | Hide body text verified for the hint tile (Hide confirm contract item 8) |
| M6 | No migration discussion; one Data compatibility line |

Unresolved: none from the two reports. Open for the next round: the measured flip heights (AS-MO-14) and the 2.6px margin (AS-MO-13) are taken from the review run's static reading, to be confirmed by the E2E harness.

## Changelog (spec document)

| Version | Date | Note |
|---------|------|------|
| v0.1–v0.3 | 2026-10-06 | Brainstorming in `docs/superpowers/specs/` |
| final (product) | 2026-10-06 | Owner-approved target; mockups archived |
| draft (pipeline) | 2026-10-06 | Run #16: `AS-MO-*`, Scope, supersession of city reserve docs |
| draft r2 | 2026-10-06 | Review round 1 applied (§ Changes after review) |
