# Use my location: fill the city from the browser's location

## Status

`draft`

Decision: **do it**. Owner request 2026-10-08 (pipeline stage 0, run #20 / `dg-62`): a way to fill the city field from the device location, so the user does not have to type a city on first run or when changing the city.

Owner decisions (2026-10-08, brainstorming):

- Placement: an inline link inside the muted subtitle (not a separate full-width button).
- Behaviour: **fill, not save**. A successful lookup fills the city field; the user still presses **Continue** (wizard) or **Save** (change). No auto-advance, no auto-close.
- Surfaces: onboarding wizard step 1 and the change-mode city modal (opened from the "Set a city" hint tile, the weather edit dialog's city field, and any other change-mode entry).
- No location request on open. Nothing happens until the user activates the link.
- Reverse geocoding: Nominatim (OpenStreetMap), because Open-Meteo geocoding is forward-search only.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). The stored location keeps its shape (`{ name, country, latitude, longitude }`).

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
- Change-mode city modal gets a new description between the title and the form: `Search for a city or use your location.` with the same link. It uses the same muted style as the wizard description (`.city-modal__description`).
- The link is a native `<button type="button" class="city-location-link" data-weather-action="use-location">` inside the paragraph, styled as an inline link (underlined, inherits the description color and size, `font-weight` 600). Its visible text is `use your location` and that text is its accessible name (no `aria-label`). It sits before the form in DOM order, so Tab order is: link, field, Clear (when visible), footer buttons.
- The link is always present (also when `navigator.geolocation` is missing); a missing API is reported through the error slot on activation.

### Flow (one function in `newtab.js`, `useMyLocation(variant)`)

1. Ignore the activation if `weatherBusy` is true or `weatherService` is missing.
2. Start: `weatherBusy = true`; cancel the suggestion debounce and hide the list (as `changeCity` does); clear `cityModalError`; take a new token from the request guard (below); update the UI through `syncCityModal`/`syncOnboardingWizardUi`. The grid is not re-rendered.
3. Position: `getBrowserPosition()` with a total deadline of 15 s. The deadline covers the time the permission prompt is open (the browser's own `timeout` option starts only after permission is granted, so the deadline is enforced by the caller with a race and `PositionError` code `timeout`).
4. Round both coordinates to 2 decimals (about 1 km, enough for a city; the rounded values are what is sent to Nominatim and what is stored).
5. Reverse geocode with `reverseGeocodeCoordinates(lat, lon, { signal })`, aborted after 8 s.
6. After each `await`, drop the result unless the token is still current (the form was disposed, the page navigated or a newer request started). A dropped result changes nothing, shows nothing, and does not reset `weatherBusy` that a newer request owns.
7. Success: `activeCityForm.choose({ name, country, latitude, longitude, label: cityDisplayLabel({ name, country }) })`, move focus to the field with the caret at the end, announce `Location found: <label>` in the link's status node.
8. Failure: set `cityModalError` from `locationErrorMessage(variant, failure)`, leave the field text and any earlier chosen city untouched, return focus to the link, announce nothing extra (the error slot is `role="alert"`).
9. Always (for a current token): `weatherBusy = false`, restore the link text, sync the UI.

Nothing is persisted by this flow. `weatherService.selectLocation` / `setCity` run only on submit, through the existing handlers.

### Busy state

- `weatherBusy` is reused, so every existing guard (Skip, Escape, backdrop, Cancel, Save, Clear, field, suggestion keys) behaves as during a city request. The link is the exception: it stays focusable so focus is not lost; it gets `aria-disabled="true"`, its text becomes `Finding your location…` (no underline, not a link look), and activation is ignored. `syncCityModal` excludes `use-location` from its `disabled` loop (like `select-city`).
- A visually hidden status node (`role="status"`) inside the description announces `Finding your location…` at the start and the success message at the end; the visible sentence itself is not a live region.
- Worst case the form is locked for 15 s + 8 s = 23 s; Escape and backdrop do nothing in that window (same contract as a running city request).

### Request guard

A small pure helper (`createLocationRequestGuard()` in `src/cityLocation.js`): `begin()` returns a new token and invalidates older ones; `isCurrent(token)`; `cancel()` invalidates without starting. `hideCityModal` and the wizard teardown call `cancel()`.

### Reverse geocoding (Nominatim)

- Endpoint `https://nominatim.openstreetmap.org/reverse`, parameters `lat`, `lon` (rounded), `format=jsonv2`, `addressdetails=1`, `zoom=10`, `accept-language=en`.
- Identification per the OSM usage policy: the request carries `User-Agent: QuietTab (+https://github.com/undevy-org/quiet-tab)` (a constant, no version, no personal data). **Open question closed by the first implementation task (Task 1 spike):** whether Chrome lets an extension page set `User-Agent` on `fetch`. If it cannot, the executor stops and asks the owner (no silent fallback to an unidentified request).
- Parse defensively (the response is data): `address.city`, then `town`, `village`, `municipality`, then `county`, then `state`, first non-empty string wins as `name`; `country` from `address.country` (empty string when absent). If no name is found: `WeatherApiError` kind `notFound`. HTTP errors (including 429) are kind `http`; a rejected fetch is `network`; our own abort is `timeout`. `display_name` and any other field are ignored.
- Result shape equals `geocodeCity`: `{ name, country, latitude, longitude }` where the coordinates are the caller's rounded input, not Nominatim's centroid.
- Rate: one request per activation; the busy lock makes a second one impossible while the first runs (Nominatim policy: at most 1 request/s).

### Error copy

Each message is `<reason> <tail>`. Tail by surface: wizard `Enter a city or skip.`; change `Search for a city instead.`

| Failure | Reason |
|---------|--------|
| Position denied, unavailable or API missing | `Couldn't get your location.` |
| Position deadline (15 s) | `Finding your location took too long.` |
| Reverse found no city name | `Couldn't find a city for your location.` |
| Reverse network failure or 8 s abort | `Couldn't look up your city. Check your connection.` |
| Reverse HTTP error (incl. 429) | `The location service isn't responding.` |

The messages go through the existing error slot (`role="alert"`, 0 height at rest). The existing slot rules apply (cleared by the next input, submit or locate).

### Privacy, permissions, store

- `manifest.json`: add `https://nominatim.openstreetmap.org/*` to `host_permissions`. No `geolocation` permission is declared: Chrome prompts per origin for an extension page. **Expected, to be confirmed by the owner on an unpacked build before the final gate (AS-UL-16):** the prompt appears on the new tab page. If Chrome denies silently without the manifest permission, stop and ask the owner: declaring `geolocation` adds an install-time warning and is a product decision.
- `docs/privacy.md` and `store/privacy-disclosure.md`: browser location used only when the user activates the link; the rounded coordinates are sent to Nominatim once per activation to get a city name; only the chosen city (name, country, rounded coordinates) is stored, as before; weather requests still go to Open-Meteo with the stored coordinates; no location is sold or used for advertising; OpenStreetMap contributors / Nominatim named as the data source. `store/privacy-disclosure.md` currently states that no geolocation is used: that statement is replaced.
- Chrome Web Store dashboard (owner task at publication, not part of the PR): update the Privacy practices tab (Location data), the permission justification for the new host, and the privacy policy URL text. Listed in the backlog by the run; not a merge condition.

### Architecture

- `src/browserGeolocation.js` (new, no DOM, no storage): `getBrowserPosition({ timeoutMs = 15000, geolocation = globalThis.navigator?.geolocation })` → `{ latitude, longitude }`, rejects with `PositionError` whose `code` is `denied | unavailable | timeout | unsupported`. Enforces the deadline itself (race), so an open permission prompt cannot hang it.
- `src/cityLocation.js` (new, pure): `roundCoordinate`, `locationErrorMessage(variant, failure)`, the copy constants, `createLocationRequestGuard`.
- `src/weatherApi.js`: `reverseGeocodeCoordinates(lat, lon, { fetchImpl, signal })`; the private `request()` gains an optional `init` argument (headers, signal) while existing callers keep passing only the URL.
- `src/newtab.js`: description builders (`createCityLocationDescription(variant)`), `useMyLocation(variant)`, click wiring in the wizard and city modal listeners, the `syncCityModal` exclusion. No new store, service or UI-state module: nothing is persisted and the busy state already lives in `weatherBusy`.
- CSS: `.city-location-link`, `.city-modal__description` in `src/surfaces.css` / `src/controls.css` using existing tokens only.

## Acceptance scenarios

Scenarios marked E2E run in `dg-62-use-my-location.mjs` with `navigator.geolocation` stubbed through `addInitScript` and Nominatim routed (never the real service).

### AS-UL-01 Wizard step 1 shows the link
- Given: fresh profile, no city, wizard step 1 open
- When: the user looks at the step
- Then: the description reads `Enter a city, use your location, or skip for now.` and `use your location` is a button with that exact accessible name, underlined, in the muted description color; the field, Skip and Continue are unchanged; no geolocation call has happened
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-02 Change modal shows the link
- Given: city set (or not), the change-mode modal opened from the Settings flow, the "Set a city" hint tile and the weather edit dialog's city field
- When: the modal opens
- Then: between the title and the field is the description `Search for a city or use your location.` with the same link; initial focus is still on the field; no geolocation call has happened
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-03 Wizard success fills the field, Continue saves
- Given: wizard step 1, geolocation returns (41.7151, 44.8271), Nominatim returns a city address (Tbilisi, Georgia)
- When: the user activates the link, then presses Continue
- Then: after the lookup the field shows `Tbilisi, Georgia`, focus is in the field with the caret at the end, Continue is enabled, `quietTabWeatherLocation` is NOT yet stored; after Continue the wizard goes to step 2 and the stored location is `{ name: "Tbilisi", country: "Georgia", latitude: 41.72, longitude: 44.83 }` with no second geocoding request
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-04 Change success fills the field, Save saves
- Given: change-mode modal with an existing city (field prefilled with it)
- When: the user activates the link and the lookup succeeds, then presses Save
- Then: the field now shows the located city (the prefilled one is replaced), the modal stays open until Save; after Save the modal closes, the new city is stored and the weather tiles refresh; pressing Cancel instead of Save keeps the old city
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-05 Busy state in the wizard
- Given: wizard step 1, geolocation call that has not answered yet
- When: the link has been activated
- Then: the link text is `Finding your location…` (no link look, `aria-disabled="true"`, still focused if it was); the field, Clear, Skip and Continue are disabled; Escape, a backdrop click and a second activation do nothing; the status node announces `Finding your location…`; when the lookup ends the controls return to their normal state
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-06 Busy state in the change modal
- Given: change-mode modal, geolocation call that has not answered yet
- When: the link has been activated
- Then: the field, Clear, Cancel and Save are disabled; Escape and the backdrop do not close the modal; the link shows `Finding your location…`
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-07 Permission denied
- Given: wizard step 1 (and, separately, the change modal), geolocation rejects with PERMISSION_DENIED; the field holds `Paris` typed by the user
- When: the user activates the link
- Then: the error slot shows `Couldn't get your location. Enter a city or skip.` (wizard) / `Couldn't get your location. Search for a city instead.` (change), the field still holds `Paris`, controls are enabled again, focus is on the link, and activating it again retries
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-08 Permission prompt never answered
- Given: geolocation stub that never calls back (an unanswered permission prompt)
- When: the link is activated and 15 s pass (fake timers)
- Then: the error `Finding your location took too long.` + tail appears, controls are enabled, and a position that arrives later is ignored (field unchanged, no error flicker)
- Verified by: E2E `dg-62-use-my-location.mjs` (Playwright fake clock)

### AS-UL-09 Reverse lookup failures
- Given: geolocation succeeds
- When: Nominatim answers (a) an address with no city-like field and no county/state, (b) HTTP 429, (c) a network failure, (d) no response for 8 s
- Then: the messages are respectively `Couldn't find a city for your location.`, `The location service isn't responding.`, `Couldn't look up your city. Check your connection.`, `Couldn't look up your city. Check your connection.`, each followed by the surface tail; the field is unchanged and nothing is stored
- Verified by: E2E `dg-62-use-my-location.mjs` ((a), (b) and (d)); unit tests for the mapping of all four

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
- Then: exactly one request goes to `https://nominatim.openstreetmap.org/reverse` with `lat=41.72&lon=44.83` (two decimals), `format=jsonv2`, `addressdetails=1`, `zoom=10`, `accept-language=en`, and the identifying `User-Agent`; nothing else carries the position
- Verified by: E2E `dg-62-use-my-location.mjs` (route handler asserts the URL and headers)

### AS-UL-14 Rapid and repeated activation
- Given: wizard step 1 or the change modal
- When: the user double-clicks the link or presses Enter then Space quickly
- Then: one `getCurrentPosition` call and at most one Nominatim request; after a finished attempt a new activation starts a fresh one
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-15 Keyboard and focus
- Given: wizard step 1 and the change modal
- When: the user tabs through and activates the link with Enter and with Space
- Then: Tab order is link, field, Clear (when visible), then the footer buttons; the link shows the same focus ring as other modal controls; after success focus is in the field with the caret at the end; after an error focus is on the link; in the change modal initial focus stays in the field; the stacked change modal over the weather edit dialog behaves the same and returns focus as before when it closes
- Verified by: E2E `dg-62-use-my-location.mjs`

### AS-UL-16 Real permission prompt (manual)
- Given: unpacked build, Chrome profile where the extension has no location permission yet
- When: the owner activates the link on the new tab page
- Then: Chrome shows its location prompt for the extension; Allow fills the city; Block shows the denied message and a later activation shows the message again without a hang
- Verified by: design review only (the permission prompt cannot be driven by the automated harness; the owner confirms before the final gate)

### AS-UL-17 Narrow and low windows
- Given: widths 500 and 320 px, and a window 600 px high
- When: wizard step 1 and the change modal are open (also in the busy and error states)
- Then: the description wraps without horizontal scroll; the link can wrap across lines; the dialog fits the window or scrolls as it does today; the busy text and the error do not overlap the field or the footer; the extra description in the change modal does not break the suggestion popover placement rules covered by `dg-48`, `dg-49` and `15-city-modal-layout`
- Verified by: E2E `dg-62-use-my-location.mjs` plus the existing city-modal layout scenarios

### AS-UL-18 Accessibility of the new control
- Given: the link in idle, focused, busy and disabled-surroundings states
- When: inspected
- Then: accessible name equals its visible text; link text contrast is at least 4.5:1 against the dialog surface in light and dark; the focus ring is visible with at least 3:1; busy text is not announced twice; the status node is visually hidden but exposed
- Verified by: E2E `dg-62-use-my-location.mjs` (names, computed contrast) and design review

### AS-UL-19 Stale result is dropped
- Given: a lookup is running
- When: the form is torn down before the lookup ends (the guard is cancelled)
- Then: the late result changes nothing: no field fill, no error, no stored data, and a following open of the modal starts idle
- Verified by: unit test of `createLocationRequestGuard`; source assertion in `test/newtabSource.test.js` that `hideCityModal` and the wizard teardown cancel the guard

### AS-UL-20 Documents and manifest agree
- Given: the repository after the change
- When: tests run
- Then: `manifest.json` lists the Nominatim host; `docs/privacy.md` and `store/privacy-disclosure.md` describe the location use and no longer say that no geolocation is used
- Verified by: unit tests (`test/manifest.test.js` and a privacy-text assertion)

## Review focus

- **Scenarios/states:** the busy lock (what exactly is disabled, that the link keeps focus, that Escape and backdrop are ignored for up to 23 s), the stale-result rule, error recovery (retry works), overwriting a prefilled city, and the unanswered permission prompt.
- **Visual/layout:** the new description line in the change modal (height change, popover placement, low window), the inline link look in light and dark, wrapping at 320 px, the busy text swap not shifting the layout.
- **Accessibility/texts:** link name equals visible text, status announcements, the five error messages with their per-surface tails, contrast and focus ring.
- **Privacy:** what leaves the browser, when, and that the documents say so.

## Accepted exceptions

- The link is inline text inside a sentence, so the 24 px minimum target size of WCAG 2.2 (2.5.8) does not apply to it (inline exception).
- While locating, Escape and backdrop do nothing for up to 23 s; this is the same contract as a running city request, and there is no Cancel for the lookup.
- The grid is not re-rendered during a lookup and `aria-busy` on the change dialog follows `weatherBusy`.
- The Chrome Web Store dashboard changes are made by the owner at publication, not in this PR.

## Process

Full UI pipeline. Branches: quiet-tab `docs/use-my-location-spec` (spec), `feat/use-my-location` (implementation); notes `docs/use-my-location-spec-plan` (plan, kickoff, run files). E2E: new `dg-62-use-my-location.mjs`; existing scenarios that may need an intentional update because the change modal gains a description line: `13-city-modal`, `15-city-modal-layout`, `dg-15-city-first-run`, `dg-45`, `dg-47`, `dg-48`, `dg-49`, `dg-52`, `dg-53`, `dg-60-onboarding-wizard`.

## Non-goals

- IP-based geolocation, or a location request on open.
- Changing the stored location shape, the weather requests, or the city suggestion list.
- Auto-advancing the wizard or auto-closing the change modal after a lookup.
- Reverse geocoding through Open-Meteo (it has no reverse endpoint) and any other provider.
- A cancel control for a running lookup.
- The hint tile and the first-run behaviour outside wizard step 1.
- Chrome Web Store dashboard edits (owner task at publication).
