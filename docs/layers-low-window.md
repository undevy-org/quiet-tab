# Layers and the low window: status chip, stacked dialogs, scrolling dialogs, focus rings

## Status

`draft` — revision 1 (2026-10-18, stage 0). Run №46 (`layers-low-window`), row Р46 of the roadmap ("Слои и низкое окно", marathon `kickoffs/marathon-45-51.md`). Backlog items 9, 15, 20, 23, 25, 29, 41 (L2-02), 60 (V2-04), 103, 105, 106, 109, 114 and, because it is the same ring family, 119 (Minor of run 45). Every item is first reproduced on `origin/main` (step 1 of the kickoff); the triage below is by reading `main` at `aeb1535` and carries no browser numbers yet (§ Live measurement is filled at step 1).

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). Nothing is stored or migrated by this run.

Related: `docs/modal-overlay-design.md`, `docs/city-modal-low-window.md` and `docs/dialog-threshold-jump.md` (the city modal in low windows), `docs/link-dialog-validation.md` (dialog error slot, `revealAddedTile`), `docs/city-suggestion-list.md` (run 45: the ring of the location link, decision 7), `docs/docked-list-focus-ring.md`, `docs/onboarding-wizard-polish.md` (locked starter list), `docs/stale-tab-closeout.md` (the status chip), `src/newtab.js`, `src/newtab.css`, `src/surfaces.css`, `src/design-tokens.css`.

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| run #11 | 15: the chip `#desktop-status` (fixed, bottom) covers tiles of a scrolled grid. | `confirmed` by reading (no bottom room is reserved) | decision 2, Ruling 2 |
| run #14 | 23, 25: the chip (z 50) lies under the modal backdrop (z 100); a dialog overlaps it at 500×360 (420×48 px) and 320×480; its contrast under the backdrop is 3.45:1 / 2.55:1. | `confirmed` by reading (`newtab.css` z-index 50, `surfaces.css` backdrops 100) | decision 1, Ruling 1 |
| run #16 / #14 | 41 (L2-02), 60 (V2-04): the city modal stacked over the weather edit dialog shows strips of the lower card (buttons, 4 to 25 px). | `confirmed` by reading (stacked modal 102, lower dialog 101 stays painted) | decision 3, Ruling 3 |
| run 39 | 9: the focus ring of Cancel/Add and of the Link field is clipped by 2 px in a scrolling `.desktop-dialog` (1280×300); `scroll-margin` exists only for `.city-modal`. | `confirmed` (run 39 measurement, still true: `grep scroll-margin src/surfaces.css`) | decision 4 |
| run #13 | 20: Edit link at 320×600 has Cancel/Save below the visible area (`scrollHeight` 643 vs `clientHeight` 566), no hint. | `confirmed` by reading (`.desktop-dialog { overflow-y: auto }`, footer in the flow) | decision 5, Ruling 4 |
| run 43 | 103, 106: in a low window (1280×300) the Link field and its error slot are ~318 px apart; at 320×600 and at 200 % zoom (640×400) the Custom icon length error lies below the visible part. | `confirmed` by reading (`showDialogError` only calls `target.focus()`) | decision 6, Ruling 5 |
| run 43 | 105: after Add the page jumps to the top, then glides to the new tile. | `confirmed` by reading (`focusWidgetTarget` calls `node.focus()` without `preventScroll`) | decision 7 |
| run 43 / 44 | 29: the remove badges at ≤ 360 px touch the grid's top edge and enter the neighbour by 2 px. | `confirmed` by arithmetic (cell 56, gap 6, pad 8; badge offset 8, size 24) | decision 8 |
| run 44 | 109, 114: the modal title and the locked starter list rings use different tokens (translucent `--focus-overlay-ring` vs solid `--focus-ring`); the list ring is dotted over the rows (computed outline is right). | 109 `confirmed` by reading; 114 `plausible` (rows are `position: relative` and can paint over the list's own outline), proven at step 1 | decision 9, Ruling 6 |
| run 45 final | 119: forced-colors outline of the location link keeps `outline-offset: 2px` and enters the last letter of "or" by 1.63 px. | `confirmed` by reading (shared `.city-modal :is(...):focus-visible` rule) | decision 10 |

Not reproduced by reading: none. If step 1 finds an item that does not reproduce, it is closed by a line in `backlog.md` and its decision and AS are dropped.

## Triage (reading `main`, to be replaced by measurements)

- **Layers today.** Chip `z-index: 50` (`newtab.css:229`); add menu 50; tooltip 60; city modal and desktop backdrop 100; desktop dialog 101; stacked city modal 102 (`surfaces.css`). The chip is `position: fixed; bottom: 16px` and takes no room in the page.
- **Dialog scrolling.** `.desktop-dialog` is `position: fixed; max-height: calc(100vh - 32px); overflow-y: auto`; the footer (`Cancel | Save`) is the last child of the form; the error slot (`.desktop-dialog__error`, `role=alert`) is the form child just above the footer.
- **Focus after close.** `closeDesktopDialog` → `focusWidgetTarget` → `node.focus()` (scrolls); `restoreFocus` and the wizard's `pendingFocus.preventScroll` already pass `preventScroll`.

## Live measurement

Filled at step 1 of the kickoff on `origin/main` (windows 1280×300, 500×360, 320×480, 320×600, 640×400, 1280×800; both themes where color matters): chip rectangle against the dialog rectangle; stacked modal against the lower dialog; scrolling dialog `scrollHeight`/`clientHeight`, footer rectangle, the field-to-slot distance; ring clipping per control; badge rectangle against the neighbour at widths 360 and 320; starter list ring pixels on rows and in gaps; the forced-colors ring box of the location link against the last character of the text before it.

## Decisions

Technical defaults of the stage-0 author unless marked. No owner question was asked (marathon rule); the UX forks carry a Ruling (six).

1. **The chip does not live under a backdrop (Ruling 1).** While any modal layer is open (a `.desktop-dialog`, the city modal in either mode, the onboarding wizard) the chip is not painted: it takes no pixels and cannot be cut by a card, but it stays in the accessibility tree (visually hidden, not `display: none` or `hidden`), so an alert set while a layer is open is still announced, and it is painted again when the last layer closes, with its text, unless its own timer (`DESKTOP_STATUS_MS`, unchanged) or the next action cleared it meanwhile. The z-index stays 50 and the chip is never raised above a backdrop. Ruling (марафон, на проверку Киру): the status is hidden while a modal is open; альтернатива: raise the chip above the backdrop (z 103) and keep it visible, or move the dialog out of its way; цена ошибки: the ensure-failure message of a first run is not seen until the wizard is closed (it is persistent, so it is there afterwards), with the alternative the chip covers a dialog button in windows lower than about 360 px and the dialog needs a bottom reserve.
2. **A visible chip takes room (Ruling 2).** While the chip is painted in normal mode, the page keeps a bottom reserve equal to the chip's height plus its offset (a custom property written from the chip's measured size, 0 while the chip is hidden or covered), so the last row of a scrolled grid can be scrolled clear of the chip and a focused tile's scroll position (`scroll-margin 6px`) is computed against the room above the chip. The reserve is part of the document height only: `viewportRows`, the column count, `firstScreen()` and the layout are untouched (they read `clientHeight`/`clientWidth`), and nothing is written. Ruling (марафон, на проверку Киру): reserve room instead of letting the chip float over tiles; альтернатива: leave the chip floating (a transient 8 s message) or dock it at the top; цена ошибки: the page grows by about 60 px at the bottom while a message is shown (a one-time jump of the scroll range, the scroll position itself does not move), with the alternative a tile under the chip cannot be read or clicked while a persistent message (the Reload chip) is shown.
3. **A stacked modal hides the card under it (Ruling 3).** While the change-mode city modal is stacked over the weather edit dialog, the lower dialog is not painted (`visibility: hidden`; it stays in the DOM and keeps its state, its form values and its `inert`), so no strips of it show beside the city card; the desktop backdrop stays, so the dimming does not change. When the city modal closes, the dialog is painted again, in the same state, and focus returns as before (`docs/city-modal-focus-copy.md`). Ruling (марафон, на проверку Киру): hide the lower card while the stacked modal is open; альтернатива: keep the lower card visible as context and cover its strips (a taller/wider upper card or a second backdrop); цена ошибки: the user loses the visual context of the weather dialog for the seconds the city modal is open, with the alternative strips stay visible in the corners and the cards fight for attention.
4. **Ring room in every scrolling dialog.** `scroll-margin: 5px` on `.desktop-dialog :is(button, input)` (and the segmented-control inputs and the Custom icon field they contain), a literal with the same reason as the city modal's rule: the widest ring is the forced-colors outline (2px + 2px offset = 4px) plus one pixel for Chrome's integer scroll offsets; it is on the resting state because the scroll happens at the moment of focus. Add link, Edit link, Edit weather, and the two confirm dialogs.
5. **The footer is sticky (Ruling 4).** In a `.desktop-dialog` that scrolls, the `Cancel | Save` row stays at the bottom edge of the card: it is the dialog's last child with `position: sticky; bottom: 0`, a `--panel` background that covers the scrolling content, and a hairline top border or divider (`--border`) that shows only while content is under it. A dialog that fits (1280×800) has no scrolling and is pixel-identical to `origin/main` (±0.5 px). The footer keeps the 50/50 buttons, their order in the DOM, focus order, and the 16 px gap above them (`--modal-actions-margin-top`); the error slot stays above the footer in the flow. The card's bottom padding stays visible below the sticky row. Ruling (марафон, на проверку Киру): sticky footer; альтернатива: a scroll hint (fade/shadow at the bottom) and keep the buttons in the flow, or a larger min viewport for dialogs; цена ошибки: in a very low window (≤ 300 px) the sticky row takes a third of the card and the form scrolls in a small window, with the alternative the user has to discover that the buttons are below (the original defect). The rejected alternative "sticky row" of `docs/city-modal-low-window.md` applied to the first-run reserve; this decision is about desktop dialogs only and does not touch the city modal.
6. **A validation error is shown, then the field (Ruling 5).** `showDialogError` still focuses the named field (or Save), now with `preventScroll: true`, then scrolls the dialog so that the error slot is inside the scrollport (`block: "nearest"`, never smooth), and, if the field and the slot fit in the scrollport together, so that both are inside; if they do not (1280×300, where they are ~318 px apart), the slot wins and the focused field may be partly or wholly out of view, with the focus ring kept whole where it is visible (decision 4). `aria-invalid`, `aria-describedby`, the focus target and the text are unchanged. Ruling (марафон, на проверку Киру): the message wins over the field when both do not fit; альтернатива: the field wins (today's behaviour: the message needs a scroll); цена ошибки: a sighted user may not see the field they must fix (the message names it, and focus is on it), with the alternative they do not see that anything failed.
7. **Closing a dialog does not scroll the page (technical).** `closeDesktopDialog` restores focus to the opener (or the neighbour tile after a delete) with `preventScroll: true`: the opener was on screen when the dialog opened, so the browser has nothing to reveal. A tile that is outside the window after a close is brought in only by `revealAddedTile` (smooth, only if not safely inside the window, unchanged, `docs/link-dialog-validation.md`), never through the top of the page.
8. **Badges clear the grid edge and the neighbours at the 56 cell.** `--tile-remove-offset` becomes 6px at `:root[data-cell="56"]` (gap 6, pad 8): the badge is 2 px from the grid's top/left edge and touches but does not enter a neighbour. Cells 64 and 72 keep 8px (gap 8: touches the neighbour; pad 12/16).
9. **One ring over content (Ruling 6).** The tokens: `--focus-ring` (solid) is the ring for anything that sits over content (a title that takes programmatic focus with `tabindex=-1` in the busy phase, the locked starter list); `--focus-overlay-ring` (translucent) stays only for rings drawn on the plain panel (`box-shadow` of fields and buttons in the city modal, the link). The title ring is `box-shadow: 0 0 0 2px var(--focus-ring)`. The locked starter list's ring is painted above its rows (a pseudo-element or `isolation`/`z-index` on the list so that the rows cannot cover it), 2 px, uniform: the same color on rows and in gaps, ≥ 3:1 on `--panel` and on the row surface in both themes (documented; measured). Ruling (марафон, на проверку Киру): solid ring token over content, which makes the title ring darker than before; альтернатива: keep the soft ring and add a light ring around it for content; цена ошибки: a slightly harsher title focus ring in the busy phase, with the alternative a double ring that is harder to maintain.
10. **Forced-colors ring of the location link (technical).** `.city-location-link:focus-visible` gets `outline-offset: 0` (the forced-colors outline hugs its padded box, which ends 1 px past the text), so the ring stays inside the 3 px reach of run 45 and does not enter the last letter of the text before the link.

## Scope

- `src/newtab.css`, `src/surfaces.css`, `src/design-tokens.css` (reserve variable, the 56-cell badge offset, the footer, the sticky row, the stacked rule, the ring tokens/rules); `src/newtab.js` (`showDialogError`, `closeDesktopDialog`/`focusWidgetTarget`, the chip's covered/reserve state, the stacked class on the lower dialog). Code choice is the plan's; the observable results are the AS below.
- E2E: new `dg-86-layers-low-window.mjs` (the next free number after `dg-85`). Existing scenarios that pin the touched surfaces: `dg-83-link-dialog-validation`, `dg-84-city-modal-focus-copy`, `dg-82-onboarding-wizard-polish`, `dg-85-city-suggestion-list`, the scenarios of the status chip and of edit-mode badges (the executor greps `.private/e2e/scenarios/` for `desktop-status`, `tile-remove`, `desktop-dialog`, `city-modal--stacked`, `focus-overlay-ring`); `test/newtabSource.test.js` pins that name any of these are updated by the rule "replace, not weaken".
- Docs: `CHANGELOG.md` `[Unreleased]`; `docs/architecture.md` (layers, sticky footer, chip); `agent-config/CLAUDE.md` § Desktop grid DOM contract (dialogs, the chip); earlier docs that state the layers (`docs/stale-tab-closeout.md`, `docs/docked-list-focus-ring.md`) get an "amended by run 46" line, never a deletion.

## Acceptance scenarios

Common setup of `dg-86`: the harness as in `dg-83`/`dg-85` (clean profile, six system tiles seeded, a city set unless stated), edit mode and dialogs as the tests need, windows as named; every geometric AS prints the rectangles it compares and asserts its premise (the dialog really scrolls, the chip really shows) before the value.

### AS-LLW-01 The chip stays out of the modal layers (Ruling 1)
- Given: a persistent chip (the ensure failure, forced through the harness) and a transient one (a retry failure); Add link open at 500×360 and 320×480; the city modal in change mode; the wizard on a first run.
- When: a layer opens and closes.
- Then: while it is open the chip has an empty painted area (the screenshot of its former rectangle equals the backdrop color within ±2 per channel) and the chip element is still in the accessibility tree with `role=alert`; no layer's rectangle intersects a visible chip; after the last layer closes the persistent chip is painted again with its text; the transient one only if its 8 s have not passed; z-index of the chip is 50.
- Verified by: E2E `dg-86`.

### AS-LLW-02 A visible chip reserves room (Ruling 2)
- Given: 30 links so the grid scrolls at 1280×800 and at 500×600; a persistent chip.
- When: scroll to the bottom; then clear the chip.
- Then: with the chip painted the bottom of the last row is at least 8 px above the chip's top; without it the document height is the one of `origin/main` (±0.5 px); the column count, `viewportRows` and every tile position are unchanged by the chip appearing and disappearing; no storage write.
- Verified by: E2E `dg-86`.

### AS-LLW-03 A stacked modal shows no strips of the card under it (Ruling 3)
- Given: the weather edit dialog open, a city set; widths 1280, 500, 320.
- When: its city field opens the stacked city modal; then Cancel; then open and Save a changed city.
- Then: while stacked, no pixel inside the city modal's backdrop outside the city card shows the lower card (`elementFromPoint` at the former strip positions returns the backdrop; the lower dialog is `visibility: hidden` and still in the DOM with its values); after close it is painted again with the same field values and the focus is where `docs/city-modal-focus-copy.md` puts it; the `inert` states are those of `origin/main`.
- Verified by: E2E `dg-86`; `dg-84` stays green.

### AS-LLW-04 Rings are whole in every scrolling dialog
- Given: Add link, Edit link, Edit weather and a confirm dialog at 1280×300 and 320×480 (each really scrolls).
- When: Tab and Shift+Tab through every control, including the segmented inputs and the Custom icon field.
- Then: for each focused control the ring box (3 px outer, or the 4 px forced-colors box) lies inside the dialog's scrollport (the cut is 0 px, where `origin/main` cuts 1.9 to 2.1 px).
- Verified by: E2E `dg-86`.

### AS-LLW-05 Cancel and Save are visible at rest (Ruling 4)
- Given: Edit link at 320×600, Add link at 1280×300 and at 640×400 (200 % zoom), Edit weather at 320×480; each dialog really scrolls (`scrollHeight > clientHeight`).
- When: opened, nothing scrolled.
- Then: Cancel and Save are fully inside the card and the window; scrolling the form moves the fields under the footer and never the footer; the footer has a `--panel` background and a visible top divider while content is under it; Tab order, 50/50 widths, the 16 px gap and Escape are unchanged; in 1280×800 every dialog rectangle and every control rectangle equals `origin/main` within 0.5 px; forced colors keep the divider visible.
- Verified by: E2E `dg-86`; `dg-83` stays green.

### AS-LLW-06 A validation error is on screen (Ruling 5)
- Given: Add link with a bad URL at 1280×300; Custom icon with a 2001-character link at 320×600 and at 640×400; a name over the limit.
- When: Save.
- Then: the alert slot is inside the scrollport and the dialog scrolls instantly (no animation); where the field and the slot fit together both are inside; at 1280×300 the slot is inside and the field has focus; `aria-invalid`, `aria-describedby` and the text are those of `origin/main`; a second Save does not scroll further.
- Verified by: E2E `dg-86`; `dg-83`.

### AS-LLW-07 Add does not jump the page
- Given: 30 links, the page scrolled down 400 px, the Add tile in view.
- When: open Add link and Cancel; then add a link whose tile is below the fold.
- Then: after Cancel `scrollY` is unchanged (±1); after the add the page goes only to the new tile (smooth, as `docs/link-dialog-validation.md`), never through the top: `scrollY` never drops below the starting value during the 600 ms after the close (sampled each frame); with reduced motion no animation.
- Verified by: E2E `dg-86`; `dg-83`.

### AS-LLW-08 Remove badges clear the edge and the neighbours
- Given: edit mode, tiles in a row and in the first row, at widths 360 and 320 (cell 56) and at 500 and 1280 (64, 72).
- When: measure.
- Then: at 56 the first badge is 2 px from the grid's top and left edges and no badge intersects another tile's rectangle (overlap ≤ 0 px); at 64 and 72 the badge rectangles equal `origin/main`; the hit target stays 24 px.
- Verified by: E2E `dg-86`.

### AS-LLW-09 One ring over content (Ruling 6)
- Given: the city modal in the busy phase (title focused) and the wizard after Finish with the starter list locked (both themes).
- When: read the computed ring and sample pixels along the list ring.
- Then: both use `--focus-ring`; the list ring has one color on rows and in gaps (every sampled pixel within ±3 per channel) and ≥ 3:1 against `--panel` and against the row surface in both themes; the title ring is 2 px; no other ring changes.
- Verified by: E2E `dg-86` (computed style and a screenshot sample); `dg-82`, `dg-84` stay green.

### AS-LLW-10 The location link in forced colors
- Given: forced-colors emulation, the city modal and the wizard step 1, widths 500 and 320.
- When: Tab onto "use your location".
- Then: the outline box does not intersect the box of the last non-space character of the text before the link (0 px); the reach beyond the text stays ≤ 3 px per side.
- Verified by: E2E `dg-86`; `dg-85` AS-CSL-12 stays green.

### AS-LLW-11 Keyboard, Escape and focus are as before
- Given: all dialogs of AS-LLW-03 to 06.
- When: Tab walk, Escape, backdrop click.
- Then: the Tab cycle and the Escape order (`escapeLayer`) are those of `origin/main`; the focus trap includes the sticky footer buttons; focus returns to the opener on close.
- Verified by: E2E `dg-86`; the dialog scenarios of runs 43 to 45.

## Affected earlier scenarios

`dg-83` (dialog geometry and error slot), `dg-84` and `dg-85` (stacked modal, ring), `dg-82` (locked list), the chip scenarios, the edit-mode badge scenarios; source pins in `test/newtabSource.test.js` for `showDialogError`, `closeDesktopDialog`, the chip and the ring tokens. Pinned values are updated, never deleted; the executor lists each change in the commit message.

## Review focus

- **Visual lens.** The sticky footer (divider, background, 20 px bottom padding below it) in both themes at 320×600, 1280×300, 640×400; the chip hidden and shown around layers; the stacked modal with no strips; the starter list ring; the title ring darker.
- **Scenario lens.** The chip's lifecycle (set while covered, expires while covered, persistent); the scroll order in `showDialogError`; `preventScroll` on close with a neighbour target after delete.
- **Accessibility / text lens.** The hidden chip is still announced; focus not lost behind the sticky footer; forced-colors divider and ring; no new text.
- **Technical.** The reserve and the chip never change `clientHeight`-derived layout; the stacked rule does not break `inert`/focus trap.

## Accepted exceptions

- Ruling 1: a status shown while a modal is open is not seen until it closes.
- Ruling 3: the weather dialog is not visible behind the stacked city modal.
- Ruling 4: at heights ≤ 300 px the sticky row takes a large part of the card.
- Ruling 5: at 1280×300 the field may be out of view when the message is shown.

## Non-goals

Drag and scroll (Р47); weather reliability (Р48); typography and wording (Р49); the geometry of the city modal and its suggestion list (run 45); the first-run reserve of `docs/city-modal-low-window.md`; the Add menu position; any new text; storage.

## Process

Stage 0 package: this spec, the plan `superpowers/plans/2026-10-18-layers-low-window.md`, the kickoff `pipeline/kickoffs/run-46-layers-low-window.md`, `inflight/layers-low-window.md`. No mockups: described in text with measurements. Spec branch `docs/layers-low-window-spec`; E2E `dg-86-layers-low-window.mjs`. The six Rulings are listed for the owner in `backlog.md` ("Проверить Ruling марафона в `docs/layers-low-window.md`").
