# Onboarding wizard polish: click guard after close, focus without scroll, locked rows after a flag failure, progress name

## Status

`draft` — run №42 (`onboarding-wizard-polish`), cluster "Мастер первого запуска" of the roadmap (R42). Backlog 22, 24, 49, 80 are fixed here; backlog 46, 47, 48 and 50 were reproduced on `origin/main` and closed by triage (§ Triage), 50 keeps one regression pin.

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
- **50 does not reproduce.** Back from step 2: `document.activeElement` is `h2#onboarding-step1-title` (`tabindex="-1"`), the dialog is `aria-labelledby="onboarding-step1-title"` (`goToOnboardingStep1({ focusTitle: true })`). It is the behaviour decision 7 of `docs/onboarding-wizard.md` prescribes, but no scenario pins it: closed, with one pin (AS-OWP-12).
- **48 closed (already covered).** The visible `:focus-visible` of a starter row exists (`surfaces.css`: inset 2 px `--focus-ring`, `Highlight` outline under forced colours) and is pinned by `dg-73` AS-OSR-06/08 and `dg-75` AS-SRP-05.
- **47 closed (already covered).** The unchecked label colour is `--muted` with a contrast check ≥ 4.5 against the panel in both schemes (`dg-73` AS-OSR label contrast, `dg-75` hover contrast).
- **46 closed (already covered).** The step-2 error slot is `p.status--error[role="alert"]` between the list and the footer (`buildOnboardingStep2`); the copy is mapped by `onboardingFinishErrorForAddFailure` (limit 200 → "Too many links on your grid. Uncheck some starters.", everything else including sync quota and offline → "Couldn't add links. Try again."); `addFavorites` dedupes before the limit check (AS-OB-19, 27, 28). A separate copy for quota vs offline is not requested and would be a new text decision.

## Decisions

1. **A click guard after the wizard or the city modal closes (backlog 22).** New constant `POST_CLOSE_CLICK_GUARD_MS = 300` (the value of `CITY_MODAL_BACKDROP_GUARD_MS`, named separately because it measures the other end). `hideOnboardingWizard` and `hideCityModal` (every exit: Finish, Escape, backdrop, Cancel, Save, the stacked case) record `postCloseGuardUntil = performance.now() + POST_CLOSE_CLICK_GUARD_MS`. One `click` listener on `document`, capture phase, installed at load: while `performance.now() < postCloseGuardUntil` and `event.detail > 0` (a pointer click; keyboard activation has `detail` 0 and is not guarded), it calls `preventDefault()` and `stopPropagation()`. It covers the desk and, in the stacked case, the weather dialog under the closed city modal. It does not touch `pointerdown`, drag, wheel or keyboard. Not guarded: the transition step 1 → step 2 (it has `ONBOARDING_STEP2_GUARD_MS`).
2. **Focus after the wizard without scrolling (backlog 24, owner).** `applyPendingFocus` takes `{ preventScroll }`; `hideOnboardingWizard` calls `applyPendingFocus({ preventScroll: true })`, so `target.focus({ preventScroll: true })`. Settings below the first screen keeps focus and the page does not move; its ring is simply off screen until the person scrolls (accepted by the owner). `hideCityModal` and every other `applyPendingFocus` caller are unchanged.
3. **Rows are locked once the links are written (backlog 80, owner).** In `syncOnboardingWizardUi` a starter checkbox is disabled when `finishBusy || onboardingStartersCommitted`. After a flag-write failure with k ≥ 1 the rows keep their checked state, are dimmed like the busy rows (`--control-disabled-opacity`), cannot be toggled or focused; Back and Finish stay enabled; the next Finish writes only the flag. `onboardingStartersCommitted` is `false` for a failed batch (rows stay active, retry adds), for k = 0 (nothing to protect) and again `false` on the next wizard open.
4. **The progress has a name (backlog 49, owner).** `.onboarding-wizard__progress` loses `aria-hidden` and gets `role="img"` with `aria-label` "Step 1 of 2" / "Step 2 of 2", set in `syncOnboardingWizardUi` from `onboardingStep` (so Back restores "Step 1 of 2"). The pills stay empty spans (children of `role="img"` are presentational). Nothing visible changes, still no numeric text.
5. **Back focus is pinned, not changed (backlog 50).** No code change.

## Scope

- `src/newtab.js` (decisions 1–4), `CHANGELOG.md` `[Unreleased]`, `agent-config/CLAUDE.md` (one sentence on the post-close guard), `docs/onboarding-wizard.md` (note under decision 7: Finish focus does not scroll).
- Tests: `test/newtabSource.test.js` (pins: the constant and the capture listener on `document` with `detail > 0`; both close functions set the guard; `applyPendingFocus` passes `preventScroll` only from `hideOnboardingWizard`; the checkbox `disabled` expression contains `onboardingStartersCommitted`; the progress has `role="img"`, no `aria-hidden`, label text), mutation-proven after the implementation commit. A new E2E `dg-82-onboarding-wizard-polish.mjs`. Existing helpers that click within 300 ms after a close (`finishWizard`, `finishStep2ZeroLinks`, `dg-60`, `dg-65`) are checked by the full run; a sleep may grow, a check may not be weakened.

## Acceptance scenarios

Common setup: the E2E harness with `autoPrompt: true`; `dg-60`'s first-run seed plus filler links (14 per row, `favV3`), the wizard reached with Skip, all rows unchecked unless stated. "The point" is the centre of the Finish (or Cancel) button. A document-level bubble listener counts `click` events that reach a `[data-widget-id]` tile and records `event.detail`.

### AS-OWP-01 Second click after Finish does not reach the tile
- Given: 1280×800, 140 links, a tile under the Finish button (`elementFromPoint` before Finish is the button; after close it is a tile); also 500×800 and 320×600.
- When: Finish is clicked with the mouse; 120 ms later a second pointer click at the same point.
- Then: the wizard is closed; zero `click` events reach any tile or `.desktop` and the page URL is unchanged; the same click 400 ms after the close reaches the tile (count 1).
- Red on old code (premise): the tile gets the 120 ms click (count 1, the tab navigates).
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-02 The guard covers every exit
- Given: wizard step 2 (as AS-OWP-01).
- When: (a) Escape, (b) a backdrop click after the 300 ms guard of opening, then a pointer click on the former point 120 ms later.
- Then: the click is suppressed in both; the wizard completes as before (flag written).
- Verified by: E2E `dg-82`.

### AS-OWP-03 Change-mode city modal: Cancel, Save-less exits and the stacked case
- Given: the completion flag set, no city (hint tile), 100 links, the modal opened from the hint tile; separately the modal stacked over the weather edit dialog (a city is set).
- When: Cancel, then 120 ms later a second pointer click at the same point.
- Then: the second click reaches neither a tile nor a control of the weather dialog (zero `click` events on any element); focus lands as before (opener or Settings). A click 400 ms after the close works.
- Red on old code (premise): a tile receives the second click.
- Verified by: E2E `dg-82`.

### AS-OWP-04 The guard ends, keyboard is not guarded
- Given: right after Finish, focus is on Settings.
- When: Enter is pressed on Settings 50 ms after the close; separately a pointer click on Settings 400 ms after the close.
- Then: both toggle edit mode (`aria-pressed` true); a pointer click 100 ms after the close on a different tile is suppressed.
- Verified by: E2E `dg-82`.

### AS-OWP-05 Finish does not scroll the page
- Given: 140 links, Settings below the first screen (row ≥ 9); 1280×800 and 500×800; also the Escape-on-step-2 exit.
- When: Finish.
- Then: `scrollY` is 0 after the close and after 500 ms; `document.activeElement` is the Settings tile (`aria-pressed`); scrolling the page by hand afterwards works and the focus stays.
- Red on old code (premise): `scrollY` 104 (1280×800).
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-06 Settings in the first screen keeps focus (unchanged)
- Given: 40 links, Settings in the first screen.
- When: Finish.
- Then: focus on Settings, `scrollY` 0, no regression of `dg-65`'s focus checks.
- Verified by: E2E `dg-82` and the existing `dg-60`/`dg-65` focus checks.

### AS-OWP-07 Flag failure after links were written: rows are locked
- Given: step 2, 3 default rows checked; `failStorageInit` for the local write of `quietTabOnboardingWizardComplete`.
- When: Finish (fails), then the person tries to check GitHub (click on the row and Space on a focused row, the latter after Shift+Tab/Tab into the list), then removes the failure and presses Finish again.
- Then: after the failure the error "Couldn't save setup. Try again." is shown, all 8 checkboxes are `disabled` with their checked state kept (3 checked), the rows have the disabled opacity, focus is on Finish; clicking a row changes nothing; Tab goes Back → Finish only; the second Finish closes the wizard, the desk has the 3 links exactly once, `quietTabOnboardingWizardComplete` is true.
- Red on old code (premise): the boxes are enabled and a new check is lost.
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-08 Rows stay active when nothing was committed
- Given: step 2; (a) the batch write fails (`failStorageInit` on `quietTabWidgetsMeta`, as AS-OB-19); (b) k = 0 with a flag failure.
- When: (a) the error shows; (b) Finish with all rows unchecked fails on the flag, then GitHub is checked and Finish pressed.
- Then: (a) the 8 boxes are enabled; (b) the boxes are enabled and the second Finish adds GitHub.
- Verified by: E2E `dg-82`.

### AS-OWP-09 The progress has a name
- Given: the wizard on step 1.
- When: step 1 → 2 (Skip), Back.
- Then: `.onboarding-wizard__progress` has `role="img"`, no `aria-hidden`, `aria-label` "Step 1 of 2", then "Step 2 of 2", then "Step 1 of 2"; the accessibility tree lists one `img "Step N of 2"` in the dialog and no pill nodes; the element has no text content; pill geometry and colours equal `dg-60` AS-OB-10 (computed 5 px height, colours).
- Verified by: E2E `dg-82`; `newtabSource` pin.

### AS-OWP-10 Back focus (pin of existing behaviour)
- Given: step 2.
- When: Back is clicked, and separately activated with Enter.
- Then: `document.activeElement` is `#onboarding-step1-title`, the dialog's `aria-labelledby` is `onboarding-step1-title`, the city field is not focused.
- Verified by: E2E `dg-82`.

### AS-OWP-11 Texts
- Strings: the progress label "Step 1 of 2" / "Step 2 of 2" (assistive technology only); existing strings unchanged ("Couldn't save setup. Try again." stays the text shown with locked rows).

## Review focus

1. Scenarios: every close path sets the guard (Finish, Escape, backdrop on step 2, Cancel, Save, stacked), no path where the guard is armed but never released, nothing blocks a legitimate click after 300 ms; the interplay with `ONBOARDING_STEP2_GUARD_MS` and `recentlyChosen()`; the k ≥ 1 / k = 0 / failed-batch matrix of decision 3.
2. Visual: locked rows read as dimmed, not broken; the error text next to disabled rows is still understandable; no layout shift from the label.
3. Accessibility: `role="img"` inside a modal dialog and the order of announcements on step change (title focus vs progress); disabled rows leave the tab order without trapping focus; focus on Settings off screen (decision 2) is announced.

## Accepted exceptions

- A deliberate pointer click within 300 ms after a close is lost (owner-level trade: same value as the opening guard).
- With Settings below the first screen the focus ring is not in view after Finish (owner decision 2026-10-15).
- Locked rows give no explanation beyond the existing error text (owner chose "lock the rows").
- Backlog 46, 47, 48 closed by triage; no new scenario for them.

## Non-goals

- The wizard's copy, steps, rows, defaults, island layout, flag semantics; a separate error text for sync quota vs offline.
- The guard for `pointerdown`/drag, keyboard repeat, and for any other dialog than the wizard and the city modal.
- Changing `applyPendingFocus` for other callers; scroll position restore.
- Roadmap R43+ items.

## Process

Pipeline per `.private/pipeline/` (stages 0–6). Data compatibility: not required.
