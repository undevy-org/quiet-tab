# City modal: focus after Save, announcements, failure behaviour and copy

## Status

`draft` — revision 1 (2026-10-17, stage 0). Run №44 (`city-modal-focus-copy`), cluster "Модал города: фокус, объявления, тексты" of the roadmap (R44). Backlog 26, 39, 40, 41 (L2-03 only), 53, 54, 60 (V2-01 and V2-02 only), 98 and 99. The code facts under § Triage are a pre-measurement by reading `main` at `1e0eeab`; the executor's first step is to reproduce every item live on `origin/main` and record the result there (an item that does not reproduce is closed with a backlog line and its AS and tasks are dropped by a spec fix).

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). The storage shape does not change; the stored location keeps `{ version, name, country, latitude, longitude }`.

Related: `docs/modal-overlay-design.md` (the city modal), `docs/use-my-location.md` (the location link), `docs/network-error.md` and `docs/city-error-ux.md` (city errors), `docs/onboarding-wizard.md`, `docs/onboarding-wizard-polish.md` (click guard; its Decision 1 is superseded in part by decision 9 below), `docs/weather-tile-retry.md` (Retry and "Weather updated"), `docs/stale-tab-closeout.md`, `src/newtab.js` (`changeCity`, `syncCityModal`, `hideCityModal`, `announce`, `syncWeatherDialogCity`, `createCityLocationDescription`, `syncLocationLink`, `buildOnboardingStep2`, `syncOnboardingWizardUi`, `armPostCloseClickGuard`), `src/weatherService.js` (`persistAndFetch`, `setCity`, `selectLocation`), `src/surfaces.css`.

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-06 (run 14 final) | Backlog 26: after Save in the city modal focus falls to `body` and `#desktop-live` stays empty. | `confirmed` (owner, 2026-10-17) | decision 1 |
| 2026-10-06 (run 16) | Backlog 39: Save without edits re-selects the city; on a network failure the modal closes silently and every tile turns to an error. | `confirmed` (owner, 2026-10-15) | decisions 2–3 |
| 2026-10-06 (run 16) | Backlog 40: an identical live-region string is not read twice ("UV index hidden", "Link deleted"). | `confirmed` (technical default) | decision 4 |
| 2026-10-06 (run 16) | Backlog 41 L2-03: "No city set" reads like a city name. | `confirmed` (owner, 2026-10-17) | decision 5 |
| 2026-10-09 / 2026-10-10 | Backlog 53, 54, 60 V2-01: while locating, the description reads "…or Finding your location…." with an orphan full stop. | `confirmed` (owner, 2026-10-17) | decision 6 |
| 2026-10-10 | Backlog 60 V2-02: the focus ring of `.city-location-link` has no padding and no radius. | `confirmed` (technical default) | decision 7 |
| 2026-10-15 (run 42 gate) | Backlog 98: locked starter rows cannot be scrolled from the keyboard (axe `scrollable-region-focusable`). | `confirmed` (technical default) | decision 8 |
| 2026-10-15 (run 42 gate) | Backlog 99: the swallowed second click of a double click still moves focus. | `confirmed` (technical default) | decision 9 |

Out of scope, other sessions: backlog 41 L2-02 and 60 V2-04 (stacking of modals, R46), the suggestion list ARIA and overlay (R45), everything else in the queue.

## Triage (pre-measurement by reading `main` at `1e0eeab`; live measurement below)

- **26.** `changeCity` (`newtab.js:3559-3599`) on success calls `hideCityModal` (`:1393-1418`), which sets `pendingFocus = [cityModalOpener, SETTINGS_TILE_SELECTOR]`. From the hint tile the opener `[data-widget-id="weather:hint"]` no longer exists after the first city, so focus lands on Settings (not on `body` as the old note said; on `body` only while the request runs). While `weatherBusy`, `syncCityModal` (`:1228-1235`) disables every `input, button` of the modal; in change mode the focus then drops to `body`, in the wizard step 1 it is rescued by `:1241-1252` (title with `tabindex=-1`). No `announce` is made for a city change.
- **39.** `persistAndFetch` (`weatherService.js`, `:46-55`) writes the location through `locationStore.setLocation` first and then catches a forecast failure and returns `{ status: "error", location }`. `changeCity` treats that as success: the modal closes and `weatherResult` becomes the error for every tile. The unchanged Save does not re-geocode: `chosenCity` is the stored city (`newtab.js:925`), so the submit handler (`:1308-1329`) takes `activeCityForm.chosen()` and calls `selectLocation` with the stored coordinates, which still re-fetches and, when the network is down, replaces healthy (or stale) tiles with errors and rewrites the same location. A typed different name goes through `setCity` (geocode, then the same persist-then-fetch).
- **40.** `announce` (`newtab.js:98-101`) only sets `textContent`; setting an identical string is not a mutation, so it is not read again. Only "Weather updated" clears first (`:3524`).
- **41 L2-03.** `syncWeatherDialogCity` (`:2222-2234`) writes `label || "No city set"` plus the hint `Change` / `Set a city`; `button.city-field` is named by `aria-labelledby` (row label, value, hint), so it reads "City No city set Set a city".
- **53 / 54 / 60 V2-01.** `createCityLocationDescription` (`:718-740`) builds "Search for a city or [use your location]." and, on the wizard, "Enter a city, [use your location], or skip for now."; `syncLocationLink` (`:1111-1121`) replaces only the link text with `LOCATION_BUSY_LABEL`, giving "…or Finding your location…." and "Enter a city, Finding your location…, or skip for now."; the `sr-only` status span gets the same label on the next frame (`:1143-1147`).
- **60 V2-02.** `surfaces.css:90-114`: `.city-location-link { padding: 0; … }`, `:focus-visible { background: var(--soft-fill-strong); box-shadow: 0 0 0 2px var(--focus-overlay-ring); }`, no radius.
- **98.** `buildOnboardingStep2` (`:1573-1593`) creates `ul.onboarding-wizard__starters` without `tabindex` or a name; `overflow-y: auto` (`surfaces.css:213-222`); locking in `syncOnboardingWizardUi` (`:1496-1510`) sets `data-starters-locked` and disables the checkboxes, which leave the tab order.
- **99.** `armPostCloseClickGuard` (`:289-302`): 300 ms, a capture `click` listener that swallows only `detail > 0`; the `mousedown` of the second press still moves focus (Back → Skip under it, Continue → `body`, Finish → the tile or `body`).

### Live measurement on `origin/main` `1e0eeab` (run 44 step 1, probe `scratch/run-44-triage/probe.mjs` in notes, throw-away profiles, 2026-10-17)

| Item | Result | Measured |
|------|--------|----------|
| 26 | reproduces (the old note's "body" is wrong: Settings) | From the hint tile after Save: `activeElement` = `chrome:settings`, `#desktop-live` = "" (empty), city stored. From the weather dialog's city field: focus returns to the field button, but `#desktop-live` still holds the older "Editing layout. Activate Settings to finish." (no city announcement). Busy phase (forecast held): `activeElement` = `BODY`, Save disabled. |
| 39 unchanged Save | reproduces | Stored Tbilisi, field value `Tbilisi, Georgia`, forecast failing: Save sends 0 geocoding and 2 forecast/air-quality requests, the modal closes, all four tiles turn to "Weather unavailable: Can't re…" (were healthy 21 / 10% / 40 / 3). |
| 39 changed city | reproduces | Typed `Berlin`, forecast failing: 1 geocoding + 2 forecast requests, the modal closes, no error shown, stored city becomes `Berlin`, all four tiles error. |
| 40 | partly: see note | Two consecutive deletes: "Link deleted" then "Link deleted": one `MutationObserver` batch between them (assigning `textContent` replaces the text node even for an equal string), so a DOM mutation does occur today. Whether assistive technology re-reads it cannot be measured here. Decision: keep decision 4 as a robustness fix (clear, then set on the next frame, which also makes the empty state observable); AS-CMF-10 asserts the observable empty state between two identical strings and the final text, not just "a mutation". |
| 41 L2-03 | reproduces | No city: the field text `No city setSet a city`, `aria-labelledby` = row label + value + hint, computed name `City No city set Set a city`. |
| 53 / 54 / 60 V2-01 | reproduces | Change modal while locating: paragraph text `Search for a city or Finding your location….` plus the sr-only status `Finding your location…`; link `aria-disabled="true"`, focus stays on it. Wizard step 1: `Enter a city, Finding your location…, or skip for now.` plus the status. |
| 60 V2-02 | reproduces | Link focused with the keyboard (`:focus-visible` true): `padding 0px`, `margin 0px`, `border-radius 0px`, `box-shadow 0 0 0 2px rgba(17,19,24,.55)`. |
| 98 | reproduces | Locked list (starters written, flag write failing) at 500×600: `data-starters-locked="true"`, no `tabindex`, no `aria-label`, `scrollHeight > clientHeight`, all boxes disabled; Tab cycles only Back, Finish. |
| 99 | reproduces | Double click (second press 40 ms after the first) at +50 / +400 ms: Skip: `activeElement` is the starter checkbox of row 2 (the press under the pointer), not the first row; Back: `BODY` (target: step 1 title); Finish: `BODY` (target: Settings). |

All items stay in scope. Nothing is closed without code.

## Decisions

Owner decisions (Кир) are marked with their date; the rest are technical defaults chosen by the stage-0 author (not asked).

1. **Focus and announcement after a city change (backlog 26; owner, 2026-10-17).** After a successful Save in the change-mode city modal:
   - opened from the "Set a city" hint tile: focus goes to the weather tile whose `data-widget-id` equals the hint's `data-metric-id`, read before the modal closes (the hint stands in the cell of the first enabled metric in item order, `newtab.js:2771-2783`, so that metric's tile takes the cell). If no such tile exists, to Settings as today. The tile is a keyboard focus target (`tabIndex = 0`); the focus ring and the tooltip that `:focus-visible` shows are accepted;
   - opened from the weather edit dialog's city field (the modal is stacked over the dialog): focus returns to the dialog's city field, as today;
   - in both cases `#desktop-live` announces `City set to <Name, Country>` (`cityDisplayLabel` of the stored location, e.g. `City set to Berlin, Germany`; a location without a country: `City set to Berlin`). The announcement is made once, after the modal is removed and the tiles are rendered. Nothing is announced for Cancel, for an unchanged Save (decision 2) or for a failure.
   - **Busy phase (technical default).** While `weatherBusy` disables the modal's controls in change mode, focus must not drop to `body`: the same rescue as wizard step 1 (focus the modal title, which gets `tabindex="-1"`) when the focus is on `body`, outside the modal, or on a disabled control. On a failure the input is focused (as today).
2. **Save without a change is Cancel (backlog 39; owner, 2026-10-15).** "Unchanged" means (technical default): the input value equals `cityDisplayLabel(storedCity)` and `chosen()` (a picked suggestion or a result of "use your location", both fill it) has exactly the stored `latitude` and `longitude` (no tolerance; a city from "use your location" after rounding with other coordinates is "changed"). Save then behaves exactly as Cancel: the modal closes through the Cancel path with the same focus target, nothing is written to storage, no request is sent, no announcement, tiles untouched. The text is compared as typed (the field is trimmed first); an emptied field is still "Enter a city name".
3. **A failed forecast keeps the city (backlog 39; owner, 2026-10-15).** In change mode a new city is persisted only after the forecast succeeded (resolve, fetch, persist). If the geocoding or the forecast fails (any `weatherErrorMessage` class, including the 15 s timeout), the modal stays open, the message from `weatherErrorMessage` shows in the existing `[data-city-modal-error]` slot, the input is refocused and Save is enabled again; the stored location, the weather cache, `weatherResult` and every tile stay exactly as before the Save, and nothing is announced. Technical defaults:
   - the service gets an option, not a copy of the logic in `newtab.js` (module boundaries of `CLAUDE.md`): `setCity(name, { persist: "after-forecast", isStale })` and `selectLocation(location, { persist: "after-forecast", isStale })` (names are the executor's; the contract is the behaviour). With the option the phases are separate: fetch (forecast and air quality, no write), then `if (isStale()) throw`, then `locationStore.setLocation`, then `cacheStore.setCache`. A failure of `setCache` after a successful forecast is not fatal: the in-memory result is returned and the location is not rolled back (the cache is a cache). The default path keeps `fetchAndCache` writing the cache itself; a failure rejects with the original error (so `changeCity` shows `weatherErrorMessage`); without the option `persistAndFetch` keeps today's persist-then-fetch and its return values, so `weatherService.test.js` "selectLocation returns an error status without throwing … but still persists" stays valid;
   - `initialize()` (used by Retry and by the boot load) is unchanged;
   - in change mode (with the option; the wizard path is excluded, see below) a result that arrives after `withTimeout` fired (15 s, `CITY_REQUEST_TIMEOUT_MS`) must never persist or render: `changeCity` marks the attempt stale (`isStale`) when the timeout fires, a new attempt starts, or the modal closes, and the service checks it after the fetch and before the location write (a timeout that fires inside the `setLocation` / `setCache` awaits does not cancel a write already started: Accepted exceptions);
   - the weather cache is not written for a stale or failed attempt either (a half-applied attempt must not leave the new city's forecast in `chrome.storage.local`);
   - **Wizard step 1 keeps today's behaviour (owner, 2026-10-17):** Continue that finds the city but fails the forecast saves the city, goes to step 2 and shows the tiles with the error and Retry. The wizard path therefore does not use the new option and keeps its existing behaviour for a late result (it may still persist the city after 15 s; Accepted exceptions).
4. **A repeated live-region string is read again (backlog 40).** `announce(text)` must make the live region mutate even when `text` equals the current content: clear the node, then set the text on the next animation frame (or another reliable technique that keeps the region present in the DOM); the existing special case for "Weather updated" (`newtab.js:3524`) folds into `announce`; a timer fallback (`setTimeout`, ~50 ms) covers a hidden tab where `requestAnimationFrame` does not fire. Call sites unchanged in meaning: Link added / saved / deleted, `<Metric> hidden`, edit mode on / off, weather retry ("Weather updated"; its failure text goes through `showDesktopStatus`, not `announce`, and is not part of this change), and the new `City set to …`. A later `announce` during the pending frame replaces the pending text (only the last is set); `announce("")` clears at once.
5. **No city in the weather dialog's City field (backlog 41 L2-03; owner, 2026-10-17).** With no stored city (none, or the stored city could not be read) the field shows a single muted line `Set a city` (the muted text token that the placeholders use, contrast ≥ 4.5:1) and the separate hint is `hidden` and left out of `aria-labelledby`; there is no "No city set". The accessible name of the `button.city-field` stays the `aria-labelledby` join with single spaces (no commas): `City Set a city` (row label, then the line once; no duplicate). With a city the field and its name are unchanged: `Berlin, Germany` plus the hint `Change`, `title` the full label, name `City Berlin, Germany Change`. Activating the field still opens the change-mode city modal (title `Set a city` with no city, `Change city` with one).
6. **The description becomes the status while locating (backlog 53, 54, 60 V2-01; owner, 2026-10-17).** While the browser location is being looked up (`locating`), the whole description line shows only the link itself, `Finding your location…`: inactive (`aria-disabled="true"`, no underline, as today), focus stays on it, and the surrounding words (`Search for a city or `, `.`, `Enter a city, `, `, or skip for now.`) are hidden (not just visually: they leave the accessibility tree too). The paragraph then contains the link and the sr-only status span (the span is a child of the same `<p>`, as today). "Visible text" is measured without `.sr-only`. When the lookup ends (success, error, timeout, cancellation by closing) the full sentence returns with the link text `use your location`, focus still on the link as today. Same in the change-mode city modal and on wizard step 1. The sr-only `role="status"` span keeps announcing `Finding your location…`; the focused link may be read as well (Accepted exceptions), so no "read once" is asserted, only the tree. Technical default: the description keeps its height while locating (it is pinned to the height measured just before the switch and released after), so the field below does not jump; AS-CMF-16 measures it.
7. **Focus ring of the location link (backlog 60 V2-02).** `.city-location-link:focus-visible` gets horizontal padding with an equal negative margin (the text does not move) and a `border-radius` equal to the radius of other text controls (`--radius-control` unless the executor's live comparison shows another token is used by the text-style controls), the ring `box-shadow` is kept and must not be clipped by the dialog or the wizard scroll container at 320 px.
8. **A locked starter list is keyboard-scrollable (backlog 98).** While `data-starters-locked="true"` the `ul.onboarding-wizard__starters` has `tabindex="0"`, `aria-label="Starter links"` and a visible focus ring (the focus-ring token of the dialog, not clipped by the list's own overflow: an inset ring or an outline with a negative offset); the arrow keys / Page keys scroll it natively. When not locked it has no `tabindex` (the rows are the focus stops). The label is added together with the tabindex (an unlabeled focusable list would be a new axe error).
9. **The swallowed second click does not move focus (backlog 99).** During the post-close guard window (`POST_CLOSE_CLICK_GUARD_MS`, 300 ms) a pointer `mousedown` (and `pointerdown` where `mousedown` alone does not stop the focus move; the executor measures) gets `preventDefault()` in a capture listener next to the click guard, so focus stays where the code put it (Settings after Finish, the step 1 title after Back, the first starter row after Skip, the opener or Settings after the city modal closes). The click swallowing is unchanged; keyboard is unaffected (no `mousedown`); a press after the window behaves as always; opening a modal clears the guard as today. This **supersedes in part** Decision 1 of `docs/onboarding-wizard-polish.md` ("It does not touch `pointerdown`"): the executor adds one line to that document pointing here (docs only, no other edit to it).

## Scope

- `src/newtab.js` (`announce`, `changeCity` and its callers, `syncCityModal` busy rescue, `hideCityModal` focus target and announcement, the unchanged-Save check in the change-mode submit handler, `syncWeatherDialogCity`, the `city-field` markup and its `aria-labelledby`, `createCityLocationDescription` and `syncLocationLink`, `buildOnboardingStep2` / `syncOnboardingWizardUi`, the guard listeners), `src/weatherService.js` (the persist option), `src/surfaces.css` (muted line, link focus ring, list focus ring), `CHANGELOG.md` `[Unreleased]`, `agent-config/CLAUDE.md` (a short update of the Weather paragraph), one pointer line in `docs/onboarding-wizard-polish.md`, `docs/use-my-location.md` (the busy description) if its text states the old busy sentence.
- Tests: `test/weatherService.test.js` (the persist option: order of writes, failure leaves storage untouched, stale result dropped, default unchanged), a unit test of `announce` (repeat mutates) in the pure/source style the project uses, `test/newtabSource.test.js` (pins: the announcement phrase, the `tabindex`/`aria-label` of the locked list, the `mousedown` guard, no "No city set" string, `Set a city` line, link padding and radius rule), mutation-proven after the implementation. New E2E `dg-84-city-modal-focus-copy.mjs`.
- Older scenarios that assert the old strings or focus are updated if they turn red, never weakened (§ Affected earlier scenarios).
- Not touched: the storage keys and shapes, `initialize()`, the suggestion list, modal stacking and z-order, tile layout.

## Acceptance scenarios

Common setup: the E2E harness with the first-run wizard off unless stated; default tiles; a stored city `Tbilisi, Georgia` unless stated; network and geocoding mocked through the harness; sizes 1280×800, 500×800, 320×600 unless stated. "Storage unchanged" means `chrome.storage.sync` and `chrome.storage.local` snapshots are equal before and after.

### AS-CMF-01 Save from the hint tile: focus on the hint's metric tile, city announced
- Given: no stored city; the hint tile `weather:hint` stands in the first enabled metric's cell.
- When: the hint is activated, `Berlin` is chosen from the suggestions (and, separately, typed and submitted), Save.
- Then: the modal closes; focus is on the weather tile whose id equals the hint's `data-metric-id` (the one now in the hint's former cell; `document.activeElement` is that tile; the `:focus-visible` tooltip may show); `#desktop-live` text is `City set to Berlin, Germany`; the hint is gone; the stored location is Berlin, written once.
- Verified by: E2E `dg-84`.

### AS-CMF-02 Save from the weather dialog's city field
- Given: a stored city; the weather edit dialog open; its city field activated (the modal stacks over the dialog).
- When: another city is chosen and Saved.
- Then: the modal closes; focus is on the dialog's city field; its value line reads the new `Name, Country`; `#desktop-live` is `City set to <Name, Country>`; the dialog is still open and interactive.
- Verified by: E2E `dg-84`.

### AS-CMF-03 Focus is never on `body` while the city request runs
- Given: change mode, a geocoding / forecast response held by the harness.
- When: Save is pressed and the controls become disabled.
- Then: while the request is pending `document.activeElement` is the modal title (`tabindex="-1"`), never `body`; after a failure it is the city input; after a success it is as in AS-CMF-01/02. Escape and backdrop do nothing while busy (unchanged).
- Verified by: E2E `dg-84`.

### AS-CMF-04 Save without a change is Cancel
- Given: stored city `Tbilisi, Georgia`; the change modal open from the weather edit dialog's city field (the only change-mode entry with a stored city); the field prefilled.
- When: Save is pressed without editing; then the same with the stored city picked again from the suggestions; then with the text edited and restored to the identical label.
- Then: each time: the modal closes, focus goes where Cancel would put it, storage unchanged, zero network requests (geocoding and forecast counters 0), nothing in `#desktop-live`, tiles and their data identical. With the network switched off in the harness the tiles stay healthy (no error tiles).
- Verified by: E2E `dg-84`.

### AS-CMF-05 A forecast failure keeps the city and the modal
- Given: stored city `Tbilisi, Georgia` with healthy tiles; the forecast endpoint fails (network error) while geocoding works.
- When: another city is typed, resolved and Save pressed.
- Then: the modal stays open, `[data-city-modal-error]` shows the network message of `weatherErrorMessage` (role `alert`), the input is focused with the typed text kept, Save is enabled again; the stored location is still Tbilisi (storage unchanged), the weather cache is unchanged, the tiles still show Tbilisi data; `#desktop-live` stays empty. Then the network is restored and Save pressed again: the city changes, the modal closes, AS-CMF-01/02 outcomes hold.
- Verified by: E2E `dg-84`; unit tests (service option).

### AS-CMF-05b A forecast failure on the first city (from the hint tile)
- Given: no stored city, the hint tile, the forecast failing, geocoding working.
- When: a city is typed and Saved.
- Then: the modal stays open with the network message, the input focused, nothing stored (storage unchanged), the hint tile still stands, `#desktop-live` empty; after the network returns, Save works and AS-CMF-01 holds.
- Verified by: E2E `dg-84`.

### AS-CMF-06 The same inside the stacked modal and for a picked suggestion
- Given: the AS-CMF-05 setup, with the modal stacked over the weather dialog, and separately a suggestion picked (no geocoding call) before Save.
- When: Save with the forecast failing.
- Then: the modal stays open over the dialog, the dialog's city row still shows the old city, storage unchanged, the error shows; Escape then closes the modal with the old city intact.
- Verified by: E2E `dg-84`.

### AS-CMF-07 City not found keeps today's behaviour
- Given: change mode, geocoding returns no match.
- When: Save.
- Then: `City "<name>" was not found` in the slot, input focused, storage and tiles unchanged (regression guard; no persist happened before either).
- Verified by: E2E `dg-84` (or the existing `dg-45`/`dg-47`).

### AS-CMF-08 A late result after the timeout is ignored
- Given: change mode, the harness holds the forecast response beyond the 15 s timeout (Playwright fake clock `page.clock`; no test hook in `src/`).
- When: Save; the timeout error shows; then the held response is released.
- Then: the timeout message is in the slot, the modal stays open; after the release storage is unchanged (no location write, no cache write), `weatherResult` and the tiles are unchanged, nothing is announced, no `pageerror`. A second Save started after the timeout and answered quickly wins normally; the first response, arriving later, is dropped.
- Verified by: E2E `dg-84`; unit test of the stale flag.

### AS-CMF-09 Wizard step 1 keeps persist-then-fetch
- Given: the first-run wizard, step 1, the forecast failing.
- When: a city is entered and Continue pressed.
- Then: the city is stored, the wizard goes to step 2, and after Finish the tiles show the error with a Retry control (as before this run); the live region is not used for `City set to …` by the wizard (technical default: the wizard path does not announce).
- Verified by: E2E `dg-84` (`dg-60` stays green).

### AS-CMF-10 A repeated announcement is read again
- Given: a `MutationObserver` on `#desktop-live` (childList / characterData).
- When: a link is deleted, then another is deleted ("Link deleted" twice in a row); a tile hidden and restored and hidden again (same `<Metric> hidden`); two city changes A to B to A (the second `City set to A` repeats the first after an intermediate string; the region is observed empty between consecutive identical strings only for the delete / hide / retry cases); two Retry presses ("Weather updated" twice).
- Then: between the two occurrences the region is observed empty (cleared, then set again) and the final text equals the string (live triage: an equal `textContent` assignment already replaces the node today, so a bare mutation is not a failing signal); the region always contains only the last string; a rapid second `announce` before the frame replaces the pending text.
- Verified by: E2E `dg-84`; unit test of `announce`.

### AS-CMF-11 No city in the weather dialog's City field
- Given: no stored city; a weather tile enabled; the weather edit dialog open (also separately with the stored city unreadable, `weatherLocationError`).
- When: the dialog opens and the City row is inspected.
- Then: the field shows exactly one line `Set a city` in the muted text colour (contrast ≥ 4.5:1 against the field background, light and dark); no "No city set" text anywhere in the dialog; no separate hint text; the field's accessible name (`ariaSnapshot()` / computed name) is exactly `City Set a city`; activating it opens the modal titled `Set a city`.
- Verified by: E2E `dg-84` (`lib/contrast.mjs`).

### AS-CMF-12 With a city the field is unchanged
- Given: stored city `Tbilisi, Georgia`.
- When: the weather edit dialog opens.
- Then: the field shows `Tbilisi, Georgia` in the text colour with the hint `Change`, `title` equals the label, the accessible name reads `City Tbilisi, Georgia Change` (unchanged); after a city change under the dialog (AS-CMF-02) the row updates, and after the stored city becomes unreadable on a later render it switches to the AS-CMF-11 form.
- Verified by: E2E `dg-84`.

### AS-CMF-13 Locating in the change modal: the line is the status
- Given: the change-mode city modal, geolocation held by the harness.
- When: `use your location` is activated.
- Then: the visible text of the description paragraph (without `.sr-only`) is exactly `Finding your location…` (the link, `aria-disabled="true"`, not underlined); `Search for a city or ` and the full stop are not rendered and not in the accessibility tree (`ariaSnapshot()` of the paragraph shows the link and the status span only); focus is still on the link; the sr-only status span says `Finding your location…`. When the lookup resolves (field filled), fails (error slot, field untouched) or times out, the paragraph reads `Search for a city or use your location.` again with the link text `use your location`, `aria-disabled` removed, focus still on the link.
- Verified by: E2E `dg-84` (`dg-62` strings updated).

### AS-CMF-13b A late geolocation success is ignored
- Given: the change modal (and, separately, wizard step 1), the harness holds the browser position beyond the lookup deadline (fake clock `page.clock`, no hook in `src/`), then answers with a success.
- When: `use your location` is activated; the deadline passes (the timeout error shows); then the held position is released. Variant: the modal is closed before the release.
- Then: the full sentence is back, `aria-disabled` removed, focus on the link, the field is not filled, the status span is empty, `weatherBusy` false, no storage write, no `pageerror`; the Nominatim reverse lookup is not called after the deadline / close.
- Verified by: E2E `dg-84`.

### AS-CMF-14 Locating on wizard step 1
- Given: the wizard, step 1, geolocation held.
- When: `use your location` is activated.
- Then: the visible text of the step description is exactly `Finding your location…`; after the lookup it is `Enter a city, use your location, or skip for now.`; Skip and Continue remain disabled while busy as today; the same outcomes as AS-CMF-13 for focus and the status span.
- Verified by: E2E `dg-84`.

### AS-CMF-15 Closing during a lookup leaves no stale line
- Given: the AS-CMF-13 state.
- When: Escape (not ignored while only locating, as today) or Cancel closes the modal; then the modal is opened again.
- Then: the new modal shows the full sentence, no busy line, no stale status text.
- Verified by: E2E `dg-84`.

### AS-CMF-16 The description does not make the field jump
- Given: the AS-CMF-13 and AS-CMF-14 moments at 1280×800 and 320×600.
- When: the line switches to the status and back.
- Then: the top edge of the city input (and of the footer buttons) moves by at most 1 px between the resting and the locating state, and back; the dialog box height changes by at most 1 px.
- Verified by: E2E `dg-84`.

### AS-CMF-17 The focus ring of the location link
- Given: the description at rest, the link focused with the keyboard (`:focus-visible`).
- When: focus is on the link; then moved away.
- Then: the link's computed `border-radius` is > 0 and equals `--radius-control` (8px, the radius of Cancel and Save in the same modal); the computed horizontal padding is > 0 and the link's text box does not move (`getBoundingClientRect()` of the paragraph and of the text left of the link (measured with a `Range`) equal within 0.5 px with and without focus); the ring is not clipped by the dialog / wizard at 500 and 320 px (the ring box lies inside the scroll container's box); ring contrast against the panel ≥ 3:1 in light and dark.
- Verified by: E2E `dg-84`; design review.

### AS-CMF-18 A locked starter list can be scrolled from the keyboard
- Given: wizard step 2 with the flag write failed (rows locked, `data-starters-locked="true"`), a window where the list overflows (320×600 and 500×800).
- When: Tab from the step title; then ArrowDown / PageDown.
- Then: the list takes focus (before Back and Finish in the tab order); it has `tabindex="0"` and `aria-label="Starter links"`; a focus ring is visible and not clipped (the ring colour differs from the surrounding background by ≥ 3:1); the arrow keys scroll it (`scrollTop` grows). With the rows unlocked the list has no `tabindex` attribute and the first enabled row is the first focus stop. The locked list has the tab stop even when it does not overflow (1280×800; accepted, simpler and checkable).
- Verified by: E2E `dg-84` (`dg-75` AS-SRP-04b stays green).

### AS-CMF-19 A double click does not move focus
- Given: (a) wizard step 2 after Back; (b) step 1 after Skip; (c) step 2 after Finish (wizard closed); (d) the change modal after Cancel / Save.
- When: a double click (two `click` events, `detail` 1 and 2, `mousedown` of the second press inside 300 ms) on Back, Skip, Finish, Cancel.
- Then: the second click does nothing (as today) and the second `mousedown` is default-prevented (`defaultPrevented` true), so focus stays at the code's target: step 1 title after Back, the first starter row after Skip, Settings after Finish, the opener or Settings after the modal closes; `document.activeElement` is read at +50 ms and at +350 ms. A `mousedown` at +299 ms is default-prevented and at +301 ms is not (page clock, edges of `POST_CLOSE_CLICK_GUARD_MS`); a `mousedown` at +350 ms on a tile behaves normally (focus moves). A press whose `mousedown` is inside the window but whose `click` arrives after 300 ms is not swallowed and acts (focus not moved; accepted). A keyboard Enter / Space within the window is not affected.
- Verified by: E2E `dg-84` (`dg-82` AS-OBP guards stay green).

### AS-CMF-20 Keyboard walkthrough of the change modal
- Given: the change modal open with a city.
- When: Tab through the controls; Enter in the field; Escape.
- Then: the order is unchanged (field, clear, location link, Cancel, Save); Enter on an unchanged field closes like Cancel (AS-CMF-04); Escape closes and focus returns to the opener or Settings; no new tab stop appears outside the wizard's locked list.
- Verified by: E2E `dg-84`.

### AS-CMF-21 Narrow and low windows
- Given: the AS-CMF-05, -11, -13 and -18 states at 500×800, 320×600 and 1280×600.
- When: the states are shown.
- Then: no horizontal scroll, the error slot, the `Set a city` line and the status line stay inside the dialog (the line wraps or ellipsizes as the city field does today), nothing overlaps the footer buttons.
- Verified by: E2E `dg-84`; design review.

### AS-CMF-22 Texts
- Given: any state above.
- When: the strings are read.
- Then: the new or changed strings are exactly: `City set to <Name, Country>` (live region), `Set a city` (the dialog's City line), `City Set a city` (accessible name), `Finding your location…` (the whole line while locating; the existing U+2026 ellipsis), `Starter links` (list name). The strings `No city set` and `…or Finding your location….` appear nowhere in the UI. Existing strings unchanged (`Change`, `Change city`, `Set a city` title, `Weather updated`, error messages of `weatherErrorMessage`).
- Verified by: E2E `dg-84`; `newtabSource` pins.

### AS-CMF-23 Storage shape and writes
- Given: any flow above.
- When: storage is inspected after each flow.
- Then: the stored location has the same keys as before; a successful change writes the location once and the cache once; an unchanged Save, a failure and a stale result write nothing. Data compatibility: not required (no-users policy, `agent-config/CLAUDE.md`).
- Verified by: E2E `dg-84`; unit tests.

## Affected earlier scenarios

The executor greps `.private/e2e/scenarios/` and updates (never weakens) before the implementation task: `13-city-modal` and `dg-29-weather-modal` (the string `No city set`, "city-field says … with the hint Set a city", focus after Save), `dg-58-modal-overlay` (AS-MO-04/06 `No city set`, `checkState("no city", …)`), `dg-62-use-my-location` (`Finding your location…` as a link text inside the sentence; the description strings `WIZARD_DESC`, `CHANGE_DESC` stay for the resting state), `dg-45-city-network-error` and `dg-47-city-error-ux` (a forecast failure after Save used to close the modal and error the tiles in change mode), `dg-60-onboarding-wizard`, `dg-65`, `dg-75`, `dg-82` (wizard focus, guard, locked rows), `dg-54-weather-tile-retry` ("Weather updated"), `dg-04`, `dg-06`, `dg-07`, `dg-17` (announcements), `dg-23-a11y-names` (the City field name). Retired scenarios stay retired.

## Review focus

1. Scenarios: unchanged Save versus a picked suggestion with the same coordinates; persist-after-forecast ordering and the stale-attempt flag (timeout, a second attempt, the modal closed meanwhile); that the wizard path really keeps persist-then-fetch; focus target when the hint cell becomes a weather tile; the stacked-modal cases; announce timing (frame) with a rapid second call; the double-click window edges (299 / 301 ms).
2. Visual: the `Set a city` muted line in the City row (contrast, both themes, 320 px); the one-line status in place of the sentence (no jump of the field); the link focus ring with padding and radius against the muted text; the locked list's focus ring not clipped.
3. Accessibility/texts: the accessible name `City Set a city` (no double reading); the status line read once; `aria-disabled` link keeps focus; `Starter links` name; `City set to …` politeness and no double announcement with the focus move; reduced motion (nothing animated here).

## Accepted exceptions

- Wizard step 1 does not announce `City set to …` and keeps persist-then-fetch (owner, 2026-10-17): the step change and the focus move already speak, and a failed forecast after Continue is a deliberate "city saved, tiles show the error" path.
- A city that was persisted by another tab between Save and the forecast result is overwritten by this Save only on success (last writer wins, as for every mutation).
- A very fast second `announce` replaces a pending one; the earlier text is never spoken.
- The wizard path keeps persist-then-fetch, so a forecast that finishes after the 15 s timeout may still persist the wizard's city (unchanged behaviour).
- A timeout that fires while `setLocation` or `setCache` is already running does not cancel that write; the stale check is made after the fetch and before the location write.
- Save without a change no longer re-requests the forecast; Retry is the only way to re-request when the tiles show errors (consequence of the owner's decision 2).
- The status line is spoken by the sr-only `role="status"` span; screen readers that also read the focused disabled-looking link may say it twice (the link keeps focus by the owner's decision).
- The post-close guard now also blocks the focus move of a `mousedown` in its window on any element, including a deliberate press on another control within 300 ms of a modal closing (the click is already swallowed, so the press had no effect anyway).

## Non-goals

- The suggestion list (ARIA roles, overlay) — R45; the stacking of modals and the stacked-dialog strips (backlog 41 L2-02, 60 V2-04) — R46.
- Auto-retry of weather, new error classes, changing `weatherErrorMessage` copy.
- Any storage change or migration.
- Announcing in the wizard; moving the wizard's focus rules beyond the guard.
- Any other backlog item.

## Process

Stage 0 package (this spec, the plan `superpowers/plans/2026-10-17-city-modal-focus-copy.md`, the kickoff `pipeline/kickoffs/run-44-city-modal-focus-copy.md`, `inflight/city-modal-focus-copy.md`). No visual reference: copy and focus changes, described in text.
