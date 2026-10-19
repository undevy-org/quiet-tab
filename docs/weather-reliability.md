# Weather reliability: the first load cannot hang, a stale tile says how old it is, no foreign cache, an honest save error

## Status

`draft` — revision 1 (2026-10-19, stage 0 of run 48). Run №48 (`weather-reliability`), row Р48 of the roadmap ("Погода: надёжность", marathon `kickoffs/marathon-45-51.md`). Backlog items 10, 14, 16, 111, 112. Triage below is by reading `origin/main` at `e1e85eb` (runs 45–47 merged); the first step of the kickoff re-checks every item live on `origin/main` before stage 1.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). No key or field changes; the cache and the city are written exactly as today.

Related: `docs/weather-tile-retry.md` (the retry tile, `retryWeather`, `withTimeout`, generation and token rules), `docs/city-modal-focus-copy.md` (persist-after-forecast, `changeCity`), `docs/network-error.md` (classified error texts), `src/newtab.js` (`startWeather`, `retryWeather`, `changeCity`, `withTimeout`, `weatherLocationError`), `src/weatherService.js` (`initialize`, `persistAfterForecast`, `persistAndFetch`, `fetchAndCache`), `src/weatherApi.js` (`ERROR_MESSAGES`, `weatherErrorMessage`), `src/weatherTiles.js` (`describeWeatherMetric`, `STALE_PREFIX`), `src/weatherPresentation.js`.

## Terms

- **Boot load**: the `startWeather()` call at the end of the bootstrap, one `weatherService.initialize()`.
- **Hang**: a forecast or air-quality request that never settles (no network error either).
- **Stale tile**: a `weatherResult` with `status: "stale"` (cache older than 30 min, refresh failed).
- **Foreign cache write**: `initialize()` writing a forecast fetched for city A into `chrome.storage.local` after the stored city became B.

## Intake log

Marathon row Р48, no questions to Kier. Decisions of Kier (2026-10-15, row Р48 and backlog item 14): the age goes **only into the tooltip and the screen-reader description, relative ("Updated 2 h ago"); the tile face does not change.** Everything else is decided below by the author; the two copy/format choices are marked `Ruling (марафон, на проверку Киру)`.

## Triage (reading `main`)

| Item | Reproduces by reading? | Where |
|------|------------------------|-------|
| 10 no timeout on the boot load | yes | `startWeather` awaits `weatherService.initialize()` bare; `retryWeather` and `changeCity` wrap theirs in `withTimeout` (15 s). A hang leaves the tiles `…`, `aria-busy`, forever. |
| 16 `weatherLocationError` stays after a successful boot load | yes | `startWeather` (success path) never clears it nor sets `weatherLocation`; `retryWeather` and `changeCity` do. Effect: city modal prefill, weather dialog city field, `locationRead` treat the city as unknown. |
| 14 age of a stale tile | yes (not implemented) | `describeWeatherMetric` stale description = `STALE_PREFIX` + values, no age; `data.fetchedAt` is available. |
| 111 foreign cache write | yes | `initialize()` → `fetchAndCache(location)` → `cacheStore.setCache` regardless of what is stored by then; `startWeather`'s generation check only drops the UI result. |
| 112 wrong text on a failed city write | yes | `locationStore.setLocation` rejects with a storage `Error`; `weatherErrorMessage` maps every non-`WeatherApiError` to `unknown`, "Couldn't load weather. Try again in a moment." |

## Live measurement

To be filled by the executor at step 1 of the kickoff (probe in notes `scratch/run-48-triage/`, throw-away profile): item 10 (route that never fulfils Open-Meteo, tiles state at 1 s, 16 s, 30 s), 16 (stored city, first `storage.sync.get` of the location key made to reject once, then a load that succeeds: city modal prefill and weather dialog city field), 14 (cache `fetchedAt` 2 h old, fetch aborted: description text), 111 (boot fetch held, city changed to B, boot fetch released: `weatherCache.locationName`), 112 (`storage.sync.set` rejecting on the location key: modal error text). A non-reproducing item: a `backlog.md` line, its decision and AS dropped from this spec.

## Decisions

1. **The boot load has the same 15 s guard as the city change and the retry (item 10).** `startWeather` wraps `weatherService.initialize()` in `withTimeout` (the existing helper, constant `CITY_REQUEST_TIMEOUT_MS`, name unchanged). On timeout the result is `{ status: "error", location: null, data: null, error: <the existing timeout text> }` (the same shape its `catch` builds for any throw). Tiles become the retryable error tiles of `weather-tile-retry.md` (decision 13 there: the error result with no location is retryable; the click re-reads the location through `initialize()`). The generation guard stays: a late answer of the timed-out call is dropped at the service boundary of the UI (nothing renders it). No new text, no new element; `aria-busy` leaves with the re-render. The hint tile is never involved (a hung call has not said whether a city exists; the tiles stay error tiles until a retry says so).
2. **A successful boot load sets the known city and clears the read error (item 16).** After the generation check in `startWeather`: when `result.location` is non-null, `weatherLocation = result.location` and `weatherLocationError = ""` (the assignments `retryWeather` makes on a non-failed outcome and `changeCity` makes on success). A `no-location` result does not touch them beyond today. One more case: an error result that carries a location (cache read failed) also sets `weatherLocation` and clears the read error, because the location was read.
3. **A stale tile's tooltip and description say how old the data is (item 14, decision of Kier).** The stale description becomes `Couldn't refresh - showing saved data. Updated <age>. <values>` where `<age>` is relative to `now` at render time, from `data.fetchedAt`. The tile face, the dashed border, sizes, the retry glyph and every other state are unchanged. `describeWeatherMetric` gets an optional `now` (milliseconds, default `Date.now()` at the call site in `newtab.js`, never read inside the pure function) and a pure helper formats the age in `weatherPresentation.js`. **Ruling (марафон, на проверку Киру): age wording by the table below, floor division, English abbreviations as in Kier's example; alternative: spelled-out units ("2 hours ago") or a clock time ("Updated at 14:05"); cost of a wrong choice: one string table and its unit tests, nothing structural.**

   | Age (`now - fetchedAt`) | Text |
   |--------------------------|------|
   | under 1 min (or a clock that moved backwards: negative) | `Updated just now` |
   | 1 to 59 min | `Updated N min ago` |
   | 1 to 23 h | `Updated N h ago` |
   | 24 h and more | `Updated N d ago` |

   A `fetchedAt` that is not a finite number: the sentence is omitted (the description is the old one). While a retry runs (`Trying again…`) and in every non-stale state the description is unchanged. The text is computed at render time and is not refreshed while the tab stays open (Accepted exceptions).
4. **`initialize()` never writes a cache for a city that is no longer the stored one (item 111).** In `weatherService.initialize()` after the fetch and before `setCache`, the service re-reads the stored location; when its `name` differs from the location the fetch was made for (or it is gone), the forecast is returned as the `ready` result built from the cache object but NOT written. A re-read that itself fails is treated as "unchanged" (a cache is only a cache; same stance as the existing cache-write rule). The same guard covers the retry (it calls `initialize()`). The window between the re-read and the write remains (Accepted exceptions), as in `persistAfterForecast`. `persistAndFetch` (wizard) and `persistAfterForecast` are unchanged here: they write the city right before or after the fetch they own.
5. **A failed write of the city says so (item 112).** The service wraps a rejecting `locationStore.setLocation` (in `persistAfterForecast` and in `persistAndFetch`) into `WeatherApiError` with `kind: "storage"`; `ERROR_MESSAGES.storage = "Couldn't save your city. Try again in a moment."`. The modal (change mode) and the wizard step 1 show it as their error text; city, tiles and cache stay as before the attempt (already the case for persist-after-forecast). **Ruling (марафон, на проверку Киру): the text "Couldn't save your city. Try again in a moment."; alternative: "Couldn't save the city to your browser profile." or leaving the generic text; cost of a wrong choice: one string and its test.** `getLocation`/`getCache` read failures keep the `unknown` text (they are load failures, "Couldn't load weather" is true there).

## Acceptance scenarios

### AS-WRL-01 A boot request that never answers ends in retryable error tiles (decision 1, item 10)
- Given: a stored city, no fresh cache, Open-Meteo routes never fulfil; 1280×800, normal mode.
- When: the new tab opens and 16 s pass (fake clock or real 16 s).
- Then: before 15 s the four tiles are `…` with `aria-busy="true"` (as today); after the timeout they are error tiles (`—`, `aria-busy` absent), each a `button.weather-tile--retry` named `Retry <Metric>`, description `Weather unavailable: The request took too long. Check your connection and try again.`; `#desktop-status` is not written (as at any boot failure); no unhandled rejection. Edit mode: the tiles are the `Edit <metric>` buttons (no retry), error text in the description.
- Verified by: E2E `dg-88-weather-reliability.mjs`.

### AS-WRL-02 Retry after the timeout works, the late answer is ignored (decision 1)
- Given: AS-WRL-01 state; then the network works for the next request.
- When: the user activates a retry tile (click, then once more by keyboard after another failure); and, separately, the original hung request is fulfilled after the timeout.
- Then: the retry runs the existing flow (`Trying again…`, `Weather updated`, tiles with values); the late answer of the first call changes nothing on screen, in `weatherResult`, or in the status line; with a city change made after the timeout the tiles show the new city.
- Verified by: E2E `dg-88`.

### AS-WRL-03 A successful boot load clears a read error (decision 2, item 16)
- Given: the first read of the city key fails once (stub on the context), the stored city exists, a later `initialize()` (the boot load re-reads the location itself) succeeds with the forecast.
- When: the page boots, then the user opens the city modal (hint, or the weather dialog's city field in edit mode).
- Then: the modal input is prefilled with `name, country`, caret at the end (not empty), the weather dialog's city field shows the city and `Change`, not `Set a city`; Save without a change is Cancel. With a failing boot load that stays failing, behaviour is as today (error tiles, retry clears it on success).
- Verified by: E2E `dg-88` (plus unit `test/newtabSource.test.js` pin of the assignments in `startWeather`).

### AS-WRL-04 A stale tile's tooltip and description carry the age (decision 3, item 14)
- Given: a cache `fetchedAt` 2 h 10 min ago for the stored city, forecast aborted (stale result); also 45 min, 20 s, 26 h ago (and a `fetchedAt` in the future).
- When: hover (pointer) and `:focus-visible` (keyboard) on each of the four tiles, normal mode; read `aria-describedby` text.
- Then: the text is `Couldn't refresh - showing saved data. Updated 2 h ago. Currently …` per the table (`Updated 45 min ago`, `Updated just now`, `Updated 1 d ago`, `Updated just now` for the future); the tile face (values, dashed border, size, retry glyph) is identical to `main`; a ready tile and an error tile have no age sentence; during `Trying again…` the description is the existing one; edit mode unchanged.
- Verified by: E2E `dg-88` and unit `test/weatherTiles.test.js`, `test/weatherPresentation.test.js` (table incl. the boundaries 59 s / 60 s, 59 min / 60 min, 23 h 59 min / 24 h).

### AS-WRL-05 A late boot answer does not write the old city's forecast (decision 4, item 111)
- Given: stored city Tbilisi, no fresh cache, the boot forecast request held; the user changes the city to Berlin (change mode, forecast for Berlin answers at once); then the held Tbilisi request is released.
- When: the page reloads offline (aborted routes).
- Then: after the release `chrome.storage.local` cache `locationName` is `Berlin` (not Tbilisi); the tiles show Berlin; the offline reload shows Berlin stale values with the age sentence (AS-WRL-04). A normal boot with an unchanged city writes the cache as before (one write).
- Verified by: E2E `dg-88` and unit `test/weatherService.test.js` (city changed during the fetch: no `setCache`; unchanged: one `setCache`; re-read rejects: one `setCache`; location removed: no `setCache`).

### AS-WRL-06 A failed city write shows an honest text (decision 5, item 112)
- Given: `chrome.storage.sync.set` for the location key rejects (stub), the forecast for the new city answers.
- When: the user saves a new city in the change modal; and, in a fresh profile, finishes wizard step 1 with a city.
- Then: modal / wizard show `Couldn't save your city. Try again in a moment.` in their existing error slot (alert, no layout change beyond the existing error rule), the input and the previous city/tiles/cache are unchanged, focus returns to the field (existing), Save stays enabled; a second attempt with the stub removed succeeds. A forecast failure keeps its own network/timeout/http text.
- Verified by: E2E `dg-88` and unit `test/weatherService.test.js`, `test/weatherApi.test.js` (`storage` kind; unknown still `unknown`).

### AS-WRL-07 Nothing else moves: layout, keyboard, narrow and low windows
- Given: 500×800, 320×480 and 1280×300 windows; keyboard only.
- When: the AS-WRL-01 and AS-WRL-04 states are shown; Tab through the tiles.
- Then: no new element, no new visible text on a tile, tab order and tile geometry are identical to `main` (bounding boxes compared with the base); the retry glyph, hover and focus ring are as in `weather-tile-retry.md`; reduced motion changes nothing; the only new strings are the age sentence (description/tooltip) and the storage error text.
- Verified by: E2E `dg-88` (geometry diff against `--base origin/main`); design review for the strings.

## Affected earlier scenarios

`10-weather-grid-states` (stale tile description text gains the age sentence; assertions on the exact stale description are updated, never deleted), `dg-54-weather-tile-retry` (stale descriptions in retry cases; the hanging-boot case it documents as "forever" is now a timeout), `dg-47-city-error-ux` and `dg-84-city-modal-focus-copy` (modal error texts: a storage failure now has its own text; any scenario that stubs a rejecting `sync.set` and expects `Couldn't load weather` is updated to the new text), `dg-37-write-failure` (widgets writes: unaffected, control). Pinned values and source pins in `test/newtabSource.test.js`, `test/weatherSource.test.js`, `test/weatherTiles.test.js`, `test/weatherService.test.js` are updated, never deleted; each change is named in the commit message. `dg-85` (AS-CSL-08) and `dg-86` (AS-LLW-04/05) are red on clean `main` on the Mac (backlog 135): new scenarios do not rely on them.

## Review focus

- **Scenarios/states:** the boot timeout interacting with generation and token (a city change during the 15 s, a retry press right after the timeout, a late answer after either); `weatherLocation`/`weatherLocationError` consistency after boot success, boot failure and retry; the service re-read in decision 4 on every `initialize()` path (fresh cache, no location, fetch failure with stale cache, retry); no regression of "a failed city change keeps city and tiles".
- **Visual/layout:** none expected; geometry of every state equals `main`.
- **Accessibility/texts:** the age sentence in tooltip and in `aria-describedby` (tone, order, no duplicated period), the storage text in the existing alert slots, no technical words; no re-announcement caused by the new description.

## Accepted exceptions

1. The age sentence is computed at render and is not refreshed while the tab stays open (the next render, retry or reload recomputes it).
2. The window between the stored-city re-read and the cache write in decision 4 remains (a city change inside that gap can still produce one foreign write; the next successful load of the stored city overwrites it).
3. A hung boot load is treated as failed after 15 s even if the network answers at 16 s; the user retries (the same rule as the city change and the retry).
4. A `getLocation`/`getCache` read failure keeps the generic text.

## Non-goals

- Re-fetching on tab visibility or `online` (Р50), periodic refresh of the age text, a force-refresh bypassing a fresh cache.
- Any change to tile faces, the retry control, the 30 min cache rule, cache schema/version, request count, or the classified texts other than the new `storage` kind.
- Aborting the underlying `fetch` of a timed-out call (the call is not cancellable; its late answer is ignored in the UI and guarded in the service).
- City modal layout, suggestion list, wizard flow, typography and vocabulary (Р49), Chrome Sync edge cases (Р51).
- Any storage change.

## Review rounds

Revision 1: stage 0 author.
