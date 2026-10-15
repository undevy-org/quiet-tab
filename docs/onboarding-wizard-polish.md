# Onboarding wizard polish: click guard after close, focus without scroll, locked rows after a flag failure, progress name

## Status

`implemented` — revision 3 (2026-10-15: implementation findings added after the spec gate of revision 2: `restoreFocus`, the guard cleared on open, AS-POG-07 superseded; Minor of spec review 2 and the gate applied below). Run №42 (`onboarding-wizard-polish`), cluster "Мастер первого запуска" of the roadmap (R42). Backlog 22, 24, 49, 80 are fixed here; backlog 46, 47, 48 and 50 were reproduced on `origin/main` and closed by triage (§ Triage), 50 keeps one regression pin.

**Data compatibility: not required** (no storage change; no-users policy, `agent-config/CLAUDE.md`).

Related: `docs/onboarding-wizard.md` (decisions 3, 6, 7; AS-OB-05, 07, 20, 24), `docs/first-run-empty-desk.md` (decision 5, focus on close), `docs/onboarding-starter-rows.md` (rows), `docs/starter-rows-polish.md` (muted busy rows), `src/newtab.js` (`CITY_MODAL_BACKDROP_GUARD_MS`, `hideOnboardingWizard`, `hideCityModal`, `applyPendingFocus`, `syncOnboardingWizardUi`, `finishOnboardingWizard`).

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-15 | Backlog 22: a second click right after the wizard closes lands on the link under the button. | `confirmed` (reproduced on `3204a6a`) | § Triage, decision 1 |
| 2026-10-15 | Backlog 24, owner decision: after Finish the focus goes to Settings **without scrolling the page** (`preventScroll`). | `confirmed` (owner, roadmap R42) | decision 2 |
| 2026-10-15 | Backlog 80: after a completion-flag write failure the rows stay active and a new check is silently lost. Owner chose: lock the rows. | `confirmed` (owner, 2026-10-15) | decision 3 |
| 2026-10-15 | Backlog 49: the progress pills have no accessible name. Owner chose "Step 1 of 2" / "Step 2 of 2", nothing visible. | `confirmed` (owner, 2026-10-15) | decision 4 |

## Triage (live Chromium, `3204a6a`, throw-away profiles; probe `scratch/run-42-triage/triage.mjs` in quiet-tab-notes)

- **22 reproduces.** 1280×800, 140 links, wizard step 2 with all rows unchecked: Finish pressed, a second pointer click 120 ms later at the same point: `elementFromPoint` is `button.favorite-tile` (`f120`) and the tab navigates to the link (`chrome-error://` in the offline harness). Same for the change-mode city modal: Cancel, 120 ms, second click: a tile is under the point. The old note "second click falls into empty space" was the scroll of backlog 24 (the first click scrolled the page by 104 px; with 140 links `elementFromPoint` after the scroll is `main.desktop`). Once 24 is fixed there is no scroll to hide the race, so 22 is needed in every layout.
- **24 reproduces.** Same seed, one click on Finish: `scrollY` 104 at 1280×800, `activeElement` = Settings.
- **80 reproduces.** `failStorageInit` on the local `quietTabOnboardingWizardComplete` write: Finish shows "Couldn't save setup. Try again."; all 8 checkboxes are enabled; checking GitHub and pressing Finish closes the wizard, the desk has only the 3 original links, the new one is gone, no message.
- **49 reproduces.** `.onboarding-wizard__progress` has `aria-hidden="true"` and no text: nothing tells a screen reader which step it is on.
- **50 does not reproduce.** Back from step 2: `document.activeElement` is `h2#onboarding-step1-title` (`tabindex="-1"`), the dialog is `aria-labelledby="onboarding-step1-title"` (`goToOnboardingStep1({ focusTitle: true })`). It is the behaviour decision 7 of `docs/onboarding-wizard.md` prescribes, but no scenario pins it: closed, with one pin (AS-OWP-10).
- **48 closed (already covered).** The visible `:focus-visible` of a starter row exists (`surfaces.css`: inset 2 px `--focus-ring`, `Highlight` outline under forced colours) and is pinned by `dg-73` AS-OSR-06/08 and `dg-75` AS-SRP-05.
- **47 closed (already covered).** The unchecked label colour is `--muted` with a contrast check ≥ 4.5 against the panel in both schemes (`dg-73` AS-OSR label contrast, `dg-75` hover contrast).
- **46 closed (already covered).** The step-2 error slot is `p.status--error[role="alert"]` between the list and the footer (`buildOnboardingStep2`); the copy is mapped by `onboardingFinishErrorForAddFailure` (limit 200 → "Too many links on your grid. Uncheck some starters.", everything else including sync quota and offline → "Couldn't add links. Try again."); `addFavorites` dedupes before the limit check (AS-OB-19, 27, 28). A separate copy for quota vs offline is not requested and would be a new text decision.

## Decisions

1. **A click guard after the wizard or the city modal closes (backlog 22).** New constant `POST_CLOSE_CLICK_GUARD_MS = 300` (the value of `CITY_MODAL_BACKDROP_GUARD_MS`, named separately because it measures the other end). `hideOnboardingWizard` (Finish, Escape and backdrop on step 2, the close after a second flag-write failure; it is called only from `finishOnboardingWizard`) and `hideCityModal` (Escape, backdrop, Cancel, Save, also the stacked case) record `postCloseGuardUntil = performance.now() + POST_CLOSE_CLICK_GUARD_MS` at the moment the node is removed, not when the button was pressed (a slow write closes the wizard seconds after the press). One `click` listener on `document`, capture phase, installed at load: while `performance.now() < postCloseGuardUntil` and `event.detail > 0` (a pointer click, including the second click of a double click whose `detail` is 2; keyboard activation has `detail` 0 and is not guarded), it calls `preventDefault()` and `stopPropagation()`. Opening the city modal or the wizard clears the guard (`clearPostCloseClickGuard()` in `showCityModal` and `showOnboardingWizard`), so the buttons of a modal that opens again are never swallowed by the previous close. It is document-wide: it covers the desk, in the stacked case the weather dialog under the closed city modal, and the Reload button of the failure chip (accepted, § Accepted exceptions). It does not touch `pointerdown`, drag, wheel or keyboard. The two wizard step transitions (`goToOnboardingStep2`: Skip, and Continue after a city; `goToOnboardingStep1`: Back) arm the same guard: the second click of a double click on Skip lands on the starter row under it, and on Back lands on the backdrop (step 1 is shorter than step 2), which acts like Skip (found by the final-gate skeptic, run 42; both reproduced on `3204a6a`). `ONBOARDING_STEP2_GUARD_MS` stays as it is.
2. **Focus after the wizard without scrolling (backlog 24, owner).** The flag travels with the pending focus, because on Finish `hideOnboardingWizard` runs while `favoritesBusy` is still true (`startFavoritesAction` is above, `finishFavoritesAction` below, both inside `finishOnboardingWizard`): its `applyPendingFocus()` returns at once and the focus is really set by the following `renderFavorites()` → `applyPendingFocus()` (no arguments). So `hideOnboardingWizard` sets `pendingFocus = [SETTINGS_TILE_SELECTOR]` and then `pendingFocus.preventScroll = true` (a property on the array); `applyPendingFocus()` keeps its signature, reads `selectors.preventScroll === true` and calls `target.focus({ preventScroll })`. Any later assignment of `pendingFocus` creates a new array without the property, so the flag cannot leak into another caller's focus. Same path for Escape, backdrop and the second-flag-failure close. **Implementation finding (run 42, Ruling):** after the focus, a second render replaced the Settings node and `restoreFocus()` put the focus back with a plain `focus()`, which scrolled; `restoreFocus` now focuses with `{ preventScroll: true }` (the node was already focused before the re-render, so no caller needs a scroll; it has one caller, `renderDesktop`). Owner decision 2026-10-15 also supersedes `docs/post-onboarding-grid.md` AS-POG-07 (the scroll that brought Settings' ring into a 400 px window) and its `dg-65` group 7. Settings below the first screen keeps focus and the page does not move; its ring is simply off screen until the person scrolls (accepted by the owner). `hideCityModal` and every other assignment of `pendingFocus` are unchanged.
3. **Rows are locked once the links are written (backlog 80, owner).** In `syncOnboardingWizardUi` a starter checkbox is disabled when `finishBusy || onboardingStartersCommitted`. After a flag-write failure with k ≥ 1 the rows keep their checked state, are dimmed like the busy rows (`--control-disabled-opacity`), cannot be toggled or focused; Back and Finish stay enabled; the next Finish writes only the flag (a second flag failure closes the wizard as today). `onboardingStartersCommitted` is `false` for a failed batch (rows stay active, retry adds) and for k = 0 (nothing to protect); it is reset in `showOnboardingWizard`. Cursor: a locked row must not look busy, so the list gets `data-starters-locked="true"` while the rows are locked and `surfaces.css` gives `.onboarding-wizard__starters[data-starters-locked="true"] input[type="checkbox"]:disabled` `cursor: default` (the busy rule `cursor: wait`, pinned by `dg-75` AS-SRP-04b, stays). Back after the failure: the error text is not cleared by `goToOnboardingStep2`/`goToOnboardingStep1` while `onboardingStartersCommitted` (locked rows keep their explanation), and `goToOnboardingStep2` focuses the first enabled checkbox, or Finish when all are disabled (a disabled box cannot take `focus()`; otherwise focus would fall to `body`).
4. **The progress has a name (backlog 49, owner).** `.onboarding-wizard__progress` loses `aria-hidden` and gets `role="img"` with `aria-label` "Step 1 of 2" / "Step 2 of 2", set in `syncOnboardingWizardUi` from `onboardingStep` (so Back restores "Step 1 of 2"). The pills stay empty spans (children of `role="img"` are presentational). Nothing visible changes, still no numeric text.
5. **Back focus is pinned, not changed (backlog 50).** No code change.

## Scope

- `src/newtab.js` (decisions 1–4), `src/surfaces.css` (the locked cursor rule), `CHANGELOG.md` `[Unreleased]`, `agent-config/CLAUDE.md` (one sentence on the post-close guard), `docs/onboarding-wizard.md` (note under decision 7: Finish focus does not scroll).
- E2E touched besides `dg-82`: `dg-65` group 7 (superseded expectation), `13-city-modal` and `dg-58` (post-close waits).
- Tests: `test/newtabSource.test.js` (pins: the constant and the capture listener on `document` with `detail > 0`; both close functions set the guard; `hideOnboardingWizard` sets `pendingFocus.preventScroll = true` and `applyPendingFocus` passes it to `focus`; `goToOnboardingStep2` keeps the error while committed and focuses an enabled box or Finish; the `data-starters-locked` rule; the checkbox `disabled` expression contains `onboardingStartersCommitted`; the progress has `role="img"`, no `aria-hidden`, label text), mutation-proven after the implementation commit. A new E2E `dg-82-onboarding-wizard-polish.mjs`; the page-side close time comes from a `MutationObserver` that stamps `performance.now()` when `#onboarding-wizard` / `#city-modal` leaves the DOM, and every "N ms after the close" in this spec is measured from that stamp, not from the harness. The class "pointer click within 300 ms after the wizard or the city modal closes" is wider than `dg-60`/`dg-65`: `lib/onboardingWizard.mjs` (`finishWizard`, `finishStep2ZeroLinks`, `finishFromStep1`: `sleep(300)` after a poll that notices the detach, the margin is zero), `dg-58-modal-overlay.mjs` (Escape closes the stacked city modal, then `openCityFromWeather` clicks the city field ~50 ms later and waits 3 s for `#city-modal`), `13-city-modal.mjs`, `15-*`, `dg-29`, `dg-56` and their `waitForTimeout(300)` after `detached`. Task 1 greps all scenarios for pointer actions after a close and runs these first; pauses grow to 400 ms or more, no check is weakened or removed. Pins that stay valid: `test/newtabSource.test.js` `function applyPendingFocus\(\)` (l.354: the signature does not change) and the pins at l.704, l.1065; the new pins read the property assignment in `hideOnboardingWizard` and the `{ preventScroll }` argument of `focus`.

## Acceptance scenarios

Common setup: the E2E harness with `autoPrompt: true`; `dg-60`'s first-run seed plus filler links (14 per row, `favV3`), the wizard reached with Skip and waited 450 ms (past `ONBOARDING_STEP2_GUARD_MS`), all rows unchecked unless stated. "The point" is the centre of the Finish (or Cancel) button. A `MutationObserver` in the page stamps `performance.now()` when the wizard or the city modal leaves the DOM (`closedAt`); a document-level bubble `click` listener records `{ detail, tile, at }` for every click that reaches the document (a suppressed click never does). "N ms after the close" is `at - closedAt`, and each guard scenario asserts the suppressed click's `at - closedAt` is below 300 (premise: a click that arrives later proves nothing). Before a guard scenario, a desk tile's rect contains the point (the desk is veiled, rects are real).

### AS-OWP-01 Second click after Finish does not reach the tile
- Given: 1280×800, 1280×600, 500×800 and 320×600, 140 links, a desk tile under the Finish button.
- When: Finish is clicked with the mouse; the wizard closes; a second pointer click at the same point ~120 ms after the close stamp (and, for a double click, `detail` 2).
- Then: the wizard is closed; no `click` reaches any tile or `.desktop` (the recorder holds only the Finish click) and the page URL is unchanged; the same click ≥ 400 ms after the close stamp reaches the tile.
- Red on old code (premise): the tile gets the click (count 1, the tab navigates).
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-02 The guard covers every exit of the wizard
- Given: wizard step 2 (as AS-OWP-01).
- When: (a) Escape; (b) a backdrop click (outside the dialog, over a tile; waited 450 ms after entering step 2, since `ONBOARDING_STEP2_GUARD_MS` also gates the backdrop); (c) the flag write fails twice (`failStorageInit`, Finish pressed twice) so the wizard closes best-effort. Then a pointer click on the former point ~120 ms after the close stamp.
- Then: the click is suppressed in all three; (a), (b) completed with the flag written, (c) closed without the flag.
- Verified by: E2E `dg-82`.

### AS-OWP-03 Change-mode city modal: Cancel, and the stacked case
- Given: the completion flag set, no city (hint tile), 100 links, the modal opened from the hint tile; separately the modal stacked over the weather edit dialog (a city is set, edit mode on). Premise: `elementFromPoint` at the Cancel point is a tile (plain case) or a tile or an element of the weather dialog (stacked case), read just before the second click.
- When: Cancel, then ~120 ms after the close stamp a second pointer click at the same point.
- Then: the second click reaches neither a tile nor a control of the weather dialog (only the Cancel click is recorded; the dialog is still open); focus lands as before (opener or Settings). A click ≥ 400 ms after the close works. Escape, backdrop and Save share `hideCityModal` and are pinned in `newtabSource`, not repeated in E2E.
- Red on old code (premise): a tile receives the second click.
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-04 The guard ends; the keyboard is not guarded
- Given: right after Finish, focus is on Settings.
- When: Enter is pressed on Settings 50 ms after the close; separately a pointer click on another tile 100 ms after the close and a pointer click on Settings 450 ms after the close.
- Then: Enter toggles edit mode (`aria-pressed` true); the tile click 100 ms after is not recorded (recorder length 0 for it); the Settings click at 450 ms is recorded and toggles edit mode.
- Verified by: E2E `dg-82`.

### AS-OWP-05 Finish does not scroll the page
- Given: 140 links; premise: Settings' `bottom` is larger than `innerHeight` before Finish and the page can scroll; 1280×800, 1280×600, 500×800 and 320×600.
- When: Finish; separately Escape on step 2 (completes like Finish).
- Then: `scrollY` is 0 right after the close and 500 ms later; `document.activeElement` is the Settings tile (`aria-pressed`); scrolling the page by hand afterwards works and the focus stays.
- Red on old code (premise): `scrollY` 104 (1280×800).
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-06 Settings in the first screen keeps focus (unchanged)
- Given: 20 links; premise: Settings' `bottom` is at most `innerHeight`.
- When: Finish.
- Then: focus on Settings, `scrollY` 0; the existing `dg-60`/`dg-65` focus checks stay green.
- Verified by: E2E `dg-82`.

### AS-OWP-07 Flag failure after links were written: rows are locked
- Given: step 2, 3 default rows checked; `failStorageInit` for the local write of `quietTabOnboardingWizardComplete`.
- When: Finish (fails); the person clicks a row; Shift+Tab is pressed several times; the failure is removed and Finish is pressed again.
- Then: after the failure "Couldn't save setup. Try again." is shown; all 8 checkboxes are `disabled` with their checked state kept (3 checked); the rows are dimmed (`--control-disabled-opacity`) and show `cursor: default`; focus is on Finish. Clicking a row changes nothing; Shift+Tab visits only Back and Finish (`tabTrapFocusables` skips disabled controls). The second Finish closes the wizard, the desk has the 3 links exactly once, `quietTabOnboardingWizardComplete` is true.
- Red on old code (premise): the boxes are enabled and a new check is lost.
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-08 Rows stay active when nothing was committed
- Given: step 2; (a) the batch write fails (`failStorageInit` on `quietTabWidgetsMeta`, as AS-OB-19); (b) k = 0 with a flag failure.
- When: (a) the error shows; (b) Finish with all rows unchecked fails on the flag, then GitHub is checked and Finish pressed again.
- Then: (a) the 8 boxes are enabled; (b) the boxes are enabled and the second Finish adds GitHub (the desk has exactly one link).
- Verified by: E2E `dg-82`.

### AS-OWP-09 The progress has a name
- Given: the wizard on step 1.
- When: step 1 → 2 (Skip), Back.
- Then: `.onboarding-wizard__progress` has `role="img"`, no `aria-hidden`, `aria-label` "Step 1 of 2", then "Step 2 of 2", then "Step 1 of 2"; `locator.ariaSnapshot()` of the dialog lists `img "Step N of 2"` and no pill nodes; the element has no text content; the pills keep the geometry and colours of `docs/onboarding-wizard.md` AS-OB-10 (5 px high, active pills `--border-control`, inactive `--soft-fill`; forced-colours borders are pinned by `dg-75`). No live announcement is added on a step change (§ Accepted exceptions).
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-10 Back focus (pin of existing behaviour)
- Given: step 2.
- When: Back is clicked, and separately activated with Enter.
- Then: `document.activeElement` is `#onboarding-step1-title`, the dialog's `aria-labelledby` is `onboarding-step1-title`, the city field is not focused.
- Verified by: E2E `dg-82`.

### AS-OWP-14 A double click on Skip and on Back
- Given: the wizard on step 1 (1280×800 and 500×800); the starter rows are in the DOM (hidden on step 1) and the first three are checked.
- When: Skip is clicked and ~100 ms later clicked again at the same point; then (after 300 ms) Back is clicked and ~100 ms later clicked again at the same point.
- Then: the second click on Skip does not toggle the row under it (premise: the element under the point on step 2 is a checkbox); the wizard is on step 2 with the same checked states; the second click on Back does not act as Skip/backdrop (premise: after the switch the point lies outside the step-1 dialog); the wizard is on step 1.
- Red on old code (premise): the third row is unchecked; the wizard ends on step 2 after the Back double click.
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-11 Texts
- Strings: the progress label "Step 1 of 2" / "Step 2 of 2" (assistive technology only); existing strings unchanged ("Couldn't save setup. Try again." stays the text shown with locked rows).

### AS-OWP-12 A slow successful Finish: the guard is measured from the close
- Given: step 2, 3 rows checked, the sync write of `quietTabWidgetsMeta` delayed by 2500 ms (`delayStorageInit`, the write succeeds), a desk tile under Finish.
- When: pointer clicks at the Finish point every ~200 ms while the write runs; one more ~120 ms after the close stamp.
- Then: while busy Finish is disabled and the clicks do nothing (no second `finishOnboardingWizard`: the desk gets the 3 links once); the click after the close is suppressed and reaches no tile.
- Verified by: E2E `dg-82`.

### AS-OWP-13 Back after the flag failure keeps the rows locked and explained
- Given: AS-OWP-07 after the failure.
- When: Back, then Skip on step 1.
- Then: step 2 is shown with the 8 rows still disabled (3 checked), the error text "Couldn't save setup. Try again." is still there, and focus is on Finish (not on `body`); Finish then completes as in AS-OWP-07.
- Verified by: E2E `dg-82`.

## Review focus

1. Scenarios: every close path arms the guard (the `hideOnboardingWizard` and `hideCityModal` exits of decision 1), no path where a legitimate click after 300 ms is blocked, the slow-write case (AS-OWP-12), the interplay with `ONBOARDING_STEP2_GUARD_MS` and `recentlyChosen()`; the k ≥ 1 / k = 0 / failed-batch matrix of decision 3 including Back after the failure (AS-OWP-13); the focus really lands without scroll on every path that closes the wizard (decision 2 travels with the deferred `applyPendingFocus`).
2. Visual: locked rows read as dimmed, not broken or busy (cursor); the error text next to disabled rows is still understandable; no layout shift.
3. Accessibility: `role="img"` inside a modal dialog and what is announced on a step change (§ Accepted exceptions); disabled rows leave the tab order without trapping focus; focus on Settings off screen (decision 2).

## Accepted exceptions

- A deliberate pointer click within 300 ms after a close is lost (owner-level trade: same value as the opening guard).
- With Settings below the first screen the focus ring is not in view after Finish (owner decision 2026-10-15).
- Locked rows give no explanation beyond the existing error text (owner chose "lock the rows").
- The Reload button of the failure chip and any deliberate pointer click inside the guard (including a click on the weather dialog's city field within 300 ms after Escape closed the stacked city modal) are lost; `dg-58` waits accordingly.
- The swallowed second click of a double click still moves the focus (its `pointerdown`/`mousedown` is not guarded): after a double click on Finish, Back or Skip the focus is on the tile or row under the point (or `body`), not on Settings / the step title / the first row (final-gate Minor L2-01, backlog 99).
- While the rows are locked (decision 3) the starter list scrolls with the wheel but not from the keyboard: it has no tab stop and the disabled boxes cannot take focus (final-gate Minor L3-01, backlog 98); Back and Finish stay reachable and assistive technology lists every row.
- No live announcement on a step change: Step 1 → 2 moves focus to the first enabled row and the dialog's name switches (`aria-labelledby`); Back focuses the step title; the progress label is read when the person navigates to it.
- Save of the change-mode city modal, and Escape/backdrop of it, are not repeated in E2E: they share `hideCityModal` (source pin).
- `docs/post-onboarding-grid.md` AS-POG-07 (the page scrolls so that Settings' ring lies inside a 400 px window) is superseded by the owner decision of decision 2; `dg-65` group 7 now expects `scrollY` 0 and the island's bottom edge below the window.
- Scenarios that clicked within 300 ms after a modal closed got explicit waits (`13-city-modal`, `dg-58`); no check was weakened.
- Backlog 46, 47, 48 closed by triage; no new scenario for them.

## Non-goals

- The wizard's copy, steps, rows, defaults, island layout, flag semantics; a separate error text for sync quota vs offline.
- The guard for `pointerdown`/drag, keyboard repeat, and for any other dialog than the wizard and the city modal.
- Changing `applyPendingFocus` for other callers; scroll position restore.
- Roadmap R43+ items.

## Process

Pipeline per `.private/pipeline/` (stages 0–6). Data compatibility: not required.
