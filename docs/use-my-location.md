# Use my location: fill the city from the browser's location

## Status

`draft`

Decision: **do it**. Owner request 2026-10-08 (pipeline stage 0, run #20 / `dg-62`): a way to fill the city field from the device location, so the user does not have to type a city on first run or when changing the city.

Owner decisions (2026-10-08, brainstorming):

- Placement: an inline link inside the muted subtitle (not a separate full-width button).
- Behaviour: **fill, not save**. A successful lookup fills the city field; the user still presses **Continue** (wizard) or **Save** (change). No auto-advance, no auto-close.
- Surfaces: onboarding wizard step 1 and the change-mode city modal (opened from the weather edit dialog's city field and the "Set a city" hint tile, the only two change-mode entries: `src/newtab.js:1750`, `:2726`).
- No location request on open. Nothing happens until the user activates the link.
- Reverse geocoding: Nominatim (OpenStreetMap), because Open-Meteo geocoding is forward-search only.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). The stored location keeps its shape (`{ version, name, country, latitude, longitude }`).

## Summary

Add the link **use your location** to the subtitle of the first-run wizard step 1 and of the change-mode city modal. Activating it asks the browser for the position (`navigator.geolocation`, Chrome's own permission prompt), reverse-geocodes the rounded coordinates to a city name, and fills the field through the existing suggestion-choose path. Saving goes through the existing submit path (`weatherService.selectLocation`) without a second geocoding request.

## Current behaviour (`main` @ `f75ff35`)

- Wizard step 1: title "Where should we show weather?", description "Enter a city, or skip for now." (`src/newtab.js`, `buildOnboardingWizard`), then `createCityForm("onboarding", …)`: field with Clear, error slot (`[data-city-modal-error]`, `role="alert"`), footer Skip | Continue.
- Change-mode city modal: title "Change city" / "Set a city", **no description**, then `createCityForm("change", …)`: field, error slot, footer Cancel | Save.
- While a city request runs, `weatherBusy` is true: `syncCityModal` disables every `input, button` in the host except `[data-weather-action="select-city"]`; Skip, Escape and backdrop do nothing on step 1; Escape and backdrop do nothing in the change modal; Cancel and Save are disabled (`attachOnboardingWizardListeners`, the `escapeLayer` handler, `attachCityModalListeners`).
- Choosing a suggestion calls `activeCityForm.choose({ name, country, latitude, longitude, label })`, which fills the input and remembers the choice; submit then calls `weatherService.selectLocation` (no second geocoding).
- `host_permissions` are the three Open-Meteo hosts (`manifest.json`). `store/privacy-disclosure.md` says "No browser geolocation API is used".

## Decisions (defaults the owner can override)

### Where the link lives

- Wizard step 1 description becomes: `Enter a city, use your location, or skip for now.` with the words **use your location** as the link.
- Change-mode city modal gets a new description between the title and the form: `Search for a city or use your location.` with the same link. It uses the existing `.city-modal__description` rule; the change dialog still gets no `aria-describedby`.
- The link is a native `<button type="button" class="city-location-link" data-weather-action="use-location">` inside the paragraph, styled as an inline link (underlined, inherits the description color and size, `font-weight: var(--font-weight-control)`). Its visible text is `use your location` and that text is its accessible name (no `aria-label`). It sits before the form in DOM order, so Tab order is: link, field, Clear (when visible), footer buttons.
- The link is always present (also when `navigator.geolocation` is missing); a missing API is reported through the error slot on activation.

### Flow (one function in `newtab.js`, `useMyLocation(variant)`)

1. Ignore the activation if `weatherBusy` is true or `weatherService` is missing.
2. Start: `weatherBusy = true` and `locating = true`; keep a module-level `AbortController` for the lookup; `status.textContent = ""` and then (next frame, `requestAnimationFrame`) `Finding your location…` so the same text is announced again on a retry. The deferred write checks that `locating` is still true and the generation is unchanged, and is cancelled (`cancelAnimationFrame`) in the finish, in `finally` and in teardown, so a fast refusal or a synchronous throw never leaves a stale `Finding your location…`; remember `weatherFormGeneration`; cancel the suggestion debounce and hide the list (as `changeCity` does); clear `cityModalError`; update the UI through `syncCityModal`/`syncOnboardingWizardUi`. The grid is not re-rendered. The branch `use-location` of the click handlers sits right after the existing `if (weatherBusy) return` guard (wizard `src/newtab.js:1380`, change `:996`; the handlers already reject a busy activation, `useMyLocation` repeats the check defensively) and before the `select-city` branch. `variant` is the form mode: `"onboarding"` or `"change"` (`createCityForm`).
3. Position: `getBrowserPosition()` with a total deadline of 15 s (each attempt's timers capture that attempt's own `AbortController`/state and are cleared in `finally`, so an old timer can never abort a newer attempt; an unknown `GeolocationPositionError.code` maps to `unavailable`). The deadline covers the time the permission prompt is open (the browser's own `timeout` option starts only after permission is granted, so the caller enforces the deadline with a race; the position options are `{ enableHighAccuracy: false, maximumAge: 300000, timeout: 12000 }`).
4. Round both coordinates to 2 decimals (about 1 km, enough for a city; the rounded values are what is sent to Nominatim and what is stored).
5. Reverse geocode with `reverseGeocodeCoordinates(lat, lon, { signal })`; `useMyLocation` owns an `AbortController` aborted after 8 s.
6. After each `await`, drop the result unless `weatherFormGeneration` is unchanged and `locating` is still true (the form was torn down). A dropped result changes nothing and shows nothing. Teardown (`hideCityModal`, the wizard teardown) aborts the lookup's `AbortController` and, ONLY when `locating` is true, sets `locating = false` and `weatherBusy = false` (a teardown during an ordinary city request must not clear that request's busy), so the next open starts idle.
7. Finish (current generation): `locating = false`, `weatherBusy = false`, restore the link text, sync the UI so the field and footer are enabled again. This happens BEFORE the field is filled, because `choose()` focuses the input and a disabled input cannot take focus.
8. Success: `activeCityForm.choose({ name, country, latitude, longitude, label: cityDisplayLabel({ name, country }) })`, then `activeCityForm.caretToEnd()`, then the status node announces `Location found: <label>`.
9. Failure: `status.textContent = ""`, set `cityModalError` from `locationErrorMessage(variant, failure)`, sync again, leave the field text and any earlier chosen city untouched, focus the link. The error slot is `role="alert"`.
10. Safety: steps 3–9 run inside `try { … } finally { … }`. `getBrowserPosition` wraps the synchronous `getCurrentPosition` call in `try` and rejects `unavailable`. Any other exception is treated as `{ source: "position", code: "unavailable" }` before the reverse step, `{ source: "reverse", kind: "unknown" }` during it, and as the `Couldn't get your location.` reason when it happens while filling the field (steps 7–8). For the current generation, `finally` always releases `locating`/`weatherBusy` and syncs the UI, so no exception can leave the dialog locked (`changeCity` has the same `finally`, `src/newtab.js:3036`). The status node (kept in a module reference `locationStatusNode`, reset in teardown, because `clearCityError` and the input handler live inside `createCityForm`) is also cleared when the user types or submits.

Nothing is persisted by this flow. `weatherService.selectLocation` / `setCity` run only on submit, through the existing handlers. The existing 350 ms guard after `choose()` (clicks on Cancel/Save/backdrop with `detail > 0` are ignored right after a suggestion is chosen) also applies after a located fill; clicks on the link itself are never suppressed.

### Busy state

- `weatherBusy` is reused, so every existing guard (Skip, Escape, backdrop, Cancel, Save, field, suggestion keys) behaves as during a city request: the field, Skip/Continue (or Cancel/Save) are disabled, the Clear button is hidden (`clear.hidden = weatherBusy || …`). The link is the exception: it stays focusable so focus is not lost and Tab keeps working inside the dialog (it is the only enabled control); it gets `aria-disabled="true"`, its text becomes `Finding your location…` (owner decision; no underline, not a link look), and activation is ignored. `syncCityModal` keeps the link enabled only while `locating` (`control.disabled = weatherBusy && !(locating && isLocateLink)`); during an ordinary city request (Continue/Save) the link is disabled like every other control, so the existing contract "while busy, Tab leaves no focusable control and focus falls to the title" (`13-city-modal` AS-14, `tabTrapFocusables`, the title-focus branch of `syncCityModal`) is unchanged.
- A visually hidden status node (`role="status"`) inside the description is the only live announcement: `Finding your location…` at the start and the success message at the end. The visible sentence is not a live region.
- `aria-busy` on the dialogs follows `weatherBusy && !locating` (change dialog `src/newtab.js:963`) and `(weatherBusy && !locating) || finishBusy` (wizard dialog, `:1216`), so the live status announcement is not suppressed by an ancestor with `aria-busy="true"`.
- Worst case the form is locked for 15 s + 8 s = 23 s; Escape and backdrop do nothing in that window (same contract as a running city request).

### Reverse geocoding (Nominatim)

- Endpoint `https://nominatim.openstreetmap.org/reverse`, parameters `lat`, `lon` (rounded), `format=jsonv2`, `addressdetails=1`, `zoom=10`, `accept-language=en`.
- Identification per the OSM usage policy: the request carries `User-Agent: QuietTab (+https://github.com/undevy-org/quiet-tab)` (a constant, no version, no personal data). **Open question closed by the first implementation task (the spike):** whether Chrome lets an extension page set `User-Agent` on `fetch`. If it cannot, the executor stops and asks the owner (no silent fallback to an unidentified request); the candidates to put to the owner are a `declarativeNetRequest` header rule (adds a permission), a valid `Referer`/`Origin` identification if Chrome sends one from the extension page, or dropping the feature.
- `reverseGeocodeCoordinates` converts our own `AbortError` (also while the body is being read: it parses the JSON itself instead of using `parseJson`) into `WeatherApiError` kind `timeout`; the 8 s timer and the `AbortController` live in `useMyLocation`.
- Parse defensively (the response is data): `address.city`, then `town`, `village`, `municipality`, then `county`, then `state`, first non-empty string wins as `name`; `country` from `address.country` (empty string when absent). If no name is found, or a 200 response has no `address` (Nominatim answers `{"error": …}` for points it cannot resolve, for example at sea): `WeatherApiError` kind `notFound`. HTTP errors (including 429) are kind `http`; a rejected fetch is `network`; invalid JSON (no `kind`) and any unknown kind map to the `http` reason of the error table. `display_name` and any other field are ignored.
- Result shape equals `geocodeCity`: `{ name, country, latitude, longitude }` where the coordinates are the caller's rounded input, not Nominatim's centroid.
- Rate: one request per activation; the busy lock prevents overlap, repeated activations are user-paced and the policy's 1 request/s is not enforced by a timer.

### Error copy

Each message is `<reason> <tail>`. Tail by surface: wizard `Enter a city or skip.`; change `Search for a city instead.`

| Failure | Reason |
|---------|--------|
| Position denied, unavailable, API missing, or an unexpected exception before the reverse step or while filling the field | `Couldn't get your location.` |
| Position deadline (15 s) or the browser's own timeout (code 3) | `Finding your location took too long.` |
| Reverse found no city name | `Couldn't find a city for your location.` |
| Reverse network failure or 8 s abort | `Couldn't look up your city. Check your connection.` |
| Reverse HTTP error (incl. 429), invalid JSON, or an unexpected exception during the reverse step | `The location service isn't responding.` |

The messages go through the existing error slot (`role="alert"`, 0 height at rest). The existing slot rules apply (cleared by the next input, submit or locate).

### Privacy, permissions, store

- `manifest.json`: add `https://nominatim.openstreetmap.org/*` to `host_permissions`. No `geolocation` permission is declared: Chrome prompts per origin for an extension page. **Expected, to be confirmed by the owner on an unpacked build (AS-UL-16; not a merge condition):** the prompt appears on the new tab page. If the owner finds that Chrome denies silently without the manifest permission, the fix is a follow-up run (the executor does not wait for it): declaring `geolocation` adds an install-time warning and is a product decision.
- `docs/privacy.md` and `store/privacy-disclosure.md`: browser location used only when the user activates the link; the rounded coordinates are sent to Nominatim once per activation to get a city name; only the chosen city (name, country, rounded coordinates) is stored, as before; weather requests still go to Open-Meteo with the stored coordinates; no location is sold or used for advertising; OpenStreetMap contributors / Nominatim named as the data source. Places that become false and must change (the stored/synced coordinates are now the user's rounded position (also `docs/privacy.md` "Data Stored"), and Nominatim sees the request IP like Open-Meteo does; both are said in the texts): `docs/privacy.md` (opening "sends requests only to Open-Meteo", the URL list, "No other request is made"), `store/privacy-disclosure.md` (Location block that says no geolocation is used, the permission justification, the remote-code host list; the stored coordinates are now the user's rounded position, not a city centre), `docs/architecture.md` (security boundaries: three hosts), `README.md` (host access and OpenStreetMap attribution line), `SECURITY.md:25`, `docs/architecture.md:28` and `:213`, `docs/onboarding-wizard.md:38` (step 1 subtitle), the module list in `agent-config/CLAUDE.md` (add `browserGeolocation.js`, `cityLocation.js`), `agent-config/CLAUDE.md` ("Host permissions are limited to Open-Meteo's three endpoints"), `CHANGELOG.md` `[Unreleased]`.
- Chrome Web Store dashboard (owner task at publication, not part of the PR): update the Privacy practices tab (Location data), the permission justification for the new host, and the privacy policy URL text. Listed in the backlog by the run; not a merge condition.

### Architecture

- `src/browserGeolocation.js` (new, no DOM, no storage): `getBrowserPosition({ timeoutMs = 15000, geolocation = globalThis.navigator?.geolocation })` → `{ latitude, longitude }`, rejects with `BrowserLocationError` whose `code` is `denied | unavailable | timeout | unsupported`. Enforces the deadline itself (race), so an open permission prompt cannot hang it.
- `src/cityLocation.js` (new, pure): `roundCoordinate` (never returns `-0`), `locationErrorMessage(variant, failure)` where `failure` is `{ source: "position", code }` or `{ source: "reverse", kind }` (mapping: position `denied|unavailable|unsupported` → "Couldn't get your location.", position `timeout` → "took too long", reverse `notFound` → "find a city", reverse `network|timeout` → "look up your city", reverse `http|unknown` → "isn't responding"), the copy constants.
- `src/weatherApi.js`: `reverseGeocodeCoordinates(lat, lon, { fetchImpl, signal })`; the private `request()` gains an optional `init` argument (headers, signal) while existing callers keep passing only the URL.
- `src/newtab.js`: description builders (`createCityLocationDescription(variant)`), `useMyLocation(variant)`, click wiring in the wizard and city modal listeners, the `syncCityModal` exclusion. No new store, service or UI-state module: nothing is persisted and the busy state already lives in `weatherBusy`.
- CSS: the change-mode description reuses the existing `.city-modal__description` rule (`src/surfaces.css`, currently unused); the wizard keeps `.onboarding-wizard__step-description`; one new `.city-location-link` rule in `src/surfaces.css` next to `.city-modal__description` (inline link look, busy look, focus ring, and the disabled look of other disabled controls, `--control-disabled-opacity`) and the status node reuses the existing `.sr-only` class (`src/newtab.css:402`), existing tokens only.

## Acceptance scenarios

Scenarios marked E2E run in `dg-62-use-my-location.mjs` with `navigator.geolocation` stubbed through `addInitScript` and Nominatim routed (never the real service).

### AS-UL-01 Wizard step 1 shows the link
- Given: fresh profile, no city, wizard step 1 open
- When: the user looks at the step
- Then: the description reads `Enter a city, use your location, or skip for now.` and `use your location` is a button with that exact accessible name, underlined, in the muted description color; the field, Skip and Continue are unchanged; no geolocation call has happened
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-02 Change modal shows the link
- Given: city set (or not), the change-mode modal opened from the "Set a city" hint tile and from the weather edit dialog's city field
- When: the modal opens
- Then: between the title and the field is the description `Search for a city or use your location.` with the same link; initial focus is still on the field; no geolocation call has happened
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-03 Wizard success fills the field, Continue saves
- Given: wizard step 1, geolocation returns (41.7151, 44.8271), Nominatim returns a city address (Tbilisi, Georgia)
- When: the user activates the link, then presses Continue
- Then: after the lookup the field shows `Tbilisi, Georgia`, focus is in the field with the caret at the end, Continue is enabled (a pointer press within 350 ms of the fill is suppressed by the existing guard, so the test waits), `quietTabWeatherLocation` is NOT yet stored; after Continue the wizard goes to step 2 and the stored location is `{ name: "Tbilisi", country: "Georgia", latitude: 41.72, longitude: 44.83 }` (plus the existing `version`) with no second geocoding request
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-04 Change success fills the field, Save saves
- Given: change-mode modal with an existing city (field prefilled with it)
- When: the user activates the link and the lookup succeeds, then presses Save
- Then: the field now shows the located city (the prefilled one is replaced), the modal stays open until Save (the test waits 350 ms before pressing Save: a pointer press right after a fill is suppressed by the existing guard); after Save the modal closes, the new city is stored and the weather tiles refresh; pressing Cancel instead of Save keeps the old city
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-05 Busy state in the wizard
- Given: wizard step 1, geolocation call that has not answered yet
- When: the link has been activated
- Then: the link text is `Finding your location…` (no link look, `aria-disabled="true"`, still focused if it was); the field, Skip and Continue are disabled and Clear is hidden; Tab keeps focus on the link; Escape, a backdrop click and a second activation do nothing; the status node announces `Finding your location…`; when the lookup ends the controls return to their normal state
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-06 Busy state in the change modal
- Given: change-mode modal, geolocation call that has not answered yet
- When: the link has been activated
- Then: the field, Cancel and Save are disabled and Clear is hidden; Escape and the backdrop do not close the modal; the link shows `Finding your location…`
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-07 Permission denied
- Given: wizard step 1 (and, separately, the change modal), geolocation rejects with PERMISSION_DENIED; the field holds `Paris` typed by the user
- When: the user activates the link
- Then: the error slot shows `Couldn't get your location. Enter a city or skip.` (wizard) / `Couldn't get your location. Search for a city instead.` (change), the field still holds `Paris`, controls are enabled again, focus is on the link, and activating it again retries; the status node is empty (a fast refusal never leaves a stale "Finding your location…")
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-08 Permission prompt never answered
- Given: geolocation stub that never calls back (an unanswered permission prompt)
- When: the link is activated and 15 s pass (fake timers)
- Then: the error `Finding your location took too long.` + tail appears, controls are enabled, and a position that arrives later is ignored (field unchanged, no error flicker)
- Verified by: E2E `dg-62-use-my-location.mjs` (Playwright fake clock, installed after the dialog has been open for 300 ms; `page.clock` needs Playwright ≥ 1.45, the harness has ^1.49)

### AS-UL-09 Reverse lookup failures
- Given: geolocation succeeds
- When: Nominatim answers (a) an address with no city-like field and no county/state, (b) HTTP 429, (c) a network failure, (d) no response for 8 s, (e) a 200 `{"error": …}` body, (f) invalid JSON
- Then: the messages are respectively `Couldn't find a city for your location.`, `The location service isn't responding.`, `Couldn't look up your city. Check your connection.`, `Couldn't look up your city. Check your connection.`, `Couldn't find a city for your location.`, `The location service isn't responding.`, each followed by the surface tail; the field is unchanged and nothing is stored
- Verified by: E2E `dg-62-use-my-location.mjs` ((a), (b) and (d); the fake clock is installed after the dialog has been open for 300 ms, past the backdrop guard); unit tests for all six

### AS-UL-10 Name fallback
- Given: geolocation succeeds
- When: Nominatim returns an address with `county` and `state` only (no city, town, village, municipality)
- Then: the field is filled with the county name and its country; with only `state`, the state name
- Verified by: unit test of `reverseGeocodeCoordinates`

### AS-UL-11 No automatic request
- Given: first run and every change-mode entry
- When: the wizard or modal opens, the user types, skips, cancels or closes
- Then: `getCurrentPosition` is never called and no request goes to Nominatim until the link is activated
- Verified by: E2E `dg-62-use-my-location.mjs` (call counters)

### AS-UL-12 Nothing is stored before submit
- Given: a successful lookup has filled the field
- When: the user presses Skip (wizard), Cancel (change) or Escape, or reloads
- Then: no location is stored; the previous state (no city, or the old city) is unchanged
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-13 Network request content
- Given: a lookup in progress
- When: the request to Nominatim is observed
- Then: exactly one request goes to `https://nominatim.openstreetmap.org/reverse` with `lat=41.72&lon=44.83` (two decimals), `format=jsonv2`, `addressdetails=1`, `zoom=10`, `accept-language=en`, and the identifying `User-Agent`; before Save, no request other than the Nominatim one carries the position (after Save the Open-Meteo forecast request uses the stored rounded coordinates, as before)
- Verified by: E2E `dg-62-use-my-location.mjs` (route handler asserts the URL; the header too if the harness can observe it, otherwise the header is verified by the first implementation step (the spike) and a unit test of the request `init`)

### AS-UL-14 Rapid and repeated activation
- Given: wizard step 1 or the change modal; the geolocation stub answers after a controlled delay (longer than the second click)
- When: the user double-clicks the link or presses Enter then Space quickly
- Then: one `getCurrentPosition` call and at most one Nominatim request; after the attempt has finished, a new activation starts a fresh one (a second scenario: activate, wait for the fill, activate again)
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-15 Keyboard and focus
- Given: wizard step 1 and the change modal
- When: the user tabs through and activates the link with Enter and with Space
- Then: Tab order is link, field, Clear (when visible), then the footer buttons; the link shows the same focus ring as other modal controls; after success focus is in the field with the caret at the end; after an error focus is on the link; in the change modal initial focus stays in the field; the stacked change modal over the weather edit dialog behaves the same and returns focus as before when it closes
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-16 Real permission prompt (manual)
- Given: unpacked build, Chrome profile where the extension has no location permission yet
- When: the owner activates the link on the new tab page
- Then: Chrome shows its location prompt for the extension; Allow fills the city from the REAL Nominatim answer (HTTP 200 with the identifying `User-Agent`; the owner notes this in the ledger); Block shows the denied message and a later activation shows the message again without a hang
- Verified by: design review only (the permission prompt cannot be driven by the automated harness; the owner confirms when convenient; it is not a merge condition, a silent denial without a manifest permission becomes a follow-up run)

### AS-UL-17 Narrow and low windows
- Given: widths 500 and 320 px, and a window 600 px high
- When: wizard step 1 and the change modal are open (also in the busy and error states)
- Then: the description wraps without horizontal scroll; the link (a native button) wraps as a whole onto the next line when it does not fit, and `Finding your location…` fits at 320 px; the dialog fits the window or scrolls as it does today; the busy text and the error do not overlap the field or the footer; the extra description in the change modal does not break the suggestion popover placement rules covered by `dg-48`, `dg-49` and `15-city-modal-layout`
- Verified by: E2E `dg-62-use-my-location.mjs` plus the existing city-modal layout scenarios

### AS-UL-18 Accessibility of the new control
- Given: the link in idle, focused, busy and disabled-surroundings states
- When: inspected
- Then: accessible name equals its visible text; link text contrast (the description token, `--muted`) is at least 4.5:1 against the dialog surface in light and dark; the focus ring is visible with at least 3:1; the status node is the only live announcement and is visually hidden but exposed (after a success the field is read as well; that double reading is accepted); a name longer than the field scrolls in the field and the stored value is not truncated; the dialog height may change during the busy state only by whole text lines and the footer stays inside the window at 320×600
- Verified by: E2E `dg-62-use-my-location.mjs` (names, computed contrast) and design review

### AS-UL-19 Teardown during a lookup
- Given: a lookup is running (not reachable through the UI because Escape, backdrop, Skip and Cancel are blocked while busy; reachable only by code paths that tear the form down)
- When: the form is torn down (`hideCityModal`, wizard teardown) before the lookup ends
- Then: the late result changes nothing (no field fill, no error, no stored data); `locating` and `weatherBusy` are released, so a following open of the modal starts idle
- Verified by: source assertions in `test/newtabSource.test.js` (the flow checks `weatherFormGeneration` after each `await`; both teardowns release `locating`/`weatherBusy`); no E2E (unreachable)

### AS-UL-20 Documents and manifest agree
- Given: the repository after the change
- When: tests run
- Then: `manifest.json` lists the Nominatim host; `docs/privacy.md` and `store/privacy-disclosure.md` describe the location use and no longer say that no geolocation is used
- Verified by: unit tests (`test/manifest.test.js` and a privacy-text assertion)

### AS-UL-21 Unexpected failure never locks the dialog
- Given: wizard step 1 and the change modal; the geolocation stub throws synchronously (and, separately, rejects with a non-standard error)
- When: the user activates the link
- Then: `Couldn't get your location.` + tail appears, `locating` and `weatherBusy` are released, the field, footer and Escape work again, focus is on the link, the status node is empty
- Verified by: unit test of `getBrowserPosition` (sync throw → `unavailable`); source assertion that the flow runs in `try/finally`; E2E `dg-62-use-my-location.mjs` (stub that throws)

### AS-UL-22 Ordinary city request keeps its busy contract
- Given: wizard step 1 or the change modal with a typed city
- When: the user presses Continue/Save and the request runs
- Then: the link is disabled and not focusable like the other controls, Tab/Shift+Tab leave focus where the existing busy contract puts it, and nothing about the locating state is visible
- Verified by: E2E `dg-62-use-my-location.mjs` plus the unchanged `13-city-modal` busy scenario

### AS-UL-23 Low windows keep the buttons reachable
- Given: widths 320, 360 and 400 px (400 only in the pairs `dg-48` already has), heights from the `dg-48` pairs and 50 px below the new measured thresholds (wizard step 1 and the change modal)
- When: the dialog is open at rest, then the field is focused
- Then: down to the new measured threshold the footer buttons are visible without scrolling; below it the dialog scrolls and the buttons are reachable by scrolling and by Tab; the threshold values are recorded in `docs/city-modal-low-window.md` and the shift against the old thresholds is at most the height of the added description
- Verified by: E2E `dg-48-city-modal-low-window.mjs` (pairs updated intentionally) and `dg-62-use-my-location.mjs`

## Review focus

- **Scenarios/states:** the busy lock (what exactly is disabled, that the link keeps focus, that Escape and backdrop are ignored for up to 23 s), the stale-result rule, error recovery (retry works), overwriting a prefilled city, and the unanswered permission prompt.
- **Visual/layout:** the low-window thresholds that move because of the added description line (AS-UL-23), the new description line in the change modal (height change, popover placement, low window), the inline link look in light and dark, wrapping at 320 px, the busy text swap changing the height by whole lines only.
- **Accessibility/texts:** link name equals visible text, status announcements, the five error messages with their per-surface tails, contrast and focus ring.
- **Privacy:** what leaves the browser, when, and that the documents say so.

## Accepted exceptions

- The link is inline text inside a sentence, so the 24 px minimum target size of WCAG 2.2 (2.5.8) does not apply to it (inline exception).
- While locating, Escape and backdrop do nothing for up to 23 s; this is the same contract as a running city request, and there is no Cancel for the lookup.
- The grid is not re-rendered during a lookup.
- After Block, Chrome remembers the denial for the extension; the denied message does not explain how to re-enable the permission (Chrome settings). Accepted for this phase.
- OpenStreetMap attribution is given in `docs/privacy.md` and the store text, not in the UI, because only a city name from the response is used.
- A position that arrives after the 15 s deadline (a late "Allow") fills nothing; the next activation then answers at once from the browser.
- Low windows (decision, owner can override): the added description line makes the wizard about one text line taller and the change modal about two lines plus a 12 px margin taller, so the idle-visible-buttons thresholds of `dg-48` (`docs/city-modal-low-window.md`) move by that amount. This is accepted as the price of the feature: the implementer MEASURES the new minimum heights, updates the `dg-48` pairs and the numbers in `docs/city-modal-low-window.md` deliberately, and keeps the existing contract that below the threshold the dialog scrolls and the buttons stay reachable (AS-UL-17). If a threshold moves by more than the height of the added description (change modal: its text lines plus the 12 px margin; wizard: one extra text line), stop and ask the owner.
- The Chrome Web Store dashboard changes are made by the owner at publication, not in this PR.

## Process

Full UI pipeline. Branches: quiet-tab `docs/use-my-location-spec` (spec), `feat/use-my-location` (implementation); notes `docs/use-my-location-spec-plan` (plan, kickoff, run file). New E2E: `dg-62-use-my-location.mjs`.

Existing E2E and helpers that may need an intentional update (each change with a recorded reason, never a loosened check):

- Text of the step 1 / change-mode description: `13-city-modal.mjs` (line 164: the change modal had no description; line 540: wizard text), `dg-58-modal-overlay.mjs:36`, `.private/e2e/lib/onboardingWizard.mjs:16` (`WIZARD_STEP1_DESCRIPTION`), `test/newtabSource.test.js` (the step 1 sentence).
- Tab order (the link is now the first focusable target): `13-city-modal`, `dg-15-city-first-run`, `dg-50-placeholder-contrast`, `dg-52`, `dg-53`, `dg-56-first-run-empty-desk`, `dg-60-onboarding-wizard`, `15-city-modal-layout`.
- Geometry and low windows (AS-UL-23): `dg-45`, `dg-47`, `dg-48`, `dg-49`, `dg-52`, `dg-53`, `dg-58`, `15-city-modal-layout`, `.private/e2e/lib/cityModalSweep.mjs`, and in general any scenario that measures modal height thresholds through `cityModalSweep` or `setViewportSize`.
- `modalInfo` in `.private/e2e/lib/harness.mjs` keeps the link out of `buttons` and returns it as a separate `link` field, so the button checks of `13-city-modal` (`:364` incl. the 24×24 check, `:590`, `:647`) stay. The busy contract `AS-14` of `13-city-modal` is unchanged (the link is disabled during an ordinary request).
- `.private/e2e/lib/harness.mjs` routes Nominatim to `abort` by default, so a forgotten mock never reaches the real service.
- Unit pins: `test/manifest.test.js` (exact host list); the flow pins of AS-UL-19/21 (`finally`, `cancelAnimationFrame`, both teardown branches).
- Docs that become false: listed in § Privacy, permissions, store, plus `docs/city-modal-low-window.md:30` and the module table of `docs/architecture.md`.

## Non-goals

- IP-based geolocation, or a location request on open.
- Changing the stored location shape, the weather requests, or the city suggestion list.
- Auto-advancing the wizard or auto-closing the change modal after a lookup.
- Reverse geocoding through Open-Meteo (it has no reverse endpoint) and any other provider.
- A cancel control for a running lookup.
- The hint tile and the first-run behaviour outside wizard step 1.
- Chrome Web Store dashboard edits (owner task at publication).
