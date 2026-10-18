# Layers and the low window: status chip, stacked dialogs, scrolling dialogs, focus rings

## Status

`draft` — revision 1 (2026-10-18, stage 0). Run №46 (`layers-low-window`), row Р46 of the roadmap ("Слои и низкое окно", marathon `kickoffs/marathon-45-51.md`). Backlog items 9, 15, 20, 23, 25, 29, 41 (L2-02), 60 (V2-04), 103, 105, 106, 109, 114 and, because it is the same ring family, 119 (Minor of run 45). Every item is first reproduced on `origin/main` (step 1 of the kickoff); the triage below is by reading `main` at `aeb1535`; § Live measurement carries the browser numbers of step 1 (2026-10-18): all 14 items reproduce, five under narrower conditions than the triage assumed (item 20, 23/25 flow, 105, 106, 109), and the Givens of AS-LLW-01, 05, 06, 07 were corrected to match.

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

Not reproduced by reading: none. Step 1 (browser, § Live measurement) found no item that fails to reproduce, so no decision or AS is dropped; it did find that items 20, 105, 106 and 109 reproduce only under narrower conditions, and that a chip cannot sit under an Add/Edit dialog from the start (below).

## Triage (reading `main`, to be replaced by measurements)

- **Layers today.** Chip `z-index: 50` (`newtab.css:229`); add menu 50; tooltip 60; city modal and desktop backdrop 100; desktop dialog 101; stacked city modal 102 (`surfaces.css`). The chip is `position: fixed; bottom: 16px` and takes no room in the page.
- **Dialog scrolling.** `.desktop-dialog` is `position: fixed; max-height: calc(100vh - 32px); overflow-y: auto`; the footer (`Cancel | Save`) is the last child of the form; the error slot (`.desktop-dialog__error`, `role=alert`) is the form child just above the footer.
- **Focus after close.** `closeDesktopDialog` → `focusWidgetTarget` → `node.focus()` (scrolls); `restoreFocus` and the wizard's `pendingFocus.preventScroll` already pass `preventScroll`.

## Live measurement

Step 1 of the kickoff, run 46, 2026-10-18. Build: `origin/main` `aeb1535` (`src/` and `manifest.json` identical to it, checked by `git diff`); real Chromium with the unpacked extension, one-off profile, project harness. Probe: `.private/scratch/run-46-triage/probe.mjs` (notes branch `docs/run-46-layers-low-window`); it asserts each premise first and prints plain numbers. Three runs of the full probe agreed on every number except two harness effects: one `launchPersistentContext` 180 s timeout in run 2 (G1 320×480, repeated alone, equal to runs 1 and 3) and a ±0.01 antialiasing jitter of one text-contrast sample (2.55 / 2.56). Frame sampling of item 105 was run three more times after the sampler start was fixed (identical). Pixel claims are screenshot pixels, not computed styles. The chip is produced by the real flows (a weather retry whose failure arrives late; the ensure failure forced by rejecting every sync write), not by writing into the DOM.

| Item | Measurement (1280×800 unless stated) | Reproduces | Conclusion |
|------|--------------------------------------|------------|------------|
| 15 | 188 links, page scrolled to the bottom (max scroll 344 at 1280×800, 1792 at 500×600). The chip (483.64×41.59 at top 742.41; 468×61.19 at 500×600) covers 6 tiles (f178 to f183, 17 967 px²) and 4 tiles (15 360 px²); the last tile's bottom is 41.59 px / 65.19 px below the chip's top, the document ends 16 px / 12 px below the last tile, so the last row cannot be scrolled clear. `elementsFromPoint` at the chip centre: `#desktop-status`, then the grid. | yes | Decision 2 stands as written. |
| 23 | Persistent ensure chip with the city modal / the wizard open (`.city-modal` z 100, chip z 50, topmost at the chip = the backdrop). 1280×800: no overlap. 500×360: the city modal overlaps the chip by 420×19.51 (21.7 %), the wizard by 420×30.01 (33.3 %). 320×480: modal 0, wizard 288×11.35 (11.3 %). With a late transient chip (retry failure) under Add link: 500×360 overlap 420×61.19 (89.7 %, the point at the chip centre is the dialog's form row); 320×480 overlap 288×61.19 (100 %, the chip is not visible at all). | yes | Decision 1 stands. Flow note: opening a desktop dialog (`openDesktopDialog`), a mutation and an edit-mode toggle call `showDesktopStatus("")`, so any chip, persistent or not, is gone when a dialog opens. A chip sits under a layer from the start only for the city modal and the wizard (the persistent ensure failure); under Add/Edit/confirm dialogs it can only arrive late. |
| 25 | Contrast of the chip text under the backdrop, measured on screenshot pixels outside the dialog: 1280×800 3.45:1 (light) and 2.55 to 2.56:1 (dark) for both the ensure chip (modal and wizard) and the retry chip (against 6.57:1 and 7.01:1 without a backdrop). 500×360: 3.34 / 2.44 (modal), 3.27 / 2.39 (wizard), 3.09 / 2.21 (retry chip under Add link). 320×480: 3.15 / 2.60 (modal). | yes | Decision 1 stands. |
| 41 (L2-02), 60 (V2-04) | City modal stacked over the weather edit dialog; the lower dialog stays `visibility: visible`, z 101 under the city modal z 102, `inert`. The lower card (420×256.09) protrudes above and below the city card (420×205.48) by 25.30 px and 25.31 px at 1280 and at 500; at 320×480 (288×305.78 against 288×205.48) by 50.14 px and 50.16 px; nothing at the sides (equal widths). Protruding: the title "Temperature" and both buttons Cancel and Save (at 320 the buttons lie wholly in the bottom strip). Pixels: the strip is 120 against 55 above and 102 against 41 below (a 61 to 68 per-channel difference from the plain backdrop). | yes | Decision 3 stands. The triage said "4 to 25 px"; today the strips are 25 px (1280, 500) and 50 px (320). |
| 9 | Add link at 1280×300 (the dialog scrolls, 434 / 266) and 320×480 (558 / 446), Tab and Shift+Tab through all 8 controls, ring pixels (focused against the title focused in the dialog). 1280×300: Tab onto Cancel and Add leaves the control 0.09 px past the scrollport bottom, the ring cut 2.09 px (0 of 2 px visible below); Shift+Tab onto the Name field leaves 0.09 px at the top, cut 1.91 px. 320×480: Shift+Tab onto the Link field cut 2.06 px at the top, onto Cancel and Add 1.31 px at the bottom. The forced-colors ring (4 px) would be cut 4.09 / 3.91 / 4.06 / 3.31 px. | yes | Decision 4 stands. The cut is 1.31 to 2.09 px (the run 39 figure 1.9 to 2.1 holds), and the control is the Name field at 1280×300 and the Link field at 320×480, not the Link field in both. |
| 20 | Edit link, 320×600: the favicon-mode link does NOT scroll (558 / 558, footer inside). A link with a Custom icon (its extra row is visible) scrolls: scrollHeight 643, clientHeight 566, footer 57.16 px below the scrollport, both buttons outside it, `elementFromPoint` at their centres is null. Favicon link at 320×480: 558 / 446, footer 92.31 px below. Add link: footer 148.09 px below at 1280×300, 48.09 px at 640×400. Edit weather: fits at 320×480 (304 / 304) and at 1280×300 (254 / 254); scrolls at 1280×240 (254 / 206, footer 28.09 px below). Every dialog at 1280×800 fits. | yes, for the Custom-icon link | Decision 5 stands. The triage numbers 643 / 566 are those of a Custom-icon link; a plain link at 320×600 has no defect. AS-LLW-05 Givens corrected. |
| 103 | Add link, 1280×300, a bad URL ("a b"), by click and by Enter: field top 85.09, slot 383.09 to 403.39, field to slot 258 px (318.3 px field top to slot bottom, the triage figure); slot 120.39 px below the scrollport bottom, scrollTop 0, field in view, focus on the Link field. | yes | Decision 6 stands. |
| 106 | Add link with a 2001-character Custom icon link. By pressing Enter in the field: 320×600 slot 49.75 px below the scrollport (field to slot 187.69 px, scrollTop 0); 640×400 slot 80.39 px below (field to slot 138 px). By clicking Add: the slot is inside (scrollTop 77 and 128), because the pointer scrolled the dialog to the button and `focus()` then centres the field. | yes, by keyboard submit | Decision 6 stands. The defect is the keyboard path (Enter in the field); the click path is by luck. AS-LLW-06 Given names the Enter path. |
| 105 | 188 links, 1280×600, `scrollY` sampled each frame after Cancel and after an add, opener opened by a real pointer press. Add fully in view (top 176, `scrollY` 400): Cancel 400 to 400, add 400 then a smooth glide to 624, never below the start. Add with its top 30 px above the window (`scrollY` 46): Cancel 46 to 10 at once, add 46 to 10 at once, then the glide to 624. Add with 30 px in view at the bottom edge (`scrollY` 406): Cancel 406 to 454, add 406 to 454, then 624. `scrollY` never reaches 0. | yes, with the opener partly out of the window | Decision 7 stands (`preventScroll`). What moves is a reveal of the opener by `focus()` (up to a 36 px jump up, 48 px down), not a jump "to the top" of the page; with the opener fully in view nothing moves (the AS-LLW-07 Given as first written would be green on main). AS-LLW-07 Given corrected. |
| 29 | Edit mode, 38 badges: at 360 and 320 (data-cell 56, gap 6, pad 8, offset 8, size 24) the first badge is at document top 0 (8 px above the grid's top edge, the page padding is 8) and at left 51 / 31 (8 px left of the grid); 37 of 38 badges enter a neighbour tile by 2 px (`f1` into `f0`, `f2` into `f1`, temperature into `f2`). At 500 (cell 64, gap 8, pad 12) and 1280 (cell 72, gap 8, pad 16) 0 badges enter a neighbour, the badge top is at 4 / 8. The badge centre hits its own badge everywhere. | yes (56 cell) | Decision 8 stands. "Touches the grid's top edge" is the document top (0 px) at 56; the 64 and 72 cells leave 4 and 8 px. |
| 109 | Busy city modal (title `tabindex=-1` focused, `:focus-visible`), 500×800: ring `box-shadow` `0 0 0 2px var(--focus-overlay-ring)` = rgba(17,19,24,0.55) light, rgba(244,246,248,0.6) dark, measured on pixels 4.12:1 (light) and 6.17:1 (dark) against the panel; the locked list uses the solid `--focus-ring` (18.58:1 and 14.76:1). | yes (two tokens) | Decision 9 stands as a consistency change; the title ring is not a contrast defect today (≥ 3:1), so AS-LLW-09 asserts the token and the 2 px width, and "darker than before" is the accepted cost. |
| 114 | Wizard, flag write rejected, locked list focused by keyboard, 1280×800 and 320×600, both themes (identical): computed outline `2px solid` of the solid token, offset -2 px, 8 rows, rows measured `position: static`. Pixels equal to the ring colour: left and right edge columns 49 of 245 (1280) / 49 of 189 (320) pixels beside rows against 24 of 24 / 18 of 18 in the gaps; top edge 2 of 372 / 240, bottom 0 of 372 / 240. The ring shows in the gaps and at the row corners only. | yes | Decision 9 stands. The triage mechanism "rows are `position: relative`" is wrong (static); the opaque row surfaces cover the list's own outline. The fix is judged by pixels (AS-LLW-09 already does), not by the mechanism. |
| 119 | Forced colours, the location link of the city modal and of wizard step 1, 500 and 320 wide: outline `2px solid`, offset 2 px (reach 4 px), padding-inline 1 px, margin-inline -1 px; text gap before the link 3.38 px; the ring's left edge is 1.63 px inside the last character ("r" of "or" in the modal, "," in the wizard) in all four cases. Screenshot of the last character's box (±2 px), focused against not focused: 42 / 42 / 40 / 42 pixels change in forced colours, 10 / 10 / 9 / 10 in the normal ring. | yes | Decision 10 stands. |

### Differences from the triage and what changes in this spec

- No item is dropped and no decision is dropped; nothing is added to `backlog.md` as non-reproducing.
- **AS-LLW-01 Given** is corrected: a persistent chip can be under the city modal and the wizard (ensure failure), but not under Add/Edit/confirm dialogs, which clear it on open; there only a transient chip that arrives while the dialog is open (a weather retry failing late, a failed write on a confirm dialog) can be covered.
- **AS-LLW-05 Given** is corrected: the dialogs that really scroll are Edit link of a Custom-icon link at 320×600, Edit link at 320×480, Add link at 1280×300 and 640×400, Edit weather at 1280×240 (not at 320×480).
- **AS-LLW-06 Given** names the keyboard submit (Enter in the field) for the Custom icon case.
- **AS-LLW-07 Given** puts the Add tile partly outside the window (otherwise `scrollY` does not move on `origin/main`).
- Chip sizes differ from the intake note (420×48 overlap): they depend on the message and the width (the retry failure is one line, 41.59 px, at 1280 and two lines, 61.19 px, at 500 and 320; the ensure failure is 61.19, 80.78 and 100.38 px at 1280, 500 and 320); the numbers above are for the real messages.
- Not measured: the `forced-colors` ring of the other dialog controls (computed 4 px reach only), reduced-motion variants, the Add menu, the wizard with a persistent chip and a validation error together. They stay with the E2E `dg-86` and the review.

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
- Given: a persistent chip (the ensure failure, forced by rejecting every sync write) with the city modal in change mode and with the wizard on a first run, at 1280×800, 500×360 and 320×480; and a transient chip that arrives while Add link is open (a weather retry whose failure is delayed until after the dialog opens), at 500×360 and 320×480. A chip does not exist when a desktop dialog opens (`openDesktopDialog` clears it), so "a persistent chip, then Add link" is not a reachable state (step 1).
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
- Given: Edit link of a link with a Custom icon at 320×600 (measured 643 / 566), Edit link at 320×480 (558 / 446), Add link at 1280×300 and at 640×400 (200 % zoom), Edit weather at 1280×240 (254 / 206); each dialog really scrolls (`scrollHeight > clientHeight`). Edit link of a plain link at 320×600 and Edit weather at 320×480 do not scroll on `origin/main` (step 1), so they are control cases for "a dialog that fits is unchanged", not premises of this AS.
- When: opened, nothing scrolled.
- Then: Cancel and Save are fully inside the card and the window; scrolling the form moves the fields under the footer and never the footer; the footer has a `--panel` background and a visible top divider while content is under it; Tab order, 50/50 widths, the 16 px gap and Escape are unchanged; in 1280×800 every dialog rectangle and every control rectangle equals `origin/main` within 0.5 px; forced colors keep the divider visible.
- Verified by: E2E `dg-86`; `dg-83` stays green.

### AS-LLW-06 A validation error is on screen (Ruling 5)
- Given: Add link with a bad URL at 1280×300; Custom icon with a 2001-character link at 320×600 and at 640×400, submitted by pressing Enter in the field (a click on Add scrolls the dialog to the button first and hides the defect on `origin/main`, step 1); a name over the limit.
- When: Save.
- Then: the alert slot is inside the scrollport and the dialog scrolls instantly (no animation); where the field and the slot fit together both are inside; at 1280×300 the slot is inside and the field has focus; `aria-invalid`, `aria-describedby` and the text are those of `origin/main`; a second Save does not scroll further.
- Verified by: E2E `dg-86`; `dg-83`.

### AS-LLW-07 Add does not jump the page
- Given: enough links for the page to scroll (188 links at 1280×600), the page scrolled so that the Add tile is partly outside the window (its top 30 px above it, and in a second case only 30 px of it at the bottom edge), opened by a real pointer press on the visible part. With the Add tile fully in view `scrollY` does not move on `origin/main` (400 to 400, step 1), so that case is only a control.
- When: open Add link and Cancel; then add a link whose tile is below the fold.
- Then: after Cancel `scrollY` is unchanged (±1; `origin/main` moves it 46 to 10 and 406 to 454); after the add the page goes only to the new tile (smooth, as `docs/link-dialog-validation.md`), never through the top: `scrollY` never drops below the starting value during the 600 ms after the close (sampled each frame); with reduced motion no animation.
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
