# Weather tile: retry from the tile itself

## Status

`draft` (stage 0, not yet through the spec gate)

Decision: **do it, differently from the backlog wording**. Backlog item 7 ("retry on the weather tile; large; new state in `weatherUiState.js` and `weatherTiles.js`") was checked against the code and measured. It is feasible without a new architecture: the retry action already exists in the service (`weatherService.initialize()` reads the location, serves a fresh cache or fetches in parallel, falls back to a stale cache) and the page already re-renders from one `weatherResult`. What is missing is only a control, a state for it and a guard. "Large" is therefore wrong for the code and right for the surface (a tile that is read-only today becomes a control in two states, and every state needs names, focus, motion and contrast). The part of the intake that is **not** done is listed under Non-goals (timers, backoff, `online` events, notifications, refreshing a *fresh* tile).

## Intake log

| Date | Raw note (backlog item 7) | Verdict | Reference |
|------|---------------------------|---------|-----------|
| 2026-10-05 | "Retry on the weather tile." After a failed forecast the tile shows `—` and the tooltip says "Check your connection and try again", but nothing can be tried; only a page reload. | `confirmed` | Measurement below; AS-WR-01..14 |
| 2026-10-05 | "New state in `weatherUiState.js` and `weatherTiles.js`." | `confirmed, small` | A retry sub-state (in flight, earliest next attempt) and two new model fields. No change to `weatherService.js`, `weatherStore.js`, `weatherApi.js`. |
| 2026-10-05 | "Out of scope of `network-error.md` and `city-error-ux.md`." | `kept` | Error texts of both specs stay as they are; the city modal and the shared network-error state are not touched. |

## Measurements (current behaviour, `main` at `c5dc890`)

Chromium via Playwright (`.private/e2e/lib/harness.mjs`), unpacked extension, stored city Tbilisi, Open-Meteo aborted (`route.abort("failed")`) unless stated; probes in a scratchpad, not committed (the scenario of this run reproduces them).

| Case | What the user sees and what is in the DOM |
|------|--------------------------------------------|
| Boot, forecast unreachable, no cache | Four tiles, all in the error state: a `div` with `role="group"`, `tabindex="0"`, `aria-label` = metric name ("Temperature"), the only visible text is `—` next to the metric glyph, no tone. Sizes 72x72 (1x1), 152x72 (2x1), 152x152 (2x2, with the city name line). `cursor: auto`. The `sr-only` description and the tooltip read `Weather unavailable: Can't reach the weather service. Check your connection and try again.` |
| Click, Enter, Space on an error tile | Nothing: **0 requests** (counted on the context). The tooltip promises "try again" and gives no way to. The only way is a reload of the page. |
| Requests per attempt | Exactly two: forecast and air quality, in parallel (`fetchAndCache`). |
| Stale (cache 2 h old, forecast unreachable) | The cached values, dashed border (`data-stale`), no explanation on the tile; the description starts `Couldn't refresh - showing saved data.` Also no control. |
| Loading | `…`, `aria-busy="true"`, description `Loading weather…` (only at boot, a city change, or while the first city loads). |
| Edit mode | Every metric tile is a `button` named `Edit <metric>`; the error text is still the description. |
| Boot request that never answers (route that never fulfils, 18 s) | Tiles stay `…` with `aria-busy="true"` **forever**: `startWeather` has no timeout (the city request has one, 15 s). Not part of this run; recorded in the backlog. |
| Tab order | One stop per weather tile (they are `tabindex="0"` groups), in DOM order, unchanged by the state. |
| Hint tile (no city) | A `button`, opens the city modal. Not an error state; untouched. |

## What is already done, what is not

- Done and kept: classified calm error texts (`network-error.md`), stale fallback, the 30 min cache rule, parallel forecast + air quality, the 15 s guard and generation counter used by the city change in `newtab.js`.
- Not done anywhere: a way to repeat a failed load; a state for "repeating"; protection against a storm of repeated presses (there is none to protect today because there is no action); feedback when a repeat fails; a timeout for a repeat.

## Default decisions (owner can override)

1. **The whole tile is the retry control, only in the error and stale states, only in normal mode.** In those states the tile is a native `<button type="button" class="weather-tile weather-tile--retry" data-favorite-action="retry-weather">` instead of the `div role="group"`. It keeps `data-widget-id`, the grid placement, the tooltip trigger and `aria-describedby`. Click, Enter and Space activate it (native button, so the key handling is the browser's). *Reasons:* the target is the full tile (56x56 px at the smallest cell, far above 24 px, WCAG 2.5.8); no nested interactive elements; no conflict with the tooltip (hover and `:focus-visible` still show the same description), with drag (drag exists only in edit mode) or with "tap = edit" (edit mode renders its own `Edit <metric>` button and offers no retry). *Rejected:* a small refresh button inside the tile (a 14 px target on a 56 px tile, a second tab stop per tile, nested in a tooltip trigger and, at 2x1, crowded by the value); a toolbar or Settings entry (the failure is on the tile, the action belongs there).
2. **Visible affordance: a refresh glyph after the value, the `—` stays.** `.weather-tile__values` gets one more child, `span.weather-tile__retry` (`aria-hidden="true"`, a vendored Lucide `refresh-cw` in `icons.js` under the key `refresh`, 14 px at cell 72 and 64, 12 px at cell 56 and 16 px in a 2-high tile, `stroke` = `currentColor` = `--text`, which already holds contrast on every tile background). The value `—` stays (so existing `—` checks and the "no value" meaning stay). Hover: `border-color: var(--border-control)` (the dashed stale border stays dashed); cursor `pointer`; focus ring is the existing `.weather-tile:focus-visible` (locked by `focusTokens.test.js`). No new token; colors and radii unchanged.
3. **One attempt for all tiles; no new service API.** The click calls `weatherService.initialize()` exactly like the boot does. Consequences, by design: one pair of requests per attempt for the stored city, no matter how many tiles are in error; a cache that another tab refreshed in the meantime (fresh, under 30 min) is served with **no request** (free cross-tab de-duplication, no lock); a stale cache on failure stays stale; the 30 min rule, the parallel fetch and the cache version are untouched. There is no "force refresh" that bypasses a fresh cache: a fresh tile is not a retry state (Non-goals).
4. **State lives in `weatherUiState.js`.** `retry: { inFlight: boolean, availableAt: number }` in the initial state. Pure functions (names suggested): `WEATHER_RETRY_COOLDOWN_MS = 3000`, `startWeatherRetry(state, now)` (returns the same state object when an attempt is in flight or `now < availableAt`; otherwise `inFlight: true`), `finishWeatherRetry(state, now, ok)` (`inFlight: false`, `availableAt = ok ? 0 : now + 3000`), `resetWeatherRetry(state)`, `weatherRetryPhase(state, now)` returning `"ready" | "retrying" | "cooldown"`, and `weatherRetryOutcome(result)` returning `"updated"` for `ready`, `"gone"` for `no-location` (the city was removed elsewhere; the hint tile appears) and `{ failed: result.error }` for `error` and `stale`. A clock that moved backwards (`availableAt - now > 3000`) counts as ready. The city modal state is untouched (`openCityModal` and `closeCityModal` keep `retry`).
5. **Rate limit = in-flight guard + 3 s cooldown after a failure.** While an attempt runs, presses are ignored (the tile is `aria-disabled="true"`, not `disabled`, so focus stays). After a failed attempt the tiles stay `aria-disabled="true"` with the glyph dimmed for 3 s from the moment the attempt ended, then a single re-render re-enables them. No backoff, no growth, no counter: the cap is "at most one pair of requests per 3 s plus the attempt's own duration", the same as a held Enter key. A success needs no cooldown (the tiles stop being retry tiles). *Reason for from-the-end:* a slow failure must not also pay a second penalty.
6. **A repeat has the same 15 s guard as a city change.** `withTimeout` (the constant `CITY_REQUEST_TIMEOUT_MS`, 15000; the name may become `REQUEST_TIMEOUT_MS`) wraps the attempt; a request slower than that is a failure (`kind: "timeout"`, the existing text) and its late result is ignored by a token (`weatherRetryToken`). *Reason:* `initialize()` itself has no timeout, and without one a hung request would block every later press for good.
7. **Races (the same generation rule as boot and city change).** A successful city change bumps `weatherGeneration` and `weatherRetryToken` and resets the retry state: a late retry result is dropped and cannot overwrite the new city. A failed city change leaves both valid: the retry result applies to the stored city. An attempt never blocks a city change and a city change in flight shows the existing loading state (no retry tile exists then). A retry result for a city that is no longer the stored one cannot happen because `initialize()` reads the stored location at its start and the generation guard drops everything older.
8. **Tile model.** `describeWeatherMetric({ metricKey, result, size, retry })` gets an optional `retry` (`"ready"` default, `"retrying"`, `"cooldown"`) and returns two more fields: `retry` (`null` unless the status is `error` or `stale`; otherwise the phase) and, when retrying, `busy: true`. While retrying: an error tile shows `…` as the primary text (a non-motion cue that also holds under reduced motion), a stale tile keeps its values; both set the description (below). Everything else in the model is unchanged, so every current test of `describeWeatherMetric` stays green.
9. **Texts (the complete list of new strings).**

   | Where | Text | Shown in |
   |-------|------|----------|
   | Accessible name of a retry tile | `Retry <Metric>` (`Retry Temperature`, `Retry Precipitation`, `Retry Air quality`, `Retry UV index`) | error and stale, normal mode, in every phase |
   | Description while an attempt runs (error) | `Trying again…` | `aria-describedby`, tooltip |
   | Description while an attempt runs (stale) | `Trying again… ` followed by the stale values sentence without the stale prefix (`Currently 21°. Today at 15:00 ...`) | same |
   | Page status line after a failed attempt | the existing user-safe text of the result (`Can't reach the weather service. Check your connection and try again.`, the timeout text, the `http`/`unknown` texts) | `#desktop-status` (`role="alert"`, clears after 8 s or at the next action) |
   | Polite announcement after success from error or stale | `Weather updated` | `#desktop-live` |

   The error and stale descriptions are unchanged. No new visible text on the tile (the glyph and `…` only); no technical words. The `…` character is the one already used by the loading state.
10. **Feedback.** Success: the tiles re-render with values, the control is gone, `announce("Weather updated")`. Failure: the tiles re-render in their previous state, the status line shows the result's text once per attempt (`role="alert"` slot, set after the re-render; a second failure re-sets it, so it is announced again). Pressing during the cooldown does nothing visible beyond the already dimmed glyph (no request, no status). The failure text is `result.error` only; the code never echoes `error.message`.
11. **Focus.** The existing `focusedWidgetId`/`restoreFocus` pair in `renderDesktop` returns focus to the tile with the same `data-widget-id` after each re-render (start, finish, cooldown end), tooltip suppressed during that focus. The tile that had focus when the attempt started has focus when it ends, whether it is still a button (failure) or a `div role="group" tabindex="0"` again (success). Nothing else moves focus. The tooltip is hidden by every render (`hideTooltip` at the top of `renderDesktop`, existing) and comes back on the next pointer enter or focus; recorded under Accepted exceptions.
12. **Edit mode and modals.** In edit mode the tile is the `Edit <metric>` button exactly as today; no glyph, no retry, `data-retry` absent. An attempt started in normal mode keeps running when edit mode is turned on; the result renders into whichever mode is current. Dialogs and the city modal make `#favorites` inert (existing): no retry while one is open; an attempt in flight finishes in the background.
13. **Location read failure is retryable too.** The `error` result with no location (the stored city could not be read at boot, `weatherLocationError`) also gets the retry tiles; the click re-reads the location through `initialize()`. On any non-failed outcome `weatherLocationError` is cleared and `weatherLocation` is set from the result (the same assignments a successful city change makes).
14. **No persistence and no storage change.** No new key, no field, no schema change, no migration. A retry writes only what `initialize()` already writes on success (the cache, `chrome.storage.local`). Nothing is written on failure.
15. **No viewport rule, no media query for the state.** Geometry is the existing tile geometry; the glyph size follows `:root[data-cell]` like the tile type does.

## Scope

- `src/icons.js`: the `refresh` icon. `src/weatherUiState.js`: decision 4. `src/weatherTiles.js`: decision 8, 9. `src/newtab.js`: `createWeatherMetricTile` (button variant, glyph, `data-retry`, `aria-busy`, name, `aria-disabled`), the `retry-weather` branch of the click handler, a `retryWeather()` function (guard, `withTimeout`, token, outcome, render, status, announce, cooldown re-render), the retry reset in `changeCity`'s success path, `weatherLocationError` handling (decision 13). `src/newtab.css`: the retry tile, hover, glyph sizes, the spin animation, `prefers-reduced-motion`, forced colors. `weatherService.js`, `weatherStore.js`, `weatherApi.js`, `widgets*`, the city modal, `newtab.html`: no change.
- Unit: `test/weatherUiState.test.js` (the retry machine), `test/weatherTiles.test.js` (retry fields; the old cases unchanged), `test/weatherService.test.js` (characterization: a failed `initialize` followed by a successful one returns `ready` and writes the cache once; a fresh cache written meanwhile gives `ready` with no fetch; a stale cache stays stale on failure and is not rewritten; a rejecting location store then a working one), `test/icons.test.js` (the new key), `test/newtabSource.test.js` and `test/weatherSource.test.js` (source pins: `data-favorite-action="retry-weather"`, `startWeatherRetry` guard before the call, `withTimeout` and the token, no `error.message`, `textContent` only).
- E2E: new `dg-54-weather-tile-retry.mjs` (the last number is `dg-53`); a small shared helper file for the net control and request counting. Existing scenarios that assert the error or stale tile as a non-button (`10-weather-grid-states` AS-10/AS-9, `dg-45` group 4/5 tile texts, `dg-23-a11y-names`, `dg-32-focus-order`, `dg-38-tooltip-modes`, `dg-07`/`dg-26`) are run in the full suite; any that pinned the old role or name of an *error* tile are amended in the plan (named there after the red run), the ready-state assertions are not touched.
- Docs: `CHANGELOG.md` `[Unreleased]` (Added), `docs/architecture.md` § Weather (retry paragraph, file table rows of `weatherTiles.js` and `weatherUiState.js`), `docs/design-system.md` (the `.weather-tile--retry` variant under Grid / tiles, the glyph sizes; no new token), `CLAUDE.md` is the private repo's copy (updated in the notes branch of the implementation PR, per the repo's multi-agent rule). README and the store text: not affected (no screenshot shows an error tile).
- Notes repo: the plan, the run ledger, `backlog.md`, `history.md`, `state.md`.

## Process

This changes what the user sees and can do on a tile, so it follows the full UI-phase cycle: spec, plan, independent design review (`design-review/PROTOCOL.md`; copy lens included), E2E, merge by the pipeline rules after the owner confirms. E2E: the new scenario alone `node .private/e2e/run.mjs --repo . --only dg-54 --base 67b3e32`, the full run `node .private/e2e/run.mjs --repo . --base 67b3e32`; **one process at a time** (parallel runs hang the harness, backlog item 8).

## Non-goals

- Automatic retries by a timer, exponential backoff, retry on `online`/`visibilitychange`/focus, `navigator.onLine` detection, notifications, a persistent offline banner (each is a backlog line).
- A manual refresh of a *fresh* (ready) tile, and any "force" that bypasses the 30 min cache.
- A timeout for the **boot** load (measured: it can stay `…` forever; separate backlog line).
- Changing the error texts, the stale marking, the cache TTL or version, the parallel fetch, `weatherApi.js`.
- Retry from the city modal (that is `network-error.md` decision 3: Save is the retry there), the shared network-error state, the hint tile.
- Cross-tab live updates (`chrome.storage.onChanged`): an open tab stays stale until its own action, as today; the cache read in `initialize()` is the only cross-tab effect.
- Localization, new tokens or colors, a retry counter or a "last updated" time.

## Accepted exceptions

- **Fresh tiles have no refresh control.** A user whose data is fresh but wrong-looking cannot force a refresh; that is a different feature (cache semantics). Not a defect of this run.
- **The tooltip disappears on the re-render.** Every render hides the shared tooltip; after a retry the pointer must leave and re-enter the tile (or focus must move) to see it again. It is the existing behaviour for every re-render (resize, edit mode, city change); not changed here.
- **The accessible name does not contain the visible value.** `Retry Temperature` does not contain `—` or `21`. The tile's name never did (`Temperature`), the value is exposed through the description; WCAG 2.5.3 is about visible *labels*, and the glyph and the value are not a label. Recorded so the reviewer does not reopen it.
- **Cooldown dims the glyph to half opacity.** An inactive component is exempt from the 3:1 non-text contrast rule (WCAG 1.4.11); the glyph is still visible and the state is exposed as `aria-disabled="true"`. The ready and retrying phases are measured at 3:1 or more.
- **A failed repeat after a stale tile looks the same as before.** The only difference is the one status line; the tile is stale again. Intended (no hidden state).
- **Retry applies to all tiles at once.** One tile pressed means every tile in an error or stale state shows the busy state; it is one attempt for one city.

## Acceptance scenarios

Common setup of the E2E (`dg-54`): the harness as in `dg-45`/`dg-53` (`launch(ctx.head, freshProfile("dg-54"))`, no `autoPrompt`; `widgetStorageV2([...defaultMetrics(), ...defaultChrome()])` plus `weatherFixture.sync` (stored city Tbilisi); `defaultMetrics` is temperature 1x1, precipitation 2x1, air quality 2x1, UV 1x1; `seedAndReload`). The network is one handler for every Open-Meteo host (`setNet(context, mode)` as in `dg-45`: `abort` with optional delay, `http` 503, `hang` (never answers), `ok` with `forecastBody()`/`airQualityBody()`), and every Open-Meteo request is counted on the context (`reqs`, forecast and air quality separately); an attempt is one forecast plus one air-quality request. Texts are compared to the table in decision 9 and to `network-error.md` decision 2. The retry tile selector is `#favorites .weather-tile[data-widget-id]`; "the four tiles" means the four metric ids. Cooldown waits use 3.3 s.

### AS-WR-01 A failed load makes every metric tile a retry control

- Given: city stored, no cache, network aborted; the page is opened (boot). Also: the 2x2 layout (`temperature` 2x2, precipitation 2x1, air quality 1x1, UV 1x1) and 500 and 320 px wide windows.
- When: the first load has failed.
- Then: each of the four tiles is a `BUTTON` (`type="button"`) with `data-favorite-action="retry-weather"`, `data-retry="ready"`, accessible name exactly `Retry Temperature` / `Retry Precipitation` / `Retry Air quality` / `Retry UV index`, `aria-describedby` pointing at the unchanged description `Weather unavailable: Can't reach the weather service. Check your connection and try again.`, `aria-busy` absent, `aria-disabled` absent, `tabindex` 0 (a native button). Visible: the metric glyph, the text `—`, and one refresh glyph (`.weather-tile__retry`, an `svg`, `aria-hidden="true"`) inside `.weather-tile__values`; the tile text (without the `sr-only` description) is `—`. Each tile is at least 56x56 px (cell 72/64/56 by width) and 2 cells plus a gap wide where wide. `cursor` is `pointer`. The hint tile does not exist (a city is stored). No page error. The count of Open-Meteo requests at rest is two (the boot attempt).
- Verified by: `dg-54` (group 1); `test/weatherTiles.test.js`. Expected before the change: the tiles are `DIV`s with `role="group"` and no glyph.

### AS-WR-02 Retry succeeds: one attempt, all four tiles recover, focus stays

- Given: the state of AS-WR-01; the network is restored (`setNet(ok)`); focus is on the Precipitation tile (by `Tab` or `focus()`), the request counter is reset.
- When: the user clicks the Precipitation tile.
- Then: within the attempt the four tiles show the busy state (AS-WR-04); when it ends exactly **two** requests were made (one forecast, one air quality) although four tiles were in error; the four tiles show real values (primary text not `—`, not `…`: temperature `21`, precipitation `10%`, air quality `40`, UV `3`), are no longer buttons (`DIV`, `role="group"`, `tabindex="0"`, name = metric label, no `data-retry`, no glyph), the retry cursor is gone; the key `quietTabWeatherCache` exists in `chrome.storage.local` with `locationName` `Tbilisi`; `document.activeElement` is the Precipitation tile (same `data-widget-id`); `#desktop-live` reads `Weather updated`; `#desktop-status` is empty and hidden; the tooltip is not visible; no page error.
- Verified by: `dg-54` (group 2). Expected before the change: the click makes 0 requests.

### AS-WR-03 Retry fails: back to the same state, one calm message, a 3 s pause

- Given: the state of AS-WR-01 (network still aborted).
- When: the user clicks a tile, the attempt fails, and then (a) presses the same tile again at once, (b) waits 3.3 s and presses again, (c) the third attempt is made with the network restored.
- Then: (1) after the failure the four tiles are again retry controls in the error state (`data-retry="cooldown"`, `aria-disabled="true"`, glyph at lower opacity than in `ready`), descriptions unchanged, text `—`; `#desktop-status` is visible with `role="alert"` and reads exactly `Can't reach the weather service. Check your connection and try again.`; it contains none of `/Failed to fetch|TypeError|NetworkError|Load failed|Open-Meteo|fetch/i`. (2) The press in (a) makes **zero** requests and changes nothing (the status line is unchanged). (3) After 3.3 s the tiles are `data-retry="ready"` without `aria-disabled` (the cooldown ended by itself, no user action) and the press in (b) makes exactly two requests, fails again and shows the status text again (it is a fresh set: an `MutationObserver` on `#desktop-status` records text, then text again). (4) The status line clears by itself after 8 s from its last set (`hidden`). (5) Attempt (c) after another cooldown succeeds as in AS-WR-02. Also, with the network answering HTTP 503, the status line reads `The weather service isn't responding right now. Try again in a moment.`. And with a boot read failure of the stored city (the `quietTabWeatherLocation` read fails once through the harness's storage fault helper, then works): the tiles are retry controls, a click re-reads the location and loads the weather, and the tiles become ready.
- Verified by: `dg-54` (group 2); `test/weatherUiState.test.js` (cooldown arithmetic). Expected before the change: no control, no status.

### AS-WR-04 The busy state and the double press

- Given: the state of AS-WR-01; the network answers after a delay (`ok` with a 1200 ms delay on every request).
- When: the user clicks the tile twice quickly (two `click()`s 30 ms apart), then once more at 600 ms, and presses Enter on the focused tile at 700 ms.
- Then: while the attempt runs the four tiles have `data-retry="retrying"`, `aria-busy="true"`, `aria-disabled="true"`, the error tiles show `…` as the visible value (not `—`), the glyph has a running animation (`getAnimations()` length at least 1, none under reduced motion, AS-WR-10), the description is `Trying again…`; the tiles are not `disabled` (focus stays); the total number of Open-Meteo requests is exactly **two** for the whole sequence (all later presses ignored); the busy state ends when the response arrives; no status line. A stale tile in the same state keeps its values and its description starts `Trying again… `.
- Verified by: `dg-54` (group 2); `test/weatherUiState.test.js` (the in-flight guard returns the same state object); `test/weatherTiles.test.js` (busy models). Expected before the change: red on the busy checks (no control).

### AS-WR-05 Stale tiles retry too, and a refreshed cache is served without a request

- Given: a cache 2 h old, network aborted (the boot shows four stale tiles: values, dashed border); in a second run the same, but another tab refreshes the cache (writes a fresh `quietTabWeatherCache` via `chrome.storage.local.set`) after the boot.
- When: (a) the user clicks a stale tile with the network restored; (b) with the network still aborted; (c) in the second run, with the network aborted, the user clicks a stale tile.
- Then: (a) the tiles become fresh (`border-style` solid, no `data-stale`, the new values), requests are exactly two, `Weather updated` is announced; the cache is rewritten (`fetchedAt` newer). (b) the tiles are stale again (dashed, the same old values, nothing else changed), the status line shows the network text, the cache is **not** rewritten (`fetchedAt` equal to the seeded one). (c) zero requests, the tiles become fresh with the cache values (`ready`), `Weather updated` announced. A stale tile is a button named `Retry <Metric>` whose description is still `Couldn't refresh - showing saved data. <values sentence>`; its values stay readable (no clipping, `—` absent).
- Verified by: `dg-54` (group 3); `test/weatherService.test.js` (a fresh cache from elsewhere: no fetch; a stale cache on failure: unchanged, not rewritten). Expected before the change: no control.

### AS-WR-06 Keyboard

- Given: the state of AS-WR-01.
- When: the user presses Tab from the page start, then Enter on a retry tile; later Space on another; Shift+Tab; Escape.
- Then: the Tab order is the DOM order of the grid exactly as before (one stop per tile, no extra stop; the sequence of `data-widget-id` equals the sequence in the ready state); the focused retry tile shows the existing focus ring (outline width 3 px, `--focus-ring`, offset 2 px; the weather tile rule) and the tooltip with its description; Enter and Space each start one attempt (Space on keyup, as a native button); a held Enter (`keydown` repeated 10 times at 30 ms) makes exactly two requests; after the result `document.activeElement` is the same tile id and focus never falls to `<body>` at any moment during the sequence (sampled by a `focusout`/`focusin` log); Escape does nothing to a retry tile (no edit mode change, no status). No keyboard trap.
- Verified by: `dg-54` (group 4). Design review (accessibility lens): the focus announcement of the name and description; the spoken output is not tested.

### AS-WR-07 City change and timeouts

- Given: the state of AS-WR-01 with a slow, failing-then-ok network.
- When: (a) an attempt is in flight (slow, 1500 ms) and the user changes the city to Batumi through the weather dialog and the city modal (geocoding and weather answer fast and ok); (b) an attempt is in flight and the city change **fails** (geocoding aborted); (c) the network hangs (`hang`) and the user presses the tile; (d) from the state of (c) the hung request is answered later.
- Then: (a) the late retry result never changes the tiles: the final tiles show the Batumi values (`weatherResult.location.name` visible in the 2x2 tile city line `Batumi`), the stored city is Batumi, the retry state is ready (no cooldown, `data-retry` absent as the tiles are ready), the number of weather requests for Tbilisi after the change does not exceed the two of the attempt. (b) the city modal shows its own error (unchanged), the attempt's result applies: the tiles recover for Tbilisi (or stay in error if it failed), nothing is overwritten by the failed change. (c) after 15 s the tiles return to the error state (`—`), `#desktop-status` reads `The request took too long. Check your connection and try again.`, the tiles are in cooldown, then ready 3.3 s later; a new press is possible. (d) a response that arrives after the timeout does not change the tiles, the cache or the status line. While the city modal or any dialog is open, `#favorites` is inert (not clickable) and an attempt in flight finishes in the background.
- Verified by: `dg-54` (group 5; (c) and (d) take about 20 s of wall time); `test/weatherSource.test.js` (the token and `withTimeout` pins).

### AS-WR-08 Edit mode and drag are unchanged

- Given: the state of AS-WR-01 (error tiles) and the same with stale tiles.
- When: the user activates Settings (edit mode), taps a weather tile, turns edit mode off; and, separately, edit mode is turned on while an attempt is in flight.
- Then: in edit mode every metric tile is the `Edit <metric>` button exactly as in the ready state: no refresh glyph, no `data-retry`, no `data-favorite-action`, a tap opens the weather edit dialog and makes **zero** requests; the jiggle, the `Hide <metric>` badges and the drop highlight behave as in AS-10 and `dg-05`/`dg-43` (a weather tile can be dragged in an error state; the drop writes the grid and no request is made); leaving edit mode brings the retry controls back. An attempt started before edit mode ends in edit mode: the tiles are `Edit` buttons with the result's values or `—`, the status line (on failure) is shown, `Weather updated` (on success) is announced.
- Verified by: `dg-54` (group 6); `dg-05`, `dg-07`, `dg-43` run unchanged.

### AS-WR-09 Narrow windows, low windows, sizes

- Given: error tiles and stale tiles at 1280, 500, 360 and 320 px wide, heights 800 and 600; sizes 1x1, 2x1, 2x2.
- When: the page is rendered, then an attempt is in flight (delay), then cooldown.
- Then: in every state the tile box is unchanged (width and height equal to the ready state's, +/- 0.5 px: the state never changes the geometry); `.weather-tile__values` has `scrollWidth <= clientWidth` (nothing clipped), the glyph and the value are both inside the tile box; the glyph is 14 px at cell 72 and 64, 12 px at cell 56 and 16 px in a 2-high tile (+/- 0.5); no horizontal scroll of the page; no overlap with a neighbour; the 2x2 tile still shows the city name line.
- Verified by: `dg-54` (group 7).

### AS-WR-10 Themes, forced colors, reduced motion

- Given: AS-WR-01 and AS-WR-05 states, light and dark (`prefers-color-scheme` emulated), forced colors, reduced motion.
- When: ready, retrying and cooldown phases are inspected.
- Then: light and dark: the glyph's color against the tile background is at least 3:1 in the `ready` and `retrying` phases for every tone of a stale tile (the existing tones: green, yellow, orange, red, rain levels, checked by computing the effective background); the hover border color is `--border-control` and differs from the resting border; the focus ring and the `—` text contrast are the existing ones. Forced colors: the glyph is visible (its computed color is a system color other than the background), the focus outline is visible, the dashed stale border stays dashed. Reduced motion: no running animation on the glyph in `retrying` (`getAnimations()` empty), the `…` is the non-motion cue of an error tile; the busy state is still exposed by `aria-busy`. With motion allowed: the glyph rotates (an animation, 1 s per turn, linear, infinite) only in `retrying`.
- Verified by: `dg-54` (group 7); design review (visual lens) for the look of the glyph at 12 px.

### AS-WR-11 Names, roles and live regions are complete and consistent

- Given: every state (loading, error, error/retrying, error/cooldown, stale, stale/retrying, ready; normal and edit mode).
- When: the accessibility tree and the live regions are read.
- Then: the table holds: loading is a `group` named by the metric label (as today, `aria-busy`); error, stale: a `button` named `Retry <Metric>` in every phase; ready: a `group` named by the label; edit mode: a `button` named `Edit <Metric>` in every state; `aria-describedby` always resolves to an existing node with the description text; no element has `role="button"` over a `button`; no tile contains another focusable element; `#desktop-live` is `aria-live="polite"` and `#desktop-status` is `role="alert"` (unchanged elements, no new live region anywhere in the page).
- Verified by: `dg-54` (group 1 for the states it reaches, group 6 for edit); `dg-23-a11y-names` and `dg-32-focus-order` unchanged.

### AS-WR-12 Two tabs and storage

- Given: two new tab pages open on the same profile, both in the error state, the network aborted; then restored.
- When: the user retries in tab A; then, with the network aborted again, in tab B.
- Then: tab A recovers; tab B stays in its error state until its own press (no `onChanged` listener, as today); the press in tab B makes **zero** requests and recovers from the cache tab A wrote (the 30 min rule); `chrome.storage.sync` is byte-for-byte unchanged by the whole scenario (no widget, location or meta write; the grid is not touched); `chrome.storage.local` gains only `quietTabWeatherCache` and the prompt flag is untouched; no new storage key anywhere (`Object.keys` of both areas equal the expected set).
- Verified by: `dg-54` (group 3); `dg-26-two-tabs` unchanged.

### AS-WR-13 The pure logic

- Given: the pure modules.
- When: the units run.
- Then: `weatherUiState`: the initial state is ready; `startWeatherRetry` sets `inFlight` and returns the **same object** when called again; `finishWeatherRetry(state, now, false)` sets `availableAt = now + 3000` and `startWeatherRetry` before that returns the same object, at `now + 3000` starts; `finishWeatherRetry(..., true)` leaves no cooldown; `weatherRetryPhase` gives `retrying`, `cooldown`, `ready` for the three situations; a clock earlier than the stored `now` (`availableAt - now > 3000`) is `ready`; `resetWeatherRetry` clears both; opening and closing the city modal keeps the retry fields; `weatherRetryOutcome` maps `ready` to `updated`, `no-location` to `gone`, `error` and `stale` to the failure with `result.error` (and never reads a message from anything else). `weatherTiles`: error and stale carry `retry: "ready"` by default and the phase when given; ready, loading and no-location have `retry: null`; retrying sets `busy: true`, an error tile's primary `…`, a stale tile's values kept, the descriptions of decision 9; the existing models are byte-identical when `retry` is omitted. `weatherService`: the characterization cases of Scope. `icons`: `refresh` exists and is valid markup. Source pins: the click branch, the guard before the call, the token, `withTimeout`, no `error.message`, no `innerHTML` for the new nodes.
- Verified by: unit tests (named in Scope).

### AS-WR-14 Documentation says what the tile does

- Given: the finished implementation.
- When: `CHANGELOG.md`, `docs/architecture.md` and `docs/design-system.md` are read.
- Then: `[Unreleased]` has an Added entry in user language (a weather tile that could not load can be pressed to try again; it repeats once for all tiles, waits a few seconds after a failure and says why it failed); `docs/architecture.md` § Weather has the retry paragraph (one attempt through `initialize()`, the 15 s guard, the cooldown, the cross-tab effect through the cache, the generation rule) and the two file table rows are updated; `docs/design-system.md` names the retry variant and the glyph sizes and states that no token was added; none of them says that a fresh tile can be refreshed.
- Verified by: `node .private/pipeline/tools/lint.mjs`, a source check in `test/newtabSource.test.js` for the CHANGELOG line, design review (reads the docs).

## Review focus

- **Scenarios and states:** the phases `ready` / `retrying` / `cooldown` on error and on stale tiles; one attempt for four tiles; the races of AS-WR-07 (city change in flight, timeout, late result, token vs generation); the boot read failure and the cross-tab cache case; the 3 s cooldown (does a dimmed, dead press confuse more than a plain no-op); whether the stale tile should be a retry control at all (decision 1 says yes; the reviewer can argue it adds noise to a tile that shows usable data).
- **Visual and layout:** the glyph beside `—` at cell 56 (320 px) and in the 2x1 tile; the hover border against the dashed stale border; the glyph on every stale tone (rain-5 is the darkest background); forced colors and dark; the spin at 12 px.
- **Accessibility and copy:** the button name `Retry <Metric>` against the unchanged description (the tooltip says "try again" and the tile now can); a tile that changes role (`group` to `button` and back) while focused; the status line text and `Weather updated`; focus return after every re-render; reduced motion cue (`…`); the target size.

## Process notes for the implementer

- The new nodes use `createNode`/`textContent` only; the glyph is inserted through the existing `createIconNode` (vendored static SVG, the one allowed `innerHTML`).
- Do not edit `weatherService.js`; if the plan finds it needs a change, stop and go back to the spec.
- Every `src/` change after the final gate needs a new final run.
