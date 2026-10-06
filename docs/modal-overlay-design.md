# Overlay modals: unified actions, dialog forms, city modal

## Status

`draft` (product-approved target 2026-10-06; pipeline sections added for run #16).

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-06 | Unify modal footers (50/50, icons), Direction B/D for desktop dialogs, city modal without feedback reserve and without "Current:", hide-weather confirm with distinct icon from delete; visual canon = right column of `approved-target-comparison.html` §4–12. | `confirmed` | Commit `429b7bd`, mockups under `docs/superpowers/mockups/2026-10-06-overlay-modals/` |

## Current behaviour (`main` at `429b7bd`)

- Desktop dialogs use `.favorite-form__footer` with `border-top`, `--form-footer-padding-y` (14px), and Edit link puts **Delete** on its own row on narrow viewports (`surfaces.css` `data-dialog="edit-link"`).
- Confirm delete uses `justify-content: flex-end` (not 50/50).
- Edit weather uses `.desktop-dialog__city` + `text-button` ("Change city"), not a form row control.
- Segmented controls inside dialogs use the global primary fill (`controls.css` `.segmented__option:has(input:checked)`).
- City modal: paragraph `Current: …` in change mode; `.city-modal__feedback` has a permanent two-line `min-height` and `placePopover` shrinks it via `--city-feedback-reserve` / `city-modal__dialog--compact` (`docs/city-modal-low-window.md`, `docs/dialog-threshold-jump.md`).
- Weather metric **−** hides immediately (`hideWeatherMetric`), no confirmation dialog.

## Default decisions (owner can override)

1. **One pipeline run (#16), one implementation PR** — Task A (CSS/DOM) and Task B (flows) ship together so the final gate can match mock §4–12 including hide confirm and city prefill.
2. **Supersede the city feedback reserve** — remove permanent `min-height`, `--city-feedback-reserve`, and `city-modal__dialog--compact` for reserve; errors may move Save/Not now (accepted). `placePopover` keeps docked/overlay list logic only.
3. **Canonical pixels** — right column of [`approved-target-comparison.html`](superpowers/mockups/2026-10-06-overlay-modals/approved-target-comparison.html) at modal width 420px, light theme; §1–3 unchanged.
4. **Dialog kind for hide** — add `confirm-hide-weather` to `DIALOG_KINDS` (name fixed in implementation; behaviour in AS-MO-10).
5. **City-field control** — one interactive control in the City row (button styled like `.favorite-input`, not a separate underline link); accessible name includes the city and the change action.

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
5. Delete link vs hide weather — different semantics and **different commit icons** (`trash2` vs `eyeOff`).

## Tokens

New token in `src/design-tokens.css`:

| Token | Value | Use |
|-------|-------|-----|
| `--modal-actions-margin-top` | **16px** | From last content (or error text) to the **top** of the modal actions row |

Existing (values unchanged; usage updated):

| Token | Value | Use |
|-------|-------|-----|
| `--surface-modal-padding` | **20px** | Card padding; **only** bottom inset under buttons |
| `--surface-modal-max-width` | **420px** | `min()` with viewport margin |
| `--form-footer-gap` | **8px** | Gap between the two action buttons |
| `--control-height` | **40px** | Min-height of buttons and fields |
| `--control-gap-icon` | **6px** | Icon–label gap in buttons |
| `--form-row-gap` | **12px** | Label ↔ control in a row (Direction B) |
| `--form-row-padding-y` | **12px** | Vertical padding per form row (after row borders removed) |
| `--font-size-sm` | **13px** | Row labels |
| `--font-size-title` | **18px** | Modal titles |
| `--title-margin-bottom` | **12px** | Below title |

City modal error (local, not a permanent reserve): **8px** `margin-top` on `.status--error` above actions when visible.

**Anti-patterns:** no `--form-footer-padding-y` (14px) on modal actions; no summing `--surface-modal-padding` with extra footer padding; no `border-top` on `.favorite-form__row` inside desktop dialogs; no `border-top` on the actions row; no `min-height` reserve on `.city-modal__feedback`.

## Modal actions (desktop dialogs §4–7, §12; city modal §8–11)

- **Count:** exactly **2** buttons.
- **Layout:** `display: flex`; `gap: var(--form-footer-gap)`; each button `flex: 1`; `min-height: var(--control-height)`; `justify-content: center`; icon + label; icon gap `var(--control-gap-icon)`.
- **Margin above row:** `margin-top: var(--modal-actions-margin-top)` (**16px**).
- **Order:** secondary (Cancel / Not now) **left**; commit **right**.

### Commit icons (`icons.js`)

| Modal | Right label | Class | Icon |
|-------|-------------|-------|------|
| Add link | Add | `button--primary` | `check` |
| Edit link | Save | `button--primary` | `check` |
| Edit weather | Save | `button--primary` | `check` |
| City modal | Save | `button--primary` | `check` |
| Delete link? | Delete | `button--danger` | `trash2` |
| Hide temperature? | Hide | `button--primary` | `eyeOff` (not `trash2`) |

Secondary: **`x`** + Cancel or Not now.

### Copy (English UI)

| Mock § | Title | Body | Buttons |
|--------|-------|------|---------|
| 6 | Delete link? | This removes the link from your grid. | Cancel \| Delete |
| 12 | Hide temperature? | This hides the tile from your grid. You can add it again from Add. | Cancel \| Hide |

First-run city description paragraph — **unchanged**.

## Direction B — desktop form dialogs

**Scope:** `.desktop-dialog` forms (Add link, Edit link, Edit weather).

1. Remove `border-top` on `.favorite-form__row` in modals; keep `padding: var(--form-row-padding-y) 0`.
2. Keep **100px** label column (`--form-label-width`).
3. **Segmented (scoped):** checked option inside `.desktop-dialog` uses soft fill, not `var(--primary)`:

   ```css
   .desktop-dialog .segmented__option:has(input:checked) {
     background: var(--soft-fill-strong);
     color: var(--text);
     font-weight: var(--font-weight-control);
     box-shadow: inset 0 0 0 1px var(--border-control);
   }
   ```

   Global segmented outside dialogs **unchanged**.

4. Unified modal actions row (no footer `border-top`). Confirm delete — 50/50, not `justify-content: flex-end`.

**Edit link:** Cancel \| Save only — **no** Delete in the footer (delete only via edit mode − → Delete link?).

## Direction D — edit weather city row

Replace `.desktop-dialog__city` + `text-button`:

- One form row: label **City**.
- Control: **city-field** — looks like `.favorite-input` (40px height, `--border-control`, `--radius-control`), full width of the control column.
- Content: truncated city name + trailing hint **Change** (12px muted).
- Activation opens the city modal (stacked over the weather dialog); not an underline link.

Size row: Direction B segmented.

## City modal

1. Remove permanent `min-height` on `.city-modal__feedback` and all `--city-feedback-reserve` / `city-modal__dialog--compact` **reserve** logic in `placePopover`.
2. Errors: `.status--error` only when there is text; **8px** above actions; the card may grow when an error appears.
3. Change city: remove `.city-modal__current` / "Current: …"; **prefill** the input with the display label.
4. Actions: same modal-actions rules; use `--modal-actions-margin-top` instead of a hardcoded 16px only on `.city-modal__actions`.

## Product flows

| Flow | Behaviour |
|------|-----------|
| Delete favorite | Edit mode − → Delete link? → Delete |
| Edit link | No Delete button in the dialog |
| Hide weather metric | Edit mode − → Hide temperature? → Hide |
| Change city | Prefill input; open from city-field or stacked change modal |

## Scope

- `src/design-tokens.css`: `--modal-actions-margin-top`.
- `src/controls.css`, `src/surfaces.css`, `src/newtab.css` (if needed): Direction B/D, modal actions, city-field, city feedback/error spacing.
- `src/newtab.js`: dialog DOM (footer, edit link, confirm hide, city prefill, city-field, `placePopover` simplification); no `widgetsService` API changes.
- `src/desktopUiState.js`: `confirm-hide-weather` in `DIALOG_KINDS`.
- Unit / source tests: `test/newtabSource.test.js`, `test/cityModalFeedback.test.js`, `test/desktopUiState.test.js`, `test/focusTokens.test.js` (city-field focus selectors if needed).
- E2E (notes): new `dg-58-modal-overlay.mjs` (AS-MO-01..15); **rewrite or retire** assertions tied to the feedback reserve: `dg-48-city-modal-low-window.mjs`, `dg-49-city-modal-placement-order.mjs`, `dg-53-dialog-threshold-jump.mjs`; re-check `dg-47`, `13-city-modal`, `15-city-modal-layout`, `dg-15`, `dg-25`, `dg-29`, `dg-41`, `dg-52` (focus ring on city controls unchanged unless selectors move).
- Docs: `docs/design-system.md` (modal actions, dialog segmented, city-field, city error spacing); `docs/architecture.md` (city modal paragraph: no reserve; hide confirm); **amend/supersede** `docs/city-modal-low-window.md`, `docs/dialog-threshold-jump.md`, `docs/city-error-ux.md` (reserve / no-shift guarantees); `CHANGELOG.md` `[Unreleased]`; private `agent-config/CLAUDE.md` (dialog kinds, city prefill).

## Process

Full UI-phase cycle: this spec → spec review and spec gate → plan in `quiet-tab-notes/superpowers/plans/2026-10-06-modal-overlay-design.md` → E2E-first implementation → checkpoint and final design review → independent verification → merge. Implementation branch from `main` at spec gate pass.

## Non-goals

- Tooltip, desktop status chip, add menu (mock §1–3).
- Dark-theme pixel parity unless called out in Accepted exceptions (gate uses light theme at 420px modal width).
- Sticky action rows or auto-scroll to keep buttons visible when a tall error appears in a low window (accepted: scroll the dialog).
- New persisted fields or layout version changes.
- Changing first-run city description copy, city error **texts**, or `placePopover` thresholds `POPOVER_MIN_FREE` / `POPOVER_GAP` except where reserve removal changes measurement inputs.

## Accepted exceptions

- **City error moves the buttons** — no permanent feedback reserve; showing or clearing an error may change dialog height and scroll position (reverses `docs/city-error-ux.md` decision 3 and AS-CE-04 "no shift" where this spec applies).
- **Low window with error** — in a viewport that already scrolls the city dialog, a visible error may push Save/Not now out of view; full error text is shown, Enter/Submit still work (same class of behaviour as pre-reserve `ac192fb`, now the default).
- **Docked vs overlay suggestions list** — flip band and overlay list height step from `docs/dialog-threshold-jump.md` may remain for list placement; only **reserve-related** compact behaviour is removed. If visual review finds a regression in list mode, fix within `placePopover` without reintroducing permanent reserve.
- **Hide uses primary + eyeOff** — not `button--danger`, to distinguish from Delete link.

## Acceptance scenarios

Common setup unless stated: unpacked extension in the E2E harness; light theme; viewport **1280×800** unless a scenario names another size; a stored city **Zürich, Switzerland** (or harness default) for change-mode tests; edit mode entered via long-press Settings or harness helper; strings through `textContent` only.

### AS-MO-01 Add link — modal actions and Direction B
- Given: edit mode; Add tile opens Add link.
- When: the dialog is open at rest.
- Then: form rows have no horizontal divider lines between them; segmented Icon/Color use soft selected fill, not primary blue; the footer is two equal-width buttons with **Cancel** (x) left and **Add** (check) right; **16px** from the last row (or validation error above the footer) to the button row; no extra padding below the buttons beyond `--surface-modal-padding` (20px).
- Verified by: E2E `dg-58` (group 1); design review vs mock §4.

### AS-MO-02 Edit link — no Delete in the dialog
- Given: a favorite on the grid; edit mode.
- When: the link tile is opened for edit at 1280×800 and at **320×600**.
- Then: footer shows only **Cancel** and **Save** (50/50); no Delete button in the dialog at either width.
- Verified by: E2E `dg-58` (group 2).

### AS-MO-03 Delete link? — 50/50 destructive footer
- Given: edit mode; − on a link opens confirm.
- When: the dialog is open.
- Then: title **Delete link?**; body **This removes the link from your grid.**; **Cancel** left, **Delete** (trash2) right, equal width; not right-aligned pair.
- Verified by: E2E `dg-58` (group 3).

### AS-MO-04 Edit weather — city-field and Save row
- Given: temperature tile enabled with a city set.
- When: the tile is opened in edit mode.
- Then: a **City** row matches Direction D (input-like control, truncated city + **Change** hint); **Size** uses soft segmented; footer **Cancel** \| **Save** (check), 50/50, 16px margin above.
- Verified by: E2E `dg-58` (group 4); design review vs mock §7.

### AS-MO-05 City modal first-run — actions, no reserve strip
- Given: fresh install; first-run city modal open.
- When: at rest with empty field and no error.
- Then: **Not now** \| **Save** 50/50; no permanent empty strip between field and buttons (feedback block has no min-height); first-run description unchanged.
- Verified by: E2E `dg-58` (group 5); design review vs mock §8.

### AS-MO-06 City modal change — prefill, no Current line
- Given: a stored city; change mode opened from hint or weather dialog.
- When: the modal is open.
- Then: no **Current:** paragraph; the input is prefilled with the display label (e.g. **Zürich, Switzerland**); **Cancel** \| **Save** 50/50.
- Verified by: E2E `dg-58` (group 6).

### AS-MO-07 City modal error spacing
- Given: change or set city modal; submit with empty city or harness triggers validation error.
- When: error text is visible.
- Then: **8px** between error and the action row; error uses `role="alert"`; actions remain 50/50.
- Verified by: E2E `dg-58` (group 7).

### AS-MO-08 Stacked change city from weather dialog
- Given: Edit weather open; city-field activated.
- When: the stacked city modal opens.
- Then: weather dialog remains underneath; change modal prefills the city; Save commits city and returns focus behaviour unchanged from today (city row updates).
- Verified by: E2E `dg-58` (group 8); design review vs mock §11.

### AS-MO-09 Hide temperature? confirm
- Given: edit mode; − on an enabled weather metric tile.
- When: the confirm opens.
- Then: title **Hide temperature?**; body **This hides the tile from your grid. You can add it again from Add.**; **Cancel** \| **Hide** with **eyeOff** on Hide (primary, not danger); Hide disables the metric; focus moves per existing neighbour rule.
- Verified by: E2E `dg-58` (group 9).

### AS-MO-10 Delete only via − for links
- Given: edit mode; a favorite.
- When: the user opens Edit link.
- Then: there is no path to delete from that dialog except closing and using −.
- Verified by: E2E `dg-58` (group 2); unit pin in `test/newtabSource.test.js`.

### AS-MO-11 Segmented outside dialogs unchanged
- Given: a context outside `.desktop-dialog` that uses segmented controls (if any on the page).
- When: compared before/after CSS change.
- Then: checked segmented option still uses primary fill outside dialogs.
- Verified by: `test/newtabSource.test.js` (scoped rule pin); design review spot-check.

### AS-MO-12 Keyboard — Escape and focus
- Given: each dialog kind open (add, edit link, delete confirm, edit weather, hide confirm, city modal).
- When: Escape is pressed.
- Then: dialog closes per existing `escapeLayer` order; focus returns to the opener tile or control as today.
- Verified by: existing E2E where present; `dg-58` (group 10) for new confirm-hide.

### AS-MO-13 Low window — buttons visible at rest without error
- Given: first-run city modal; viewport **320×280** and **400×280** (harness).
- When: open at rest, no error, field not focused to force scroll.
- Then: **Save** and **Not now** are not clipped by the dialog bottom edge (regression guard replacing AS-LW-01 intent without reserve).
- Verified by: E2E `dg-58` (group 11); replaces failing assertions in `dg-48` tied to 39px reserve.

### AS-MO-14 placePopover without reserve machinery
- Given: city modal open in change mode.
- When: `placePopover` runs on open and resize.
- Then: `city-modal__dialog--compact` and `--city-feedback-reserve` are never set for reserve; docked/overlay list behaviour still runs.
- Verified by: `test/cityModalFeedback.test.js`; E2E `dg-58` (group 12).

### AS-MO-15 Token and source pins
- Given: built CSS and `design-tokens.css`.
- When: read by tests.
- Then: `--modal-actions-margin-top: 16px`; desktop dialog rows in modals have no `border-top`; `.city-modal__feedback` has no permanent `min-height` reserve rule.
- Verified by: `test/newtabSource.test.js`, `test/cityModalFeedback.test.js`.

## Review focus

- **Visual (lens 2):** side-by-side with target column of `approved-target-comparison.html` at **420px** modal width, light theme, §4–12; spacing from content/error to actions (16px / 8px); soft segmented vs primary; city-field vs old text-button; delete vs hide icons.
- **Scenarios (lens 1):** edit link without Delete; hide confirm; city prefill; error spacing; low window without error (AS-MO-13); stacked city; rewrite of `dg-48`/`dg-49`/`dg-53` — document which AS from old specs are retired in the run record.
- **Accessibility (lens 3):** city-field name and focus ring; Tab order in dialogs; icon buttons keep labels; forced-colors on new city-field control; no new live regions.
- **Regression:** full E2E `--base origin/main`; `test/focusTokens.test.js` if city-field replaces `text-button` selectors.

## Changes after review

_(Empty until spec review rounds.)_

## Changelog (spec document)

| Version | Date | Note |
|---------|------|------|
| v0.1–v0.3 | 2026-10-06 | Brainstorming in `docs/superpowers/specs/` |
| final (product) | 2026-10-06 | Owner-approved target; mockups archived |
| draft (pipeline) | 2026-10-06 | Run #16: `AS-MO-*`, Scope, supersession of city reserve docs |
