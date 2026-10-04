# City modal: the 39 px jump at the fit threshold

## Status

`draft` (stage 0, not yet through the spec gate)

Decision: **do it**, with a small change that makes the room kept for an error message shrink continuously with the window height instead of switching off at one pixel. Backlog item 6 ("dialog jumps by 39 px at the threshold; large; rewrites the logic of the low-window run, dg-47/dg-48") was reproduced and measured. The jump is real and has exactly one source. It is **not** a large rewrite: the same `placePopover` pass, the same thresholds for the `compact` class, one custom property instead of one `min-height: 0` rule (see "Default decisions"). One part of the intake is **not** removed and is recorded as an accepted exception: the list flips between overlay and docked at one height, which moves the buttons by the list's own height (see "Accepted exceptions").

## Intake log

| Date | Raw note (backlog item 6) | Verdict | Reference |
|------|---------------------------|---------|-----------|
| 2026-10-05 | "Dialog jumps by 39 px at the threshold." | `confirmed`, one source | The reserve of `docs/city-modal-low-window.md` (decision 1) is all-or-nothing: the feedback block is 39.19 px tall at heights from T up and 0 px from T-1 down. Measured at 320 px wide, first-run, no list: one window pixel (337 to 338) changes the dialog height by +39.2, its top by -19.1, the field by -19.1 and the buttons' bottom by +20.1. See "Measurements". |
| 2026-10-05 | "Rewrites the logic of run #5, dg-47/dg-48." | `rejected as stated` | The `compact` class stays and flips at the same heights; the check `compact === (withReserve > H - 32)` of `dg-48` stays true. The only code change is how much of the reserve is given up: all of it (before) or exactly as much as the window lacks (after). `dg-47` is unchanged (83/83 on a prototype). `dg-48` has one Mac-only failure that is already on `main`; `dg-49` pins the old binary behaviour in four windows and is rewritten (see "Scope"). |
| 2026-10-05 | Backlog item 8: `dg-48` AS-LW-03 and `dg-49` AS-LW-06 fail at 360 px on a Mac, cause not established. | `cause established`, separate from the jump | At 360 px wide the first-run description wraps to two lines on this Mac and to three on the cloud Linux, so the dialog with the reserve is 279.45 px, not the 305.5 the two scenarios hard-code for 360 (they copy the 320 numbers). Not a product defect and not the jump mechanism. This run makes the new and the amended scenarios derive their thresholds from a measurement, which closes the 360 px failures (see "Relation to backlog item 8"). The Chrome launch retry part of item 8 stays open. |
| 2026-10-05 | Not in the intake, found while measuring: the list's overlay/docked flip. | `confirmed`, kept | The list flips at one height and moves the buttons by the list height plus 5 px. Intrinsic (in flow versus floating); see Accepted exceptions. |

## Why it happens (mechanism)

`placePopover` (`src/newtab.js`) decides `compact` from the dialog height *with* the two-line reserve (`.city-modal__feedback`, `min-height: calc(2 * var(--line-height-body) * var(--font-size-md))` = 39.19 px): compact when `withReserve > innerHeight - 2 * VIEWPORT_MARGIN`. In compact the rule `.city-modal__dialog--compact .city-modal__feedback { min-height: 0 }` drops the whole 39.19 px. A window one pixel above the threshold T = `withReserve + 32` keeps all of it; one pixel below keeps none. The dialog is vertically centered (`.city-modal` is a flex center), so the height step moves the dialog's top by half of it and the field with it. Between `base + 32` and T the dialog could have been *exactly as tall as the window allows* (`innerHeight - 32`) with a partial reserve, and was instead shorter than the window and centered.

The list adds a second step at the same place on `main` (the docked/overlay decision uses `free` measured on the layout the reserve changed, so the mode flips at T too and its jump partly cancels the reserve's jump). That is why the buttons' net step looks different with 0, 1, 3 or 8 rows.

## Measurements

Chromium via Playwright (`.private/e2e/lib/harness.mjs`), `main` at `29f8758`, unpacked extension, Open-Meteo routed to N canned suggestions (`Tbilisi 1..N`) or to HTTP 503 for the error cases. Method: open the modal in a tall window, then shrink the viewport one pixel at a time (`setViewportSize`, 110 ms settle) from 700 px to 200 px (both modes; widths 320, 360, 400, 500; rows 0, 1, 3, 8; error none and `http`; 40 sweeps of 501 heights per build), recording per height the dialog box, the field box, the Save button bottom, the feedback block height, the classes `compact`, `scroll`, the list's `docked` class and the dialog's `scrollHeight`/`clientHeight`. A "step" is the change of an edge between two adjacent heights. Fresh opens at every height (no history) were measured on windows around the thresholds and equal the resized ones to 0.00 px (320 first-run 0 and 3 rows, 400 first-run 3 rows, 320 change 3 rows).

Thresholds on this Mac (the cloud Linux wraps the 360 px description differently, so the 360 numbers there are those of 320; the scenarios derive them, they are not constants). `base` = dialog height without the feedback block; T = `base + 39.19 + 32`; the dialog scrolls (`scroll`) below `base + 32`:

| Window | base | T (class `compact` off from here) | partial band (`base + 32` .. T) |
|--------|------|-----------------------------------|----------------------------------|
| first-run 320 | 266.36 | 338 | 299..337 |
| first-run 360 and 400 | 240.26 | 312 | 273..311 |
| first-run 500 | 222.87 | 295 | 255..294 |
| change, any width 320..500 | 176.09 | 248 | 209..247 |

**Before (`main`), 320 first-run, no list, no error**

| H | dialog top..bottom (height) | field top | Save bottom | feedback |
|---|-----------------------------|-----------|-------------|----------|
| 298 | 16.00..282.00 (266.00) | 165.36 | 261.36 | 0 |
| 320 | 26.81..293.17 (266.36) | 176.17 | 272.17 | 0 |
| 337 | 35.31..301.67 (266.36) | 184.67 | 280.67 | 0 |
| **338** | **16.22..321.77 (305.55)** | **165.58** | **300.77** | **39.19** |
| 340 | 17.22..322.77 (305.55) | 166.58 | 301.77 | 39.19 |

Step 337 to 338: dialog height **+39.2**, dialog top **-19.1**, field **-19.1**, Save bottom **+20.1**. In the whole 200..700 sweep that is the only step over 1.0 px with no list, for every width and both modes: first-run 320 at 338, 360 and 400 at 312, 500 at 295; change at 248.

**After (prototype, same windows)**

| H | dialog top..bottom (height) | field top | Save bottom | feedback |
|---|-----------------------------|-----------|-------------|----------|
| 298 | 16.00..282.00 (266.00) | 165.36 | 261.36 | 0 |
| 310 | 16.00..293.98 (277.98) | 165.36 | 272.98 | 11.63 |
| 320 | 16.00..303.98 (287.98) | 165.36 | 282.98 | 21.63 |
| 330 | 16.00..313.98 (297.98) | 165.36 | 292.98 | 31.63 |
| 337 | 16.00..320.98 (304.98) | 165.36 | 299.98 | 38.63 |
| 338 | 16.22..321.77 (305.55) | 165.58 | 300.77 | 39.19 |

The dialog is exactly `H - 32` tall (minus at most 0.02 px) from `base + 32` to T, then centered at its full height. Largest step of any edge between two adjacent heights, over the whole sweep: **1.0 px** (Save bottom and dialog bottom, 1 px per px; dialog top and field 0.5 px). Before: 39.2 (height), 19.1 (top, field), 20.1 (Save bottom).

**With a list open (1, 3, 8 rows), before and after.** The list flips docked (in the dialog's flow) to overlay at one height. Before it flipped at T; after it flips where `free = innerHeight - fieldBottom - 6 - 16` reaches 96:

| Window | flip before | flip after | Save bottom step at the flip, 1 / 3 / 8 rows, before | after |
|--------|-------------|------------|--------------------------------------------------------|-------|
| first-run 320 | 338 | 324 | -20.6 / -100.6 / -300.6 | -59.0 / -139.0 / -339.0 |
| first-run 360 and 400 | 312 | 298 | -20.5 / -100.5 / -300.5 | -59.0 / -139.0 / -339.0 |
| first-run 500 | 295 | 280 | -20.4 / -100.4 / -300.4 | -59.0 / -139.0 / -339.0 |
| change, 320..500 | 248 | 234 | -20.4 / -100.4 / -300.4 | -59.0 / -139.0 / -339.0 |

All other steps are 1.0 px or less. No step of the reserve remains with a list either. With an error on screen (`http`, 0 rows) the curves of `main` and the prototype are identical (the text fills the room, there is nothing to give up): no step over 1.0 px before or after.

**Neighbours.** The prototype passes `dg-47` 83/83, `dg-45` 23/23, `15-city-modal-layout` 47/47, `13-city-modal` 127/127, `dg-15` 11/11, `dg-25` 6/6, `dg-29` 21/21, `dg-39` 25/25, `dg-41` 32/32 and `dg-52` 85/85 untouched; `dg-48` 83/84 (the one Mac failure of `main`, AS-LW-03's 305.5 at 360 px); `dg-49` 10/22 (the 4 known 360 px checks plus 8 that encode the old all-or-nothing behaviour: 320x337, 320x336, 400x311, 400x300, each two checks).

## Relation to backlog item 8

The 360 px failures of `dg-48` AS-LW-03 (1 check) and `dg-49` AS-LW-06 (4 checks) are caused by hard-coded numbers, not by the product. `dg-48` AS-LW-03 asserts the dialog height with the reserve at 800 px is 305.5 at 320 **and 360** and 279.5 at 400; this Mac measures 305.55 / 279.45 / 279.45 (the 360 px description wraps to two lines here, to three in the cloud Linux). `dg-49` takes the heights 337 and 320 for 360 px from the 320 px case. Neither is the jump mechanism. Decision: **close them in this run** by deriving the thresholds from one measurement per width (the dialog height with the reserve, read in a tall window, and the height where the list flips, read from the page), in `dg-53` and in the amended `dg-48` group 3 and `dg-49`. The backlog item shrinks to the Chrome launch retry (`launchPersistentContext` timeout under load), which this run does not touch.

## Default decisions (owner can override)

1. **Do it: the reserve shrinks continuously.** Kept room `r = clamp(innerHeight - 2 * VIEWPORT_MARGIN - base, 0, fullReserve)`, rounded down to 0.01 px. Where the window holds the full reserve, `r` is the full 39.19 px and nothing changes (AS-CE-04 untouched). Where it holds less than the dialog's `base`, `r` is 0 as today. In between the dialog is exactly as tall as the window allows and the blank strip between the field and the buttons grows smoothly. *Reason:* it removes the only discontinuity without a new rule about where things go; the dialog top is 16 px at both ends of the band (`H - 32 = base` and `= T - 32`), so the function is continuous in the dialog's size, top, field and buttons.
2. **Mechanism (the order is mandatory, names are suggestions).** `.city-modal__feedback` keeps its rule but reads `min-height: var(--city-feedback-reserve, calc(2 * var(--line-height-body) * var(--font-size-md)))`; the rule `.city-modal__dialog--compact .city-modal__feedback { min-height: 0 }` is removed. `placePopover` does: (1) remove `docked`, `scroll`, `compact` and the inline custom property; (2) flush layout, read the full reserve and `base = dialog height - feedback height` (error-independent, as today); (3) compute `r` with the pure helper below; when `r < fullReserve` set the property on the dialog (`style.setProperty`) and add `compact`; (4) with that layout measure `free` and `tooTall`; (5) set `docked` and `scroll`. No new listener, no `ResizeObserver`, the same callers (open, resize, list render, `syncCityModal`). Text still goes through `textContent`; no new token.
3. **`compact` stays as a marker with the meaning "the reserve is below its full value"** (same heights as today: `compact === (withReserve > H - 32)`), so `dg-48`'s check and the class names in `dg-49` keep their meaning. It no longer carries a CSS rule; the value lives in the custom property.
4. **Pure helper `feedbackReserve({ viewportHeight, baseHeight, fullReserve, margin })`** in `src/cityPrompt.js` (the existing pure city-modal rules file; same pattern as `shouldAutoShowCityPrompt`) returns the kept room in px, rounded down to 0.01, never above `fullReserve`, never below 0; any non-finite input returns `fullReserve` (fail closed to today's roomy layout, as the old comparison did). `newtab.js` calls it; it is the unit-tested core.
5. **Maximum step: 1.5 px** per one pixel of window height for the dialog's top, bottom and height, the field's top and bottom, both buttons' top and bottom and the feedback block (natural slope is 1.0; the tolerance covers fractional layout). The only exempt step is the list's docked/overlay flip (decision 6).
6. **The list's docked/overlay flip is not changed** and is recorded as an accepted exception. Two ways to remove or soften it were considered and rejected: keep the flip at T by deciding `free` on the full-reserve layout (it would let an overlay list run off the window in the partial band, the exact fault `dg-49` was written against), and a hysteresis (it would make the layout depend on the resize history, which AS-LW-03 forbids). After this change the flip is at the height where `free` reaches 96 on the layout the dialog really has (324, 298, 280, 234 here), the same rule `docs/network-error.md` and `docs/docked-list-focus-ring.md` rely on.
7. **Thresholds untouched:** `POPOVER_MIN_FREE` 96, `POPOVER_MAX_HEIGHT` 240, `POPOVER_GAP` 6, `VIEWPORT_MARGIN` 16, the dialog padding, the two-line reserve and its tokens. The flip height of the list moves as a consequence of the layout, not of a changed constant.
8. **Amends** `docs/city-modal-low-window.md` (Default decisions 1 to 3, AS-LW-03 numbers, Accepted exceptions "no zero-shift guarantee in a compact window", the "fit threshold" Review focus item, which asked exactly this) and `docs/city-error-ux.md` (decision 3 note, AS-CE-04 and AS-CE-05 wording: the reserve is full wherever the dialog fits with it, partial below, and 0 below `base + 32`). The `compact` doc sentences are corrected by AS-DJ-11.
9. **Not done, honestly:** the list flip (decision 6), the zero-shift guarantee in the partial band (an error that appears there still adds its own height to the scroll content: the dialog is at its cap, so *Save* moves below the fold exactly as in a compact window today), and any redesign of the buttons (sticky row) or the description.

*Alternatives rejected:* (a) **One-line reserve everywhere** (19.6 px): halves the step, does not remove it, and narrows AS-CE-04. (b) **Hysteresis or a short transition on the height:** history-dependent or animated geometry, contradicts AS-LW-03 and "no transitions" of the modal. (c) **CSS-only flex shrink** (dialog `display: flex; flex-direction: column`, `max-height` always on, feedback block `flex-shrink: 1; min-height: 0; flex-basis: 39.19px`): needs the cap on the dialog in every mode, but overlay mode needs the popover to hang past the dialog's bottom edge, so it would force a second structure. (d) **No reserve at all:** drops AS-CE-04 for every window. (e) **"Not done", keeping the jump:** rejected because the cost is one helper, one property and the amended scenarios, and the measurement shows one discontinuity with one cause.

## Scope

- `src/newtab.js`: `placePopover` steps (1) to (3) as in decision 2; the helper is imported. Nothing else changes in `newtab.js` (`clearCityError`, `syncCityModal`, `changeCity`, the builder untouched).
- `src/cityPrompt.js`: `feedbackReserve`. `src/surfaces.css`: the `min-height` of `.city-modal__feedback` reads the property; the compact rule and its comment are replaced by one comment on the property.
- Unit: `test/cityPrompt.test.js` (the helper); `test/cityModalFeedback.test.js` (three tests of "city modal in a very low window" are rewritten for the new order, the property, and the removed rule; the `compact` toggle line `withReserve > ...` becomes the helper call; the thresholds and "no `ResizeObserver`" pins stay).
- E2E: new `dg-53-dialog-threshold-jump.mjs` (the last number is `dg-52`); amended `dg-48-city-modal-low-window.mjs` (group 3: measured thresholds instead of 305.5 / 279.5 constants and a per-width grid derived from T); amended `dg-49-city-modal-placement-order.mjs` (the compact windows are those *below the flip*, the control windows *above* it, both derived by measurement; the check keeps its purpose, the order of steps (3) and (4)). Untouched and expected unchanged: `dg-47`, `dg-45`, `dg-52`, `15-city-modal-layout`, `13-city-modal`, `dg-15`, `dg-25`, `dg-29`, `dg-39`, `dg-41` (all run on the prototype with the counts in "Measurements").
- Docs: `docs/city-modal-low-window.md` and `docs/city-error-ux.md` (per decision 8), `docs/architecture.md` § Weather (the sentence about releasing the reserve), `CHANGELOG.md` `[Unreleased]`. `docs/design-system.md`: no change (it does not mention the feedback block; no new token). README screenshot: not affected.
- Notes repo: the plan, this run's ledger, `backlog.md` (item 6 done, item 8 narrowed), `history.md`.

## Process

This changes what the user sees (the dialog's geometry while the window is resized or the page is zoomed), so it follows the full UI-phase cycle: spec, plan, independent design review (`design-review/PROTOCOL.md`; visual lens at 320 and 400 px wide, heights T-40, T-1, T, T+1 and `base + 32`, with and without a list and an error), E2E, merge by the pipeline rules after the owner confirms.

E2E commands: the new scenario alone `node .private/e2e/run.mjs --repo . --only dg-53 --base 67b3e32`; the full run `node .private/e2e/run.mjs --repo . --base 67b3e32`. **Run E2E strictly one process at a time** (two parallel runs hang the harness, backlog item 8). Note for the implementer: `buildFromDir` deletes and recreates `.private/e2e/.build/<name>`; parallel measurement scripts must build once and share the directory.

## Non-goals

- The list's docked/overlay flip and the list's own metrics (`placePopover`'s `free < POPOVER_MIN_FREE` rule and constants).
- The 39.19 px reserve itself (one or two lines), the blank strip in tall windows, the description text, paddings, tokens, button sizes, the error texts.
- Keeping the buttons in view after an error appears in a window that cannot hold the dialog (auto scroll, sticky row).
- The desktop dialogs, the stacked city modal's own geometry, the weather tiles.
- The Chrome launch retry (backlog item 8, second half).
- Browser zoom itself: it is covered as a viewport size (the CSS viewport shrinks); no zoom-specific code.

## Accepted exceptions

- **The list flip is a step the size of the list.** With suggestions open, shrinking the window across the flip height moves *Save* up by the docked list's height plus 5 px when the list leaves the flow (59 / 139 / 339 px for 1 / 3 / 8 rows) and back. It was 20.6 / 100.6 / 300.6 px at 338 before this change, because the reserve step happened to cancel part of it; it is larger now and sits lower (324 / 298 / 280 / 234 instead of 338 / 312 / 295 / 248). Accepted: a list in the flow and a floating list are two different layouts by design (`docs/city-error-ux.md`, AS-CE-02), the user rarely resizes while typing, and any smoothing is a redesign.
- **No zero-shift guarantee in the partial band.** There the dialog fills the window, so an error that appears pushes the buttons out of view (the dialog scrolls); the same exception as a compact window before (`docs/city-modal-low-window.md`).
- **Fractional layout.** The kept room is rounded down to 0.01 px so that the dialog is never taller than the window by a rounding error (which would add a useless scroll cap). The dialog is up to 0.02 px shorter than `H - 32` in the partial band.
- **The 360 px numbers differ between a Mac and the cloud Linux** (the description wraps differently). Scenarios derive them; the spec's Mac figures are measurements, not constants.

## Acceptance scenarios

Common setup of the E2E (`dg-53`): the harness as in `dg-48`/`dg-52` (`launch(..., { autoPrompt: true })`, clean profile, default metrics and chrome tiles seeded with `widgetStorageV2`, `openModal(page, mode)` as in `dg-48`), Open-Meteo routed by `setNet` for N canned suggestions `Tbilisi 1..N` or HTTP 503. First-run unless stated; change mode is the click on the "Set a city" hint tile after `quietTabWeatherPromptDismissed`. **Per-width reference values are measured, never typed in:** `withReserve` = the dialog height in a 800 px high window; `base = withReserve - 39.19` (the feedback block is read from the page); `T = ceil(withReserve + 32)`; `bandLow = ceil(base + 32)`. "Step" = the change of an edge between two adjacent heights (1 px apart), "edges" = dialog top, bottom and height, field top and bottom, Save top and bottom, *Not now*/*Cancel* top and bottom, feedback height. Sweeps are resizes of an open modal (`setViewportSize`, 150 ms settle) downward from 800 px unless "fresh" is stated (reload at each height). Height grid of a sweep: every pixel from `bandLow - 8` to `T + 8`, every 5 px from 200 to `bandLow - 8` and from `T + 8` to 700. Widths: 320, 360, 400, 500 (first-run), 320 and 400 (change).

### AS-DJ-01 No list, no error: every edge moves at most 1.5 px per window pixel

- Given: the sweep grid above, no suggestions, no error, at each of the six width/mode pairs.
- When: the window height changes from 700 to 200 px (and again from 200 to 700 px).
- Then: for every pair of adjacent heights every edge changes by at most 1.5 px in absolute value. There is no step of 39 px (or any size over 1.5) anywhere, including at `T - 1`/`T` and `bandLow - 1`/`bandLow`. The largest step per sweep is recorded in the run record (1.0 px expected).
- Verified by: `dg-53` (group 1). Expected before the change: red at `T` for every pair (39.2 / 19.1 / 20.1).

### AS-DJ-02 The room kept for an error is exactly as large as the window allows

- Given: the same sweeps, no error.
- When: at each height H of the grid the feedback block and the classes are read.
- Then: the feedback height equals `clamp(H - 32 - base, 0, 39.19)` within 0.1 px, **and no tolerance on the comparison that decides the state**: `compact` is present iff `withReserve > H - 32` (strict, the same as `dg-48` group 3); the inline custom property is present iff `compact` is; from `bandLow` to `T - 1` the dialog height is `H - 32` (never above it, at most 0.05 px below), `scrollHeight <= clientHeight + 1` and no `city-modal__dialog--scroll` class unless the list is docked (so the partial reserve never produces a useless scroll); from `T` up the feedback block is 39.19 +/- 0.1 and the dialog is as tall as `withReserve` (AS-CE-04 and AS-CE-05 hold untouched); below `bandLow` the block is 0 and the dialog scrolls as before.
- Verified by: `dg-53` (group 1); unit AS-DJ-07 for the function itself.

### AS-DJ-03 The buttons stay visible where they were (AS-LW-01 not regressed)

- Given: the sweep grid at every width/mode pair, no list, no error.
- When: at each height from `bandLow - 20` upward (279 at 320 and 260 at 400 on this Mac, the floors of `dg-48` group 1; every height of the partial band included) the dialog is at rest (`scrollTop` 0).
- Then: *Not now*/*Cancel* and *Save* are visible at rest by the definition of `dg-48` (inside the dialog box minus the 1 px border and inside the viewport; no horizontal scroll) for every height of the partial band and above. `dg-48` group 1 (84 checks) is run unchanged apart from its group 3 and passes as on `main`.
- Verified by: `dg-53` (group 1) and `dg-48`.

### AS-DJ-04 With a list open the only discontinuity is the list's flip

- Given: first-run 320, 400 and 500, change 320; 1, 3 and 8 suggestions typed (`Tbil`); the sweep grid extended to cover the flip heights (every pixel from `flip - 6` to `flip + 6`).
- When: the window height changes from 700 to 200 px.
- Then: every step is at most 1.5 px except at most one step per sweep where the list's `docked` class changes; at that step Save's bottom moves by at most `dockedListHeight + 8` (the docked list is read from the page at the height just below the flip; 59 / 139 / 339 + 5 expected), and the flip happens where the existing rule says: `docked === (free < 96)` with `free = H - fieldBottom - 6 - 16` read from the page, **no tolerance**, at every height of the grid. The overlay list never leaves the viewport (`list.bottom <= innerHeight - 16 + 1`) and its inline `max-height` is `min(240, free)`.
- Verified by: `dg-53` (group 2). Expected before the change: red on the step at `T` (Save bottom -20.6 / -100.6 / -300.6 combined with the 39.2 reserve step; the reserve part alone is over 1.5).

### AS-DJ-05 Errors in the partial band: the state does not depend on the error

- Given: first-run 320 and 400 at `T - 20`, `bandLow + 2`, `bandLow - 2`, `T` and `T + 1`, and change 320 at its own `T - 20`; the `http` error and the `network` error produced by Save.
- When: an error appears, is cleared by an edit, appears again; and, separately, the window is resized by one pixel with the error on screen.
- Then: `compact` and the property value are the same before, during and after every error step (the decision uses the reserve-independent height, `docs/city-modal-low-window.md` decision 2); at `T` and `T + 1` the dialog, the field and *Save* have the same `top` and `height` (+/- 0.5) at rest, with the error and after the edit (AS-CE-04 intact); in the partial band the error text is not clamped (`errorClamped === false`), the dialog scrolls, after scrolling to its end the error and both buttons are inside the dialog's visible box and the viewport, no horizontal scroll, the modal stays open and the typed city is kept; no step over 1.5 px when the window is resized by one pixel with the error shown (the curves with an error equal those of `main`).
- Verified by: `dg-53` (group 3); `dg-47` (unchanged, 83/83) and `dg-48` group 3 and 4 (amended, derived thresholds).

### AS-DJ-06 The layout depends on the window, not on how it got there

- Given: first-run 320 and 400, change 320, with and without three suggestions.
- When: heights from the partial band, `T - 1`, `T`, `T + 1` and the flip height are reached (a) by a fresh open (reload) at that height, (b) by a resize from 800 px, (c) by a resize from 200 px, and (d) the sequence 800 -> H -> 800 -> H.
- Then: the boxes of the dialog, the field, *Save* and the feedback block, and the classes `compact`, `scroll`, `docked`, are identical (+/- 0.05 px) across (a) to (d); after the round trip 800 -> H -> 800 the layout equals the first 800 px layout exactly; the custom property is absent at 800 px.
- Verified by: `dg-53` (group 4).

### AS-DJ-07 The helper `feedbackReserve` (unit)

- Given: `src/cityPrompt.js`.
- When: `feedbackReserve({ viewportHeight, baseHeight, fullReserve: 39.19, margin: 16 })` is called.
- Then: with room for everything (`viewportHeight - 32 >= baseHeight + 39.19`) it returns 39.19 exactly; one pixel less than the threshold returns the room (`39.19 - 1`, rounded down to 0.01); at `viewportHeight - 32 == baseHeight` and below it returns 0; it is monotonic in `viewportHeight` and never above `fullReserve` or below 0; rounding is down (a room of 12.349 returns 12.34); a non-finite or missing input (NaN, undefined, Infinity for `baseHeight`, a negative `fullReserve`) returns `fullReserve` when that is finite and non-negative, else 0; the function has no side effects and touches no DOM.
- Verified by: new cases in `test/cityPrompt.test.js`. Expected before the change: red (no export).

### AS-DJ-08 Source guards (unit)

- Given: `src/newtab.js`, `src/surfaces.css`.
- When: the sources are parsed (comments stripped, as `test/cityModalFeedback.test.js` does).
- Then: `placePopover` contains, in this order: removal of `docked`, of `scroll` and `compact`, of the custom property; the base measurement (dialog height minus feedback height); the helper call; the `setProperty` and `compact` add under `if` on the helper's result being below the full reserve; `const free =`; `const tooTall =`; the `docked` toggle; the `scroll` toggle. `.city-modal__feedback` declares `min-height` through `var(--city-feedback-reserve, calc(2 * var(--line-height-body) * var(--font-size-md)))` and nothing else; no rule `.city-modal__dialog--compact .city-modal__feedback` exists; no `ResizeObserver` and no new resize listener; the constants `POPOVER_MAX_HEIGHT = 240`, `POPOVER_MIN_FREE = 96`, `POPOVER_GAP = 6`, `VIEWPORT_MARGIN = 16` are unchanged; the `transition`/`animation` count in `src/surfaces.css` city-modal rules is 0 (the modal has no transitions, which is why reduced motion needs no code).
- Verified by: the rewritten `test/cityModalFeedback.test.js`.

### AS-DJ-09 Widths, themes, forced colors, reduced motion, zoom

- Given: first-run at 320, 360, 400, 500 and 1280 px wide at heights `T - 20`, `bandLow`, `T` and (for 1280) 800; light, dark, forced colors (`emulateMedia({ forcedColors: "active" })`, reset to `none` in `finally` as `dg-50`), `reducedMotion: "reduce"`; and a device scale factor 3 and 1.25 (CDP `Emulation.setDeviceMetricsOverride`), which is how a zoomed page appears to the layout.
- When: the modal is open at rest.
- Then: the geometry (dialog, field, buttons, feedback height) is identical in the four rendering modes and both scale factors (+/- 0.05 px; the property does not depend on color, motion or density); there is no horizontal scroll; the dialog never has a rounding overflow (`scrollHeight <= clientHeight + 1`) in the partial band at scale 3 and 1.25; in forced colors the dialog border, the buttons and the focus outline are visible (the existing `dg-41`/`dg-50`/`dg-51` pins stay green); with reduced motion the modal has no animation or transition anywhere in the sweep (`getAnimations()` is empty).
- Verified by: `dg-53` (group 5); design review for the visual impression.

### AS-DJ-10 Keyboard in the partial band and across the flip

- Given: first-run 320 at `T - 20` and at the flip height, three suggestions; and 400 at `T - 20`.
- When: Tab from the open modal through the field, *Clear city*, the rows, *Not now* and *Save* (the walk of `dg-52`, ring cut measured the same way), ArrowDown/ArrowUp through the rows, Escape (list first, then the modal), Enter in the field, and a one-pixel resize while the focus is on a row, on *Save* and in the field.
- Then: the stop order is as in `dg-52` AS-FR-04; every focused control's ring is whole (cut <= 0.05 px against every scrolling ancestor) and, in the partial band, fully inside the viewport; a resize does not move focus, close the list (unless the existing rules do) or scroll the dialog; Enter still submits; Escape layers are as before (`escapeLayer`). At 400x300 (now an overlay) the list is reachable by ArrowDown and `list.bottom <= innerHeight - 16 + 1` at rest.
- Verified by: `dg-53` (group 6) reusing `ringCut` of `dg-52`; `dg-52` (85/85) and `13-city-modal` (127/127) unchanged.

### AS-DJ-11 Documents say what the product does

- Given: the branch of this phase.
- When: the documents are read after the change.
- Then: (1) `CHANGELOG.md` `[Unreleased]` / Fixed has one entry in user language, e.g. "City dialog: resizing the window (or zooming) no longer makes the dialog jump by about 40 px at one particular height; the free space under the city field now shrinks smoothly as the window gets lower. E2E: `dg-53-dialog-threshold-jump.mjs`." No words such as "reserve", "compact", "feedback block". (2) `docs/city-modal-low-window.md` Default decisions 1 to 3, AS-LW-03, the Accepted exceptions item "No zero-shift guarantee in a compact window" and the "fit threshold" Review focus item name this run and the continuous rule; its Status line points to this spec. (3) `docs/city-error-ux.md` decision 3 note and AS-CE-04/AS-CE-05 wording say the reserve is full where the dialog fits with it, partial down to the dialog's height without it, and zero below. (4) `docs/architecture.md` § Weather: the sentence about releasing the reserve says it shrinks with the window. (5) Spec status in this document is changed from `draft` by the pipeline (not by the implementer's final edit).
- Verified by: the independent verifier reads the diff; `grep -n "reserve\|compact\|feedback" CHANGELOG.md` finds nothing in `[Unreleased]` for the new entry.

### AS-DJ-12 The 360 px failures of item 8 are closed

- Given: a Mac with the 360 px description wrapping to two lines, and the cloud Linux (three lines).
- When: `dg-48` and `dg-49` run.
- Then: no hard-coded 305.5 / 279.5 or per-width height lists remain in `dg-48` group 3 and `dg-49`; thresholds are derived as in "Acceptance scenarios" (the same helper functions are shared with `dg-53`); on this Mac `dg-48` 84/84 and `dg-49` pass in full; the amended `dg-49` still pins the order of `placePopover` steps (3) and (4): windows **below the list's flip** at 320, 360, 400 (docked, `maxHeight` empty, `compact`) and windows from the flip up to `T - 1` (overlay, inline `max-height`, `compact`), and controls at `T`, `T + 1`, 800.
- Verified by: `dg-48`, `dg-49` (amended), `dg-53`.

## Review focus

- **Scenarios and states (lens 1):** the partial band. Does a window one pixel taller or shorter than any height in it look continuous (field fixed, buttons moving 1 px, the strip between them growing)? At 320x330 and 400x305 with the list open: overlay list over the buttons is as before at taller windows; is the reduced `max-height` (about 100 px, two rows) acceptable at 320x330, where it was a docked list showing all rows before? Does the error behave at the band's edges (AS-DJ-05)?
- **Visual and layout (lens 2):** compare 320x337 against 320x338 side by side (the former jump), and 320x300 against 320x330 (strip 0 to 31 px). The dialog now touches the 16 px margin at both ends of the band. The list flip at 324 (was 338): look at 3 rows at 320x323 and 320x325, the 139 px step is intended to be visible there.
- **Accessibility and text (lens 3):** focus ring and reach of the buttons in the band, forced colors, scale factor 3 (zoom), reduced motion. No new text; the CHANGELOG line is the only copy.
- **Risk of the fix itself:** a rounding overflow (a dialog 0.01 px taller than the window would get a scroll cap and a flicker) and the measurement order (the property must be removed before the base is read, or the base shrinks with the room). The fresh-versus-resized equality (AS-DJ-06) guards both.
- **Contradictions:** none intended with AS-CE-01..05, AS-NE-01..05, AS-FR-01..10; the amendments to `docs/city-modal-low-window.md` and `docs/city-error-ux.md` are listed in decision 8 and AS-DJ-11.

## Changes after review

None yet (spec gate pending).
