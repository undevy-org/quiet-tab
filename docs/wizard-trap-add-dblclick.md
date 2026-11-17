# Wizard tab trap and the double click on the Add menu: the locked starter list is a stop of the trap, a double click on a restore item stays one action

## Status

`implemented`

Revision 4 (2026-11-15, stage 4: texts and two measured clarifications only, no decision changed). Revision 3 (2026-11-15, stage 2 of run 57: answers the review `reports/wizard-trap-add-dblclick-spec-review.md` (I1, I2, M1, M2) and the Minor of spec gate round 1 `design-review/runs/2026-11-15-ca12cf8-spec-r1` (L0-01, L0-04, L0-06); the map is in `## Review rounds`). Revision 2 (stage 0): narrowed by the orchestrator before the first review, backlog 181 is closed on the `restore` branch of the Add menu only. Run №57 (`wizard-trap-add-dblclick`), row R57 of the roadmap. Backlog 180 and 181 are fixed here (backlog 177, the E2E harness, is part of the same run but has no product behaviour and is not described in this spec).

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
| 2026-11-15 | Backlog 181 (run 53, final review): in edit mode a double click on an item of the Add menu restores the tile once, then leaves edit mode. | `confirmed` for the metric item (live, § Live measurement 2) | decisions 2 and 3 |

Decision of Kier, 2026-11-15 (the chat of the local Claude Code session, no message id): a narrow scope. 180: add the locked list to the trap, nothing else. 181: reuse the existing post-close guard, introduce no new mechanism. Orchestrator decision, 2026-11-15 (revision 2): the guard is armed only when the menu closes on a metric item (the `restore` branch); the move from the first to the second level (`Add weather tile…`) is not touched, because swallowing a deliberate quick click on a second-level item would be new behaviour and a trade, and it would break eight older scenarios; the measured double click on `Add weather tile…` stays as it is (§ Non-goals). No questions to Kier at stage 0; no Ruling.

## Live measurement

Chromium through the E2E harness, throw-away profiles, build of `RUN57_BASE`, 1280×800 unless stated. The probe scripts are not committed. Every pointer press below is a real one (`page.mouse`), `elementFromPoint` was printed or read from the recorded event target before the second click.

**1. The trap and the locked list (180).** Three windows (1280×800, 500×800, 320×600), the first-run wizard, `quietTabOnboardingWizardComplete` write refused (the harness `failStorageInit`), Skip, Finish.
- Step 2 before the lock, Tab from `body` twelve times: `box0 box1 box2 box3 box4 box5 box6 box7 back finish box0 box1`; Shift+Tab from `body`: `finish back box7 ... box0 finish back`. The list has no `tabindex`.
- After the lock the list has `tabindex="0"` and `aria-label="Starter links"`, focus is on Finish. Tab from Finish six times: `back finish back finish back finish`. Tab from `body`: `back finish back finish ...`. Shift+Tab from `body`: `finish back finish back ...`. Shift+Tab from Back four times: `finish back finish back`. The list never takes focus. The only `[tabindex="0"]` inside the wizard is the list.
- The list is reachable only from above it (the step title made focusable by the scenario, `dg-84` AS-CMF-18): a person who arrives by Tab from Finish or Shift+Tab from Back cannot reach the keyboard scroll stop that decision 8 of `docs/city-modal-focus-copy.md` created.
- Other layers, for the unchanged check: the Add link dialog from `body`: `url label iconMode backgroundColorSource backgroundColor size` then the two footer buttons, a cycle of eight; the wizard step 1 cycle is the location link, the city field and Skip (the clear button is hidden and Continue is disabled while the field is empty; no list).

**2. The double click on the Add menu (181).** Edit mode, one link at the far left of the grid, UV hidden (1 hidden metric) or UV, Air quality and Precipitation hidden (3 hidden); the Add tile at its default cell; the menu opens under it (menu box 200 px wide, 94 px high at the first level, 54 px with one metric, 134 px with three). `page.mouse.dblclick` (the events carry `mousedown` and `click` with `detail` 1 then 2, the `pointerdown` and `pointerup` events carry `detail` 0) and two clicks 120 ms apart at the same point.
- **Edit mode is left by `pointerdown` + `pointerup` on the background, not by a click.** After the first click on a `restore` item the menu is gone; the second press lands on the background (`div.desktop-grid`; `isBackground` accepts `main.desktop` too, and in narrow windows the press target is `main.desktop`): `pointerdown`, `mousedown`, `pointerup`, `mouseup` on it, and `#favorites[data-edit]` is `false`. The listener is `backgroundPressed` (set on `pointerdown` of `#favorites`, acted on at `pointerup`). The guard swallows only a `click` and the default of a `mousedown`, so arming it alone would not stop this exit.
- **Restore item (second level), background under the second press:** the tile is restored once, edit mode ends. Same with 1 hidden and with 3 hidden (first item and second item), and at 500×800, 320×600 and 1280×600 (every size: `edit` `false`). In the 500×800 and 320×600 windows, with a pause between the presses, the second press can land on the restored weather tile already drawn there: on `RUN57_BASE` its click opens `edit-weather`; with the guard that click is swallowed and the outcome is the same as elsewhere (edit mode on, no dialog).
- **Restore item, a link tile under the second press (120 ms gap):** the second press lands on the link tile (`elementFromPoint`: `button.favorite-tile`), edit mode stays, and the click opens the `edit-link` dialog of a link the person never touched. A fast `dblclick` (no gap) was spared in this seed: only `pointerdown` and `pointerup` were recorded on the tile, no `mousedown` and no `click` (the cause was not isolated; the render that follows the restore is the likely one).
- **`Add weather tile…` (first level, second item), 3 hidden:** the first click swaps the menu to the second level (the same node), the second press hits the second level's item at the same point and restores it (`Air quality` restored without being chosen); edit mode stays. 1 hidden: the second level is one item high (54 px), the second press lands outside it, the `pointerdown` that closes the Add menu on an outside press closes it, nothing is restored, edit mode stays, the menu is gone; with a link tile under the second press its click is delivered and the `edit-link` dialog of that link opens. Not fixed by this run (§ Non-goals).
- **`Add link` (first level, first item):** the first click closes the menu and opens the `add-link` dialog; the second press lands on `div.desktop-backdrop`; the backdrop ignores it (the 300 ms backdrop guard of the dialog, `DIALOG_BACKDROP_GUARD_MS`); one dialog, edit mode stays. No defect of this class.
- Incidental, old, out of scope (§ Accepted exceptions 3): after a double click on `Add link` `document.activeElement` is `body`; after a single click it is the `url` input. The dialog is the same.
- Minimality check on throw-away patched copies (not committed), same probes. (v3) `armPostCloseClickGuard()` in the `restore` branch only: with a link tile under the second press the existing capture listener swallows its `click` (no `edit-link` dialog, edit mode `true`, the restored tile focused); with the background under it edit mode still ends (`false`), because that exit is `pointerdown` + `pointerup`. (v2) v3 plus `!postCloseGuardActive()` in `backgroundPressed`: every `restore` case above ends with edit mode `true`, exactly the pressed metric restored, no dialog, in all four windows. The outside-press listener is not needed for `restore` (the menu is already closed, the listener returns at `!addMenuRoot`) and is not changed. In v2 a click on the first second-level item 120 ms after a click on `Add weather tile…` restores it (unchanged); a background press 120 ms after a restore leaves edit mode on, 450 ms after it ends it.

## Decisions

1. **The locked list is a stop of the trap (180).** `tabTrapFocusables` adds `[data-starters-locked="true"]` to its candidate selector (the existing `input, button:not([role="option"])` part and the filter for disabled, hidden and inert candidates stay). The candidates stay in document order, so the list comes before Back and Finish: with the lock the cycle is `list back finish` in both directions, the wrap points are the list (first) and Finish (last). Nothing else changes: with no lock the list has no `data-starters-locked` and no `tabindex`, and the unlocked cycle, step 1, the change-mode city modal and the desktop dialogs have exactly the candidates they had. The selector names the attribute, not `[tabindex="0"]`, so no other element can become a stop by accident.
2. **Choosing a metric in the Add menu arms the guard (181).** `onAddMenuClick` calls `armPostCloseClickGuard()` in the `restore` branch (the menu closes and the tile is restored), at the moment of the pick. The `add-weather` branch (the menu moves to the second level) and the `add-link` branch are not touched: `add-link` has no defect of this class (§ Live measurement 2), and the second-level case is left as it is (§ Non-goals). The `click` of a keyboard activation has `detail` 0 and is not swallowed, but `onAddMenuClick` is the one handler for the mouse and the keyboard, so the window is armed by any pick of a metric; a pointer press on the background within 300 ms after a pick made with the keyboard does nothing either (same window, same Accepted exception 1). The existing precedents are the wizard step transitions (`goToOnboardingStep2`, `goToOnboardingStep1`, `docs/onboarding-wizard-polish.md` decision 1).
3. **`backgroundPressed` also respects the window.** Edit mode is left by `pointerdown` + `pointerup` on the background, which the click guard does not stop, so without this the background case stays red (v3 above). `backgroundPressed` is not set while the window runs, through one read-only helper `postCloseGuardActive()` (`return performance.now() < postCloseGuardUntil`) next to `armPostCloseClickGuard()`. That one read of `postCloseGuardUntil` is the whole addition: no new constant, timer, flag or listener, and the outside-press listener of the Add menu is not changed (for `restore` the menu is already closed). With a link tile under the second press nothing more is needed: the existing capture listener swallows its click.
4. **Escape and every keyboard path are unchanged.** Escape closes the Add menu or leaves edit mode in the existing order inside the window too (no listener of the guard looks at `keydown`).

## Scope

- `src/newtab.js`: the candidate selector of `tabTrapFocusables`; `postCloseGuardActive()`; one `armPostCloseClickGuard()` call in the `restore` branch of `onAddMenuClick`; one condition in `backgroundPressed`.
- `test/newtabSource.test.js`: the pins that name the old text are replaced (not weakened): the `backgroundPressed` line (`it("guards the background click ...")`) and the candidate selector of `AS-CSL-04` (it still requires the option exclusion); new pins for decisions 1 to 3 (the `add-weather` and `add-link` branches must NOT call the guard).
- `CHANGELOG.md` (`[Unreleased]`), `agent-config/CLAUDE.md` (the facts about `tabTrapFocusables` and the `restore` guard), `docs/onboarding-wizard-polish.md` (a superseded note on the Accepted exception about the locked list having no tab stop, and on AS-OWP-07, which says Shift+Tab visits only Back and Finish), `docs/city-modal-focus-copy.md` (one sentence in decision 8: the locked list is also reached from Back and Finish).
- E2E: new `dg-93-wizard-trap-add-dblclick.mjs`; `dg-82` AS-OWP-07 is updated (Shift+Tab now also visits the list); the scenarios that press a pointer within 300 ms after choosing a metric in the Add menu are paused or re-measured, never weakened (the list is in the plan).

## Acceptance scenarios

Common setup: the E2E harness; windows 1280×800 unless stated. Wizard scenarios: `autoPrompt: true`, the first-run seed (`defaultMetricsV3` + `defaultChromeV3`), `failStorageInit` on the local write of `quietTabOnboardingWizardComplete`, Skip, wait 500 ms, Finish; premise: `data-starters-locked="true"`, `tabindex="0"`, the eight boxes disabled. Menu scenarios: the harness without `autoPrompt`, the city seed of `dg-30` and `dg-08` (`weatherFixture.sync` and `weatherFixture.local()`: a city and a fresh weather cache, no request is made; without a city only the hint tile is drawn, a restored metric adds no `weather:` node and the focus goes to the Add tile), the six default metric and chrome items (`defaultMetricsV3`, `defaultChromeV3`) with the named metrics `enabled: false`, the links of the seed named by the scenario (default: one link at the far left of the grid), Settings clicked (edit mode on), Add clicked (the menu is open at the first level). "Press" is a real `page.mouse` press. A premise about what lies under the second press is read from the target of the second `pointerdown` that a capture listener of the scenario records in the page (a `dblclick` leaves no pause for `elementFromPoint`) and, where there is a pause between the presses, also printed with `elementFromPoint`. "Edit mode" is `#favorites[data-edit]`. "Weather tiles" are the `.desktop-grid > [data-widget-id^="weather:"]` nodes.

### AS-WTA-01 The locked list is a Tab and Shift+Tab stop of the wizard
- Given: step 2, the list locked, in 1280×800, 500×800 and 320×600.
- When: (a) focus on Finish, Tab; (b) focus on `body`, Tab; (c) focus on Back, Shift+Tab; (d) focus on `body`, Shift+Tab; then, from the list, Tab and Shift+Tab; twelve presses in each direction without a pause.
- Then: (a) the list has focus (`:focus-visible` is true); (b) the list; (c) the list; (d) Finish; from the list Tab goes to Back, from the list Shift+Tab to Finish; the Tab cycle is `list back finish list ...` and the Shift+Tab cycle is `finish back list finish ...`; focus is inside `#onboarding-wizard` after every press (never `body`, never a tile or the Settings tile behind it).
- Red on `RUN57_BASE` (premise): (a) lands on Back and the list is never visited.
- Verified by: E2E `dg-93-wizard-trap-add-dblclick.mjs`; `newtabSource` pin.

### AS-WTA-02 The list scrolls from the keyboard when reached from Finish
- Given: step 2, locked, 500×800 and 320×600, where the list overflows (premise: `scrollHeight > clientHeight`).
- When: focus on Finish, Tab (the list takes focus), ArrowDown twice, PageDown once.
- Then: `scrollTop` grows after each (the scroll is animated: read after 500 ms and 700 ms); the top of the wizard dialog's `getBoundingClientRect()` is equal before and after (±0.5 px; the dialog may scroll inside itself) and `scrollX` and `scrollY` of the document stay 0.
- Verified by: E2E `dg-93`.

### AS-WTA-03 Step 2 before the lock is unchanged
- Given: step 2 with the rows active (the flag write not refused).
- When: Tab from `body` twelve times, then Shift+Tab from `body` twelve times.
- Then: the Tab order is the eight rows in order, Back, Finish, then the first row again; the Shift+Tab order is Finish, Back, the eight rows from the last, then Finish; the list has no `tabindex` and no `data-starters-locked`, and never takes focus.
- Verified by: E2E `dg-93`.

### AS-WTA-04 The other layers have the candidates they had
- Given: (a) the wizard step 1 (fresh); (b) the wizard step 1 reached by Back from a locked step 2 (Finish, flag write refused, Back; the locked list sits in the hidden, inert step 2); (c) the change-mode city modal (a city set, opened from the Edit weather dialog's city field in edit mode, and from the hint tile with no city); (d) the Add link dialog.
- When: Tab from `body` for twice the number of stops, then Shift+Tab from `body` for the same number.
- Then: the visited elements are, in order, exactly the native Tab stops of the old candidate set: the elements of `input, button:not([role="option"])` inside the layer that are enabled, not inert, have `getClientRects().length > 0`, with one radio per `name` group (the checked one; the first when none is checked), in document order (folded in the page, printed); the cycle wraps at its first and last element; no `[tabindex="0"]` element is visited. In (b) the starter list is not visited (the hidden step 2 is cut by the `hidden` and `inert` filter): the Tab and Shift+Tab cycles equal those of (a). In (d) the folded set is the literal cycle of eight, `url label iconMode backgroundColorSource backgroundColor size` then the Cancel and Save buttons (measured on `RUN57_BASE`: the unfolded candidate list has fifteen elements, the Tab walk visits eight), Tab from Save goes to `url` and Shift+Tab from `url` goes to Save.
- Verified by: E2E `dg-93`; `newtabSource` pin (the selector adds only the locked-list part).

### AS-WTA-05 A double click on a restore item restores once and keeps edit mode
- Given: the second level of the Add menu is open (the first level, `Add weather tile…`, then 450 ms), (a) one metric hidden (UV), (b) three hidden (UV, Air quality, Precipitation); the point is the centre of the item; two seeds: (1) one link at the far left, so nothing lies under the point after the menu closes (the background is under it); (2) a link in every cell the menu box covers (the item rects are read while the menu is open and the cells are taken from them; at 1280×800 with `defaultChromeV3` the Add tile is displayed at (7,0) and the menu covers columns 7 to 9 of rows 1 and 2, the centres of the first two items fall into cell (8,1)). Premise: the target of the second `pointerdown` (recorded in the page) is `div.desktop-grid` for (1) and `button.favorite-tile` for (2) in (i), (ii) and (iii); for (iii) `elementFromPoint` before the second press says the same. Windows: 1280×800 for every combination; 500×800, 320×600 and 1280×600 for (a)(1).
- When: (i) `dblclick` on the first item; (ii) in (b), `dblclick` on the second item; (iii) two presses 120 ms apart on the first item.
- Then: exactly the pressed metric is restored (the weather tile count grows by 1 and the restored tile exists); edit mode is `true`; no dialog is open (in particular no `edit-link` for seed (2): the link tile's click is swallowed by the existing guard, measured in v3); the menu is closed; the focus is on the restored tile (the swallowed press does not move it).
- Red on `RUN57_BASE` (premise): (1) edit mode `false` in every window; (2)(iii) an `edit-link` dialog is open.
- Verified by: E2E `dg-93`; `newtabSource` pins.

### AS-WTA-06 The move to the second level is unchanged
- Given: the first level is open; (a) one metric hidden, (b) three hidden; 1280×800.
- When: one click on `Add weather tile…`, then a click on the first second-level item 120 ms later (a deliberate quick pick); separately, one click on `Add weather tile…` and an outside press 120 ms later.
- Then: the quick pick restores that metric (the weather tile count grows by 1, edit mode `true`, no dialog); the outside press closes the menu and edit mode stays `true`, as on `RUN57_BASE` and in `dg-30`. This protects the older scenarios that pick a metric right after `Add weather tile…` (the list is in the plan).
- Verified by: E2E `dg-93`; `newtabSource` pin (the `add-weather` branch does not call `armPostCloseClickGuard`).

### AS-WTA-07 A double click on `Add link` is unchanged
- Given: the first level is open, 1280×800 (seeds (1) and (2)).
- When: `dblclick` on `Add link`.
- Then: one `add-link` dialog and no menu; edit mode is `true`; the second press does not close the dialog (backdrop ignored while the dialog's 300 ms guard runs); no second dialog. (The focus after the double click, `body`, is not asserted: § Accepted exceptions 3. **Superseded (run 59, decision 11):** the focus is on the `url` input, as after a single click; `dg-95` AS-BC-11 asserts it.)
- Verified by: E2E `dg-93`.

### AS-WTA-08 A deliberate press after the window works, one inside it does not
- Given: edit mode, one hidden metric, 1280×800.
- When: restore the metric with one click, then press the background 120 ms later; in a second load press it 450 ms later (page clock). Separately, after the restore press the Settings tile 120 ms later and 450 ms later.
- Then: at 120 ms edit mode stays `true` (and the Settings press does nothing); at 450 ms the background press ends edit mode and the Settings press toggles it. A press on the background with no restore before it ends edit mode as before.
- Verified by: E2E `dg-93`.

### AS-WTA-09 The keyboard is not guarded
- Given: edit mode, one hidden metric, the Add tile focused.
- When: Enter on the Add tile (the menu opens, focus on `Add link`), ArrowDown, Enter on `Add weather tile…`, Enter on the item at once (no pause); separately Escape pressed 50 ms after a metric was picked by the mouse.
- Then: the metric is restored by the second Enter (the click of a keyboard activation has `detail` 0 and is not swallowed); after the mouse pick Escape leaves edit mode (the menu is already closed, the existing order of layers). A pointer press on the background 120 ms after a pick made with the keyboard does nothing (the window is armed by any pick; Accepted exception 1), one at 450 ms ends edit mode.
- Verified by: E2E `dg-93`.

### AS-WTA-10 Texts
- No string is added or changed. The existing names stay: the menu `Add` and `Add weather tile`, the items `Add link`, `Add weather tile…` and the metric names, the list `Starter links`. `test/vocabulary.test.js` stays green.

## Review focus

1. Scenarios: the guard window now also follows the pick of a metric in the Add menu, so every scenario that presses a pointer within 300 ms after that pick must be listed and re-measured (the plan has the list); `backgroundPressed` reading the same window (a background press inside the window that would have left edit mode); seed (2), a tile under the second press, where the swallowed press still starts a pending drag on `pointerdown` and ends it without moving; the unlocked and locked cycles of the wizard; that the `add-weather` and `add-link` branches stay untouched.
2. Visual: nothing is drawn; look at the focus ring of the list when it takes focus from Finish (the existing ring of `AS-CMF-18`).
3. Accessibility and texts: Tab and Shift+Tab never leave the wizard, the list has its name `Starter links` when focused, the keyboard path of the Add menu is not slowed by the window, no new text.

## Accepted exceptions

1. After a metric is picked from the Add menu, a deliberate pointer press within 300 ms is lost (on the background, on a tile, on Settings): measured, a background press 120 ms after the restore does nothing and one at 450 ms ends edit mode. The same trade as the other guarded closes (`docs/onboarding-wizard-polish.md` Accepted exceptions). It holds also after a pick made with the keyboard: the window is armed by the pick whatever its source.
2. The `mousedown` inside the window is default-prevented on any target (the focus does not move), as for the wizard and the city modal (`docs/city-modal-focus-copy.md` decision 9).
3. Found on the way, old and not changed: a double click on `Add link` leaves the focus on `body` (a single click puts it on the `url` input), because the second press moves it to the backdrop before the dialog's own guard ignores the click. Arming the guard when the dialog opens would swallow a quick deliberate click inside the new dialog, so it is not done here. Noted for the orchestrator as an old visible Minor (`pipeline/stages.md`, criterion 3). **Superseded (run 59, `docs/backlog-closeout.md` decision 11, AS-BC-11, backlog 182):** `openDesktopDialog` cancels the `mousedown` default of such a press in the first 300 ms, so the focus stays on the `url` input; the click guard of the backdrop is unchanged.
4. With the lock the list is the first candidate, so Shift+Tab from `body` still enters at Finish (the last), as before, and Tab from `body` enters at the list instead of Back.

## Non-goals

- The double click on `Add weather tile…` (the first level's second item). Measured on `RUN57_BASE` and left as it is, old behaviour found on the way (a backlog line, "старое, найдено попутно"): with 3 hidden metrics the second press hits the second level's item at the same point and restores Air quality without it being chosen; with 1 hidden metric the second press falls outside the shrunken menu and the menu closes, nothing is restored; with a link tile under the second press its click opens the `edit-link` dialog of that link. Closing it would mean arming the guard on the move to the second level and swallowing a deliberate quick pick there (AS-WTA-06 protects that pick), which is new behaviour and a trade, decided out of this run. **Superseded in part (run 59, `docs/backlog-closeout.md` decision 12, AS-BC-12, Kier's variant A):** the second press of a double click on `Add weather tile…` (at most 300 ms and 4 px from the click that opened the second level) now does nothing: the second level stays open, nothing is restored and no `edit-link` dialog opens; a deliberate quick pick that close is lost with it (`dg-93` stays as it is: its 450 ms recipe is outside the window).
- The length of the window (300 ms), the backdrop guard of dialogs, `ONBOARDING_STEP2_GUARD_MS`, the Reset grid dialog guard.
- A new guard, flag, timer or event listener; any guard for `Add link`; any change to the outside-press listener of the Add menu. **Superseded in part (run 59, `docs/backlog-closeout.md` decision 12):** that listener now asks the pure rule `isSwapSecondPress` after its `!addMenuRoot` return and, on a yes, arms the post-close guard and returns; no other change to it, and no new listener, timer or flag.
- The trap of the city modal and of desktop dialogs; the unlocked list; the rows and the lock rules of `docs/onboarding-wizard-polish.md` decision 3.
- The focus after a double click on `Add link` (Accepted exception 3). **Superseded (run 59, `docs/backlog-closeout.md` decision 11, AS-BC-11):** it is fixed: a press within 300 ms of a dialog's open that lands on its backdrop or on a part of it that is not a control keeps the focus where the dialog put it.
- The E2E harness (backlog 177): part of run 57, in the plan, not a product behaviour.
- Storage, weather, layout.

## Review rounds

- **Revision 4 (stage 4, 2026-11-15).** After the spec gate, on the implementation: texts and measured clarifications only, no decision changed. `fourteen` is `fifteen` in AS-WTA-04 and the step 1 cycle in `Live measurement` 1 names the location link, the city field and Skip (the two Minor of `reports/wizard-trap-add-dblclick-spec-review-2.md`); `Live measurement` 2 says that `isBackground` accepts both `main.desktop` and `div.desktop-grid` and that in 500×800 and 320×600 with a pause the second press can land on an already drawn restored weather tile (swallowed by the guard, same outcome).
- **Revision 3 (stage 2, 2026-11-15).** Answers `reports/wizard-trap-add-dblclick-spec-review.md` (needs revision, 2 Important) and the Minor of spec gate round 1 (`design-review/runs/2026-11-15-ca12cf8-spec-r1`, PASS, 3 Minor).
  - I1: the menu scenarios get the city seed of `dg-30` (`weatherFixture.sync` + `weatherFixture.local()`); seed (2) of AS-WTA-05 is a link in every cell the menu box covers, cells taken from the item rects.
  - I2: AS-WTA-04 compares the walk with the old candidate set folded to native Tab stops (one radio per group, no node without client rects); the Add link cycle of eight and its two wraps are written out.
  - M1: the premise about what lies under the second press of a `dblclick` is the target of the recorded second `pointerdown`; `elementFromPoint` only where there is a pause.
  - M2 and L0-01: AS-WTA-04 (b), step 1 after Back from a locked step 2 does not visit the list.
  - L0-04: Decision 2, AS-WTA-09 and Accepted exception 1 say the window is armed by a pick made with the keyboard too; behaviour unchanged.
  - L0-06: AS-WTA-02 measures the dialog's `getBoundingClientRect().top` instead of "does not move".
  - Scope names `docs/city-modal-focus-copy.md` (decision 8), which the plan already edits.
