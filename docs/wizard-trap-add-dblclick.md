# Wizard tab trap and the double click on the Add menu: the locked starter list is a stop of the trap, a double click on a menu item stays one action

## Status

`draft` - revision 1 (2026-11-15, stage 0 of run 57). Run №57 (`wizard-trap-add-dblclick`), row R57 of the roadmap. Backlog 180 and 181 are fixed here (backlog 177, the E2E harness, is part of the same run but has no product behaviour and is not described in this spec).

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). Nothing stored changes: no key, no field, no schema, no write.

Related: `docs/onboarding-wizard-polish.md` (decision 1, the post-close click guard; decision 3, the locked rows; Accepted exceptions), `docs/city-modal-focus-copy.md` (decision 8, the locked list as a keyboard stop, AS-CMF-18; decision 9, the `mousedown` that the guard cancels), `docs/layers-weather-polish.md` (the locked list term), `docs/unreadable-grid-reset.md` (decision 5, the same guard on the Reset grid dialog), `docs/tab-return-refresh.md` (edit mode as a layer); code: `src/newtab.js` (`tabTrapFocusables`, `setStartersLocked`, `armPostCloseClickGuard`, `onAddMenuClick`, the `pointerdown` listener that closes the Add menu, `backgroundPressed`).

Visual reference: none. Nothing visible is drawn or restyled; the figures are the measurements below.

## Terms

- **`RUN57_BASE`**: `4710ed3b405e3df93d8b78f7f6f8b18ad76178f2`, the head of `main` when the measurements below were taken.
- **The trap**: the `keydown` listener on `document` that wraps Tab inside the open wizard, city modal or desktop dialog (`tabTrapFocusables` lists its candidates; the first and the last candidate are the wrap points).
- **The locked list**: `ul.onboarding-wizard__starters[data-starters-locked="true"]`, shown on step 2 after Finish wrote the links and the flag write was refused (`setStartersLocked`: `tabindex="0"`, `aria-label="Starter links"`, the checkboxes disabled).
- **The guard**: `POST_CLOSE_CLICK_GUARD_MS` (300 ms) and `postCloseGuardUntil`, armed by `armPostCloseClickGuard()`; a document capture listener swallows a pointer `click` (`detail > 0`) and cancels the default of a `mousedown` while it runs.
- **The Add menu**: `div#add-menu[role=menu]`, first level named `Add` (items `Add link`, `Add weather tile…`), second level named `Add weather tile` (one item per hidden metric, `data-menu-action="restore"`).
- **The window**: the 300 ms after `armPostCloseClickGuard()`.

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-11-15 | Backlog 180 (run 53, step 1): the trap of the first-run wizard skips the locked starter list; from Back and Finish, Tab and Shift+Tab never reach it. | `confirmed` (live, § Live measurement 1) | decision 1 |
| 2026-11-15 | Backlog 181 (run 53, final review): in edit mode a double click on an item of the Add menu restores the tile once, then leaves edit mode. | `confirmed` (live, § Live measurement 2), and the same class of defect found on the second level | decisions 2 and 3 |

Decision of Kier, 2026-11-15 (the chat of the local Claude Code session, no message id): a narrow scope. 180: add the locked list to the trap, nothing else. 181: reuse the existing post-close guard, introduce no new mechanism; if a double click on `Add weather tile…` measurably restores a tile it is the same class and is closed the same way, if not it is left alone. No questions to Kier at stage 0; no Ruling.

## Live measurement

Chromium through the E2E harness, throw-away profiles, build of `RUN57_BASE`, 1280×800 unless stated. The probe scripts are not committed. Every pointer press below is a real one (`page.mouse`), `elementFromPoint` was printed or read from the recorded event target before the second click.

**1. The trap and the locked list (180).** Three windows (1280×800, 500×800, 320×600), the first-run wizard, `quietTabOnboardingWizardComplete` write refused (the harness `failStorageInit`), Skip, Finish.
- Step 2 before the lock, Tab from `body` twelve times: `box0 box1 box2 box3 box4 box5 box6 box7 back finish box0 box1`; Shift+Tab from `body`: `finish back box7 ... box0 finish back`. The list has no `tabindex`.
- After the lock the list has `tabindex="0"` and `aria-label="Starter links"`, focus is on Finish. Tab from Finish six times: `back finish back finish back finish`. Tab from `body`: `back finish back finish ...`. Shift+Tab from `body`: `finish back finish back ...`. Shift+Tab from Back four times: `finish back finish back`. The list never takes focus. The only `[tabindex="0"]` inside the wizard is the list.
- The list is reachable only from above it (the step title made focusable by the scenario, `dg-84` AS-CMF-18): a person who arrives by Tab from Finish or Shift+Tab from Back cannot reach the keyboard scroll stop that decision 8 of `docs/city-modal-focus-copy.md` created.
- Other layers, for the unchanged check: the Add link dialog from `body`: `url label iconMode backgroundColorSource backgroundColor size` then the two footer buttons, a cycle of eight; the wizard step 1 cycle has the city field, the clear button, Skip and Continue (no list).

**2. The double click on the Add menu (181).** Edit mode, one link at the far left of the grid, UV hidden (1 hidden metric) or UV, Air quality and Precipitation hidden (3 hidden); the Add tile at its default cell; the menu opens under it (menu box 200 px wide, 94 px high at the first level, 54 px with one metric, 134 px with three). `page.mouse.dblclick` (the events carry `mousedown` and `click` with `detail` 1 then 2, the `pointerdown` and `pointerup` events carry `detail` 0) and two clicks 120 ms apart at the same point.
- **Edit mode is left by `pointerdown` + `pointerup` on the background, not by a click.** After the first click on a `restore` item the menu is gone; the second press lands on `div.desktop-grid` (background): `pointerdown`, `mousedown`, `pointerup`, `mouseup` on it, and `#favorites[data-edit]` is `false`. The listener is `backgroundPressed` (set on `pointerdown` of `#favorites`, acted on at `pointerup`). The guard swallows only a `click` and the default of a `mousedown`, so arming it alone would not stop this exit.
- **Restore item (second level), background under the second press:** the tile is restored once, edit mode ends. Same with 1 hidden and with 3 hidden (first item and second item), and at 500×800, 320×600 and 1280×600 (every size: `edit` `false`).
- **Restore item, a link tile under the second press (120 ms gap):** the second press lands on the link tile (`elementFromPoint`: `button.favorite-tile`), edit mode stays, and the click opens the `edit-link` dialog of a link the person never touched. A fast `dblclick` (no gap) was spared in this seed: only `pointerdown` and `pointerup` were recorded on the tile, no `mousedown` and no `click` (the cause was not isolated; the render that follows the restore is the likely one).
- **`Add weather tile…` (first level, second item), 3 hidden:** the first click swaps the menu to the second level (the same node), the second press hits the second level's item at the same point and restores it (`Air quality` restored without being chosen); edit mode stays. 1 hidden: the second level is one item high (54 px), the second press lands outside it, the `pointerdown` that closes the Add menu on an outside press closes it, nothing is restored, edit mode stays, the menu is gone (a double click on `Add weather tile…` ends with no menu at all); with a link tile under the second press (`dblclick`, `button.favorite-tile`) its click is delivered and the `edit-link` dialog of that link opens.
- **`Add link` (first level, first item):** the first click closes the menu and opens the `add-link` dialog; the second press lands on `div.desktop-backdrop`; the backdrop ignores it (the 300 ms backdrop guard of the dialog, `DIALOG_BACKDROP_GUARD_MS`); one dialog, edit mode stays. No defect of this class.
- Incidental, old, out of scope (§ Accepted exceptions 3): after a double click on `Add link` `document.activeElement` is `body`; after a single click it is the `url` input. The dialog is the same.
- Design check on a throw-away patched copy (not committed): `armPostCloseClickGuard()` in the `add-weather` and `restore` branches of `onAddMenuClick`, the guard read by the outside-press `pointerdown` listener and by `backgroundPressed` (no new timer, flag or listener), and the locked list added to the candidates. Result: every case above ends with edit mode on, a restored tile exactly when its item was pressed, the second level open after a double click on `Add weather tile…`; the Tab cycles are `list back finish` (Tab from Finish, Tab from `body`) and `finish back list` (Shift+Tab from `body`). A deliberate press on another item 120 ms after `Add weather tile…` is swallowed (Accepted exception 1); at 450 ms it works.

## Decisions

1. **The locked list is a stop of the trap (180).** `tabTrapFocusables` adds `[data-starters-locked="true"]` to its candidate selector (the existing `input, button:not([role="option"])` part and the filter for disabled, hidden and inert candidates stay). The candidates stay in document order, so the list comes before Back and Finish: with the lock the cycle is `list back finish` in both directions, the wrap points are the list (first) and Finish (last). Nothing else changes: with no lock the list has no `data-starters-locked` and no `tabindex`, and the unlocked cycle, step 1, the change-mode city modal and the desktop dialogs have exactly the candidates they had. The selector names the attribute, not `[tabindex="0"]`, so no other element can become a stop by accident.
2. **A pick in the Add menu that changes the menu or the grid arms the guard (181).** `onAddMenuClick` calls `armPostCloseClickGuard()` in the `add-weather` branch (the menu swaps to the second level) and in the `restore` branch (the menu closes and the tile is restored), at the moment of the pick. The `add-link` branch does not arm it (§ Live measurement 2: no defect; arming would swallow a quick deliberate click inside the new dialog, which has its own backdrop guard). Keyboard activation has `detail` 0 and is not guarded. The existing precedents are the wizard step transitions (`goToOnboardingStep2`, `goToOnboardingStep1`, `docs/onboarding-wizard-polish.md` decision 1).
3. **The guard window also holds the two press paths that are not clicks.** Edit mode is left by `pointerdown` + `pointerup`, and an outside press closes the Add menu on `pointerdown`; neither is a click, so the existing listeners do not stop them. Both read the same `postCloseGuardUntil` through one read-only helper `postCloseGuardActive()` (`performance.now() < postCloseGuardUntil`) next to `armPostCloseClickGuard()`: `backgroundPressed` is not set while the window runs, and the outside-press listener returns at once while it runs (so the second level that a double click on `Add weather tile…` just opened is not closed by the second press falling outside it). No new constant, timer, flag, listener or event type; the window and its length are the existing ones.
4. **Escape and every keyboard path are unchanged.** Escape closes the Add menu or leaves edit mode in the existing order inside the window too (no listener of the guard looks at `keydown`).

## Scope

- `src/newtab.js`: the candidate selector of `tabTrapFocusables`; `postCloseGuardActive()`; two `armPostCloseClickGuard()` calls in `onAddMenuClick`; one condition in the outside-press `pointerdown` listener; one condition in `backgroundPressed`.
- `test/newtabSource.test.js`: the pins that name the old text are replaced (not weakened): the `backgroundPressed` line (`it("guards the background click ...")`) and the candidate selector of `AS-CSL-04` (it still requires the option exclusion); new pins for decisions 1 to 3.
- `CHANGELOG.md` (`[Unreleased]`), `agent-config/CLAUDE.md` (the facts about `tabTrapFocusables` and the Add menu guard), `docs/onboarding-wizard-polish.md` (a superseded note on the Accepted exception about the locked list having no tab stop, and on AS-OWP-07, which says Shift+Tab visits only Back and Finish).
- E2E: new `dg-93-wizard-trap-add-dblclick.mjs`; `dg-82` AS-OWP-07 is updated (Shift+Tab now also visits the list); the scenarios that press a pointer right after choosing an Add menu item are paused or re-measured, never weakened (the list is in the plan).

## Acceptance scenarios

Common setup: the E2E harness; windows 1280×800 unless stated. Wizard scenarios: `autoPrompt: true`, the first-run seed (`defaultMetricsV3` + `defaultChromeV3`), `failStorageInit` on the local write of `quietTabOnboardingWizardComplete`, Skip, wait 500 ms, Finish; premise: `data-starters-locked="true"`, `tabindex="0"`, the eight boxes disabled. Menu scenarios: the harness without `autoPrompt`, a seed with one link at the far left of the grid, the six default metric and chrome items with the named metrics `enabled: false`, Settings clicked (edit mode on), Add clicked (the menu is open at the first level). "Press" is a real `page.mouse` press; before the second press the element under the point is read and printed (`elementFromPoint`). "Edit mode" is `#favorites[data-edit]`. "Weather tiles" are the `.desktop-grid > [data-widget-id^="weather:"]` nodes.

### AS-WTA-01 The locked list is a Tab and Shift+Tab stop of the wizard
- Given: step 2, the list locked, in 1280×800, 500×800 and 320×600.
- When: (a) focus on Finish, Tab; (b) focus on `body`, Tab; (c) focus on Back, Shift+Tab; (d) focus on `body`, Shift+Tab; then, from the list, Tab and Shift+Tab; twelve presses in each direction without a pause.
- Then: (a) the list has focus (`:focus-visible` is true); (b) the list; (c) the list; (d) Finish; from the list Tab goes to Back, from the list Shift+Tab to Finish; the Tab cycle is `list back finish list ...` and the Shift+Tab cycle is `finish back list finish ...`; focus is inside `#onboarding-wizard` after every press (never `body`, never a tile or the Settings tile behind it).
- Red on `RUN57_BASE` (premise): (a) lands on Back and the list is never visited.
- Verified by: E2E `dg-93-wizard-trap-add-dblclick.mjs`; `newtabSource` pin.

### AS-WTA-02 The list scrolls from the keyboard when reached from Finish
- Given: step 2, locked, 500×800 and 320×600, where the list overflows (premise: `scrollHeight > clientHeight`).
- When: focus on Finish, Tab (the list takes focus), ArrowDown twice, PageDown once.
- Then: `scrollTop` grows after each (the scroll is animated: read after 500 ms and 700 ms); the dialog does not move and `scrollX` of the document stays 0.
- Verified by: E2E `dg-93`.

### AS-WTA-03 Step 2 before the lock is unchanged
- Given: step 2 with the rows active (the flag write not refused).
- When: Tab from `body` twelve times, then Shift+Tab from `body` twelve times.
- Then: the Tab order is the eight rows in order, Back, Finish, then the first row again; the Shift+Tab order is Finish, Back, the eight rows from the last, then Finish; the list has no `tabindex` and no `data-starters-locked`, and never takes focus.
- Verified by: E2E `dg-93`.

### AS-WTA-04 The other layers have the candidates they had
- Given: the wizard step 1; the change-mode city modal (a city set, opened from the Edit weather dialog's city field in edit mode, and from the hint tile with no city); the Add link dialog.
- When: Tab from `body` for twice the number of stops, then Shift+Tab.
- Then: the visited elements are, in order, exactly the visible, enabled, non-inert `input, button:not([role="option"])` elements inside the layer in document order (computed in the page by the old selector, printed), with the cycle wrapping at the first and last of them; no `[tabindex="0"]` element is visited; in the Add link dialog the cycle is `url label iconMode backgroundColorSource backgroundColor size` and the two footer buttons.
- Verified by: E2E `dg-93`; `newtabSource` pin (the selector adds only the locked-list part).

### AS-WTA-05 A double click on a restore item restores once and keeps edit mode
- Given: the second level of the Add menu is open (the first level, `Add weather tile…`, then 450 ms), (a) one metric hidden (UV), (b) three hidden (UV, Air quality, Precipitation); the point is the centre of the item; two seeds: (1) nothing lies under the point after the menu closes (the background is under it), (2) a link tile lies under it. Premise, read before the second press: `elementFromPoint` is `div.desktop-grid` for (1) and `button.favorite-tile` for (2). Windows: 1280×800 for every combination; 500×800, 320×600 and 1280×600 for (a)(1).
- When: (i) `dblclick` on the first item; (ii) in (b), `dblclick` on the second item; (iii) two presses 120 ms apart on the first item.
- Then: exactly the pressed metric is restored (the weather tile count grows by 1 and the restored tile exists); edit mode is `true`; no dialog is open (no `edit-link` for (2)(iii)); the menu is closed; the focus is on the restored tile (the swallowed press does not move it).
- Red on `RUN57_BASE` (premise): (1) edit mode `false` in every window; (2)(iii) an `edit-link` dialog is open.
- Verified by: E2E `dg-93`; `newtabSource` pins.

### AS-WTA-06 A double click on `Add weather tile…` opens the second level once
- Given: the first level is open; (a) one metric hidden, (b) three hidden; seeds (1) and (2) of AS-WTA-05; 1280×800 for all four, 500×800 and 320×600 for (b)(1).
- When: `dblclick` on `Add weather tile…`; separately two presses 120 ms apart on it.
- Then: the menu is the second level (`aria-label` "Add weather tile") and lists every hidden metric; no metric is restored (the weather tile count is unchanged); edit mode is `true`; no dialog is open; the focus is on a menu item.
- Red on `RUN57_BASE` (premise): (b) the second item (Air quality) is restored without being chosen; (a) the menu is gone, and with seed (2) an `edit-link` dialog is open.
- Verified by: E2E `dg-93`; `newtabSource` pin.

### AS-WTA-07 A double click on `Add link` is unchanged
- Given: the first level is open, 1280×800 (seeds (1) and (2)).
- When: `dblclick` on `Add link`.
- Then: one `add-link` dialog and no menu; edit mode is `true`; the second press does not close the dialog (backdrop ignored while the dialog's 300 ms guard runs); no second dialog. (The focus after the double click, `body`, is not asserted: § Accepted exceptions 3.)
- Verified by: E2E `dg-93`.

### AS-WTA-08 A deliberate press after the window works, one inside it does not
- Given: edit mode, one hidden metric, 1280×800.
- When: (a) restore the metric with one click, press the background 120 ms later, and in a second load 450 ms later (page clock); (b) click `Add weather tile…`, press outside the menu 120 ms later, and in a second load 450 ms later; (c) click `Add weather tile…`, click the first item 450 ms later.
- Then: (a) at 120 ms edit mode stays `true`; at 450 ms edit mode becomes `false`; (b) at 120 ms the second level stays open and edit mode is `true`; at 450 ms the menu closes, the focus returns to the Add tile and edit mode is still `true` (the existing behaviour of `dg-30`: an outside press that closes the menu never also leaves edit mode); (c) the metric is restored.
- Verified by: E2E `dg-93`.

### AS-WTA-09 The keyboard is not guarded
- Given: edit mode, one hidden metric, the Add tile focused.
- When: Enter on the Add tile (the menu opens, focus on `Add link`), ArrowDown, Enter on `Add weather tile…`, Enter on the item at once (no pause); separately Escape pressed 50 ms after `Add weather tile…` was picked by the mouse.
- Then: the metric is restored by the second Enter inside the window (keyboard activation has `detail` 0); the Escape closes the menu and the focus returns to the Add tile, edit mode stays `true`; a second Escape leaves edit mode.
- Verified by: E2E `dg-93`.

### AS-WTA-10 Texts
- No string is added or changed. The existing names stay: the menu `Add` and `Add weather tile`, the items `Add link`, `Add weather tile…` and the metric names, the list `Starter links`. `test/vocabulary.test.js` stays green.

## Review focus

1. Scenarios: the guard window now also follows a pick in the Add menu, so every scenario that presses a pointer within 300 ms after choosing `Add weather tile…` or a metric must be listed and re-measured (the plan has the list); the outside-press listener and `backgroundPressed` reading the same window (a press inside the window that would have closed the menu or left edit mode); the case of seed (2), a tile under the second press, where the swallowed press still starts a pending drag on `pointerdown` and ends it without moving; the unlocked and locked cycles of the wizard.
2. Visual: nothing is drawn; look at the focus ring of the list when it takes focus from Finish (the existing ring of `AS-CMF-18`).
3. Accessibility and texts: Tab and Shift+Tab never leave the wizard, the list has its name `Starter links` when focused, the keyboard path of the Add menu is not slowed by the window, no new text.

## Accepted exceptions

1. After a pick of `Add weather tile…` or of a metric, a deliberate pointer press within 300 ms is lost: a click on another menu item, on the background, on a tile, on Settings, or an outside press that would close the menu (measured: a click on the first item 120 ms after `Add weather tile…` is swallowed; at 450 ms it works). The same trade as the other guarded transitions (`docs/onboarding-wizard-polish.md` Accepted exceptions). A pointer user who picks the metric within 300 ms of opening the second level has to press again.
2. The `mousedown` inside the window is default-prevented on any target (the focus does not move), as for the wizard and the city modal (`docs/city-modal-focus-copy.md` decision 9).
3. Found on the way, old and not changed: a double click on `Add link` leaves the focus on `body` (a single click puts it on the `url` input), because the second press moves it to the backdrop before the dialog's own guard ignores the click. Arming the guard when the dialog opens would swallow a quick deliberate click inside the new dialog, so it is not done here. Noted for the orchestrator as an old visible Minor (`pipeline/stages.md`, criterion 3).
4. With the lock the list is the first candidate, so Shift+Tab from `body` still enters at Finish (the last), as before, and Tab from `body` enters at the list instead of Back.

## Non-goals

- The length of the window (300 ms), the backdrop guard of dialogs, `ONBOARDING_STEP2_GUARD_MS`, the Reset grid dialog guard.
- A new guard, flag, timer or event listener; any guard for `Add link`.
- The trap of the city modal and of desktop dialogs; the unlocked list; the rows and the lock rules of `docs/onboarding-wizard-polish.md` decision 3.
- The focus after a double click on `Add link` (Accepted exception 3).
- The E2E harness (backlog 177): part of run 57, in the plan, not a product behaviour.
- Storage, weather, layout.
