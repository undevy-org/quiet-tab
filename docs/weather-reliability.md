# Weather reliability: the first load cannot hang, a stale tile says how old it is, no foreign cache, an honest save error

## Status

`implemented` — revision 3 (2026-10-19, stage 2 of run 48 after the second review pass; revisions 1 and 2 earlier). Run №48 (`weather-reliability`), row Р48 of the roadmap ("Погода: надёжность", marathon `kickoffs/marathon-45-51.md`). Backlog items 10, 14, 16, 111, 112. Triage below is by reading `origin/main` at `e1e85eb` (runs 45–47 merged); the first step of the kickoff re-checks every item live on `origin/main` before stage 1.

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

Measured on `origin/main` `e1e85eb` (2026-10-19, Mac, throw-away profile, Open-Meteo mocked; probe `scratch/run-48-triage/probe.mjs` in notes). All five items reproduce.

| Item | Measured |
|------|----------|
| 10 | Stored city, no cache, forecast and air-quality requests held forever. At 1.0 s, 16.0 s and 30.0 s all four tiles are identical: `aria-busy="true"`, text `…`, description `Loading weather…`, no retry control, `#desktop-status` empty, no page error. |
| 16 | First read of the city key rejects, second passes. The tiles show values (21 / 10% / 40 9.0 PM2.5 / 3). The weather dialog city field is `Set a city` (empty state, hint hidden); the city modal input is empty (`""`) with Save disabled. |
| 14 | Cache `fetchedAt` 2 h old, fetch aborted: tiles `stale`, retry `ready`; description and tooltip `Couldn't refresh - showing saved data. Currently 21°. Today at 15:00 — 24°, yesterday at 15:00 — 22°.` No `Updated`/`ago` anywhere. (Hover measured; `:focus-visible` uses the same text.) |
| 111 | Stored Tbilisi, boot requests held, city changed to Berlin (stored city and cache `Berlin`), held requests released: stored city `Berlin`, cache `locationName` = `Tbilisi`, `fetchedAt` 1503 ms old; tiles keep their values. |
| 112 | `storage.sync.set` on the city key rejects once: the modal stays open, input `Berlin`, `role="alert"` text `Couldn't load weather. Try again in a moment.`, Save enabled, stored city still `Tbilisi`. |

## Decisions

1. **The boot load has the same 15 s guard as the city change and the retry (item 10).** `startWeather` wraps `weatherService.initialize()` in `withTimeout` (the existing helper, constant `CITY_REQUEST_TIMEOUT_MS`, name unchanged). On timeout the result is `{ status: "error", location: null, data: null, error: <the existing timeout text> }` (the same shape its `catch` builds for any throw). Tiles become the retryable error tiles of `weather-tile-retry.md` (decision 13 there: the error result with no location is retryable; the click re-reads the location through `initialize()`). The late answer of the timed-out call is dropped by `withTimeout` itself (its promise is already rejected); the generation guard stays for the other race: a successful city change or a retry that bumped `weatherGeneration` while the boot call was pending makes the timeout result a silent no-op, a failed city change (which does not bump it) lets the timeout apply. The change to error tiles is silent for assistive tech, as any boot failure is today (a retry failure is announced because the user pressed it); no new announcement. **Ruling (марафон, на проверку Киру): with a stale cache, a hung boot gives error tiles (`—`), not the stale values; the values come back through retry or the next load. Alternative: a timeout inside the service around the fetch so `initialize()` returns `stale` itself; cost of a wrong choice: a small service change plus one AS; the alternative is a backlog line.** No new text, no new element; `aria-busy` leaves with the re-render. The hint tile is never involved (a hung call has not said whether a city exists; the tiles stay error tiles until a retry says so).
2. **A successful boot load sets the known city and clears the read error (item 16).** After the generation check in `startWeather`: when `result.location` is non-null, `weatherLocation = result.location` and `weatherLocationError = ""` (the assignments `retryWeather` makes on a non-failed outcome and `changeCity` makes on success). A `no-location` result does not touch them beyond today (intentional: the visible state is the hint tile, and the stale read error has no visible effect there). One more case: an error result that carries a location (cache read failed) also sets `weatherLocation` and clears the read error, because the location was read.
3. **A stale tile's tooltip and description say how old the data is (item 14, decision of Kier).** The stale description becomes `Couldn't refresh - showing saved data. Updated <age>. <values>` where `<age>` is relative to `now` at render time, from `data.fetchedAt`. The tile face, the dashed border, sizes, the retry glyph and every other state are unchanged. `describeWeatherMetric` gets an optional `now` (milliseconds, default `Date.now()` at the call site in `newtab.js`, never read inside the pure function) and a pure helper formats the age in `weatherPresentation.js`. **Ruling (марафон, на проверку Киру): age wording by the table below, floor division, English abbreviations as in Kier's example; alternative: spelled-out units ("2 hours ago") or a clock time ("Updated at 14:05"); cost of a wrong choice: one string table and its unit tests, nothing structural.**

   | Age (`now - fetchedAt`) | Text |
   |--------------------------|------|
   | under 1 min (or a clock that moved backwards: negative) | `Updated just now` |
   | 1 to 59 min | `Updated N min ago` |
   | 1 to 23 h | `Updated N h ago` |
   | 24 h and more | `Updated N d ago` |

   In the UI a stale tile exists only for a cache of 30 min or older (`isCacheFresh`), so the rows `Updated just now` and `Updated N min ago` for N < 30 are unreachable there; they stay as defensive output of the pure helper and are covered by unit tests only. The text `Updated 2 h ago` is read by a screen reader as written; the copy lens checks it. A `fetchedAt` that is not a finite number: the sentence is omitted (the description is the old one). While a retry runs (`Trying again…`) and in every non-stale state the description is unchanged. The text is computed at render time and is not refreshed while the tab stays open (Accepted exceptions).
4. **`initialize()` never writes a cache for a city that is no longer the stored one (item 111).** In `weatherService.initialize()` after the fetch and before `setCache`, the service re-reads the stored location; when its `name` differs from the location the fetch was made for (or it is gone), the forecast is returned as the `ready` result built from the cache object but NOT written. A re-read that itself fails is treated as "unchanged" (a cache is only a cache; the stance of `persistAfterForecast`). The guard lives in `initialize()` only: `fetchAndCache` is shared with `persistAndFetch`, which keeps writing as today; a failing `setCache` inside `initialize()` behaves as today (stale or error result). The stored city is compared by `name`, as `isCacheFresh` does today. The returned result keeps the `location` the fetch was made for (not the re-read one): in a single tab the UI generation guard has already dropped or superseded it; if the city changed in ANOTHER tab, this tab keeps showing the old city until its next mutation or reload, as every open tab does today (no storage listener; Accepted exceptions). The same guard covers the retry (it calls `initialize()`). The window between the re-read and the write remains (Accepted exceptions), as in `persistAfterForecast`. `persistAndFetch` (wizard) and `persistAfterForecast` are unchanged here: they write the city right before or after the fetch they own.
5. **A failed write of the city says so (item 112).** The service wraps any rejecting `locationStore.setLocation` (a storage failure, and also the store's `Invalid weather location` validation error: both mean "your city was not saved") (in `persistAfterForecast` and in `persistAndFetch`) into `WeatherApiError` with `kind: "storage"`; `ERROR_MESSAGES.storage = "Couldn't save your city. Try again in a moment."`. The modal (change mode) and the wizard step 1 show it as their error text; city, tiles and cache stay as before the attempt (already the case for persist-after-forecast). **Ruling (марафон, на проверку Киру): the text "Couldn't save your city. Try again in a moment."; alternative: "Couldn't save the city to your browser profile." or leaving the generic text; cost of a wrong choice: one string and its test.** `getLocation`/`getCache` read failures keep the `unknown` text (they are load failures, "Couldn't load weather" is true there).

## Acceptance scenarios

### AS-WRL-01 A boot request that never answers ends in retryable error tiles (decision 1, item 10)
- Given: a stored city, no fresh cache, Open-Meteo routes never fulfil; 1280×800, normal mode.
- When: the new tab opens and 16 s pass (fake clock or real 16 s).
- Then: before 15 s the four tiles are `…` with `aria-busy="true"` (as today); after the timeout they are error tiles (`—`, `aria-busy` absent), each a `button.weather-tile--retry` named `Retry <Metric>`, description `Weather unavailable: The request took too long. Check your connection and try again.`; `#desktop-status` is not written (as at any boot failure); no unhandled rejection. Edit mode: the tiles are the `Edit <metric>` buttons (no retry), error text in the description.
- Also (slow but successful): the same setup, but the forecast and air-quality answer after about 12 s: the tiles are `…` until then, then show values; no error tile, `#desktop-status` empty, and nothing changes at 16 s.
- Also (AS-WRL-01b, stale cache): a cache 2 h old, the requests hang: after 16 s the tiles are error tiles (`—`), not the stale values (Ruling in decision 1); a retry press works as above.
- Verified by: E2E `dg-88-weather-reliability.mjs`.

### AS-WRL-02 Retry after the timeout works, the late answer is ignored (decision 1)
- Given: AS-WRL-01 state; then the network works for the next request.
- When: the user activates a retry tile (click, then once more by keyboard after another failure); and, separately, the original hung request is fulfilled after the timeout.
- Then: the retry runs the existing flow (`Trying again…`, `Weather updated`, tiles with values); the late answer of the first call changes nothing on screen, in `weatherResult`, or in the status line; with a city change made after the timeout the tiles show the new city.
- Races: (a) a city change that succeeds at about 5 s: at 16 s the tiles still show the new city, the boot timeout changes nothing; (b) a failed city change (generation not bumped) at about 5 s does not suppress the boot timeout: at 16 s the tiles are error tiles as in AS-WRL-01; (b2) the first read of the city key failed (retry tiles exist while the boot hangs, `weatherLocationError`): a retry pressed at about 5 s succeeds and bumps the generation, at 16 s the boot timeout changes nothing; (c) a retry pressed after the timeout, then the late boot answer: ignored. Test doubles: the E2E tells cities apart by the coordinates in the request URL (Tbilisi and Berlin share coordinates in the harness suggest stub, so `dg-88` uses Batumi as the second city, or extends the stub with its own coordinates for Berlin), uses a per-city delay (`delayFor`: the first city slow, the rest at once) instead of the global `hang` where a city change must pass during a hung boot, and releases held routes (`answerHung`) before switching the network mode.
- Verified by: E2E `dg-88`.

### AS-WRL-03 A successful boot load clears a read error (decision 2, item 16)
- Given: the first read of the city key fails once (stub on the context), the stored city exists, a later `initialize()` (the boot load re-reads the location itself) succeeds with the forecast.
- When: the page boots, then the user opens the city modal (hint, or the weather dialog's city field in edit mode).
- Then: the modal input is prefilled with `name, country`, caret at the end (not empty), the weather dialog's city field shows the city and `Change`, not `Set a city`; Save without a change is Cancel. With a failing boot load that stays failing, behaviour is as today (error tiles, retry clears it on success).
- Verified by: E2E `dg-88` (plus unit `test/newtabSource.test.js` pin of the assignments in `startWeather`).

### AS-WRL-04 A stale tile's tooltip and description carry the age (decision 3, item 14)
- Given: a cache `fetchedAt` 2 h 10 min ago for the stored city, forecast aborted (stale result); also 45 min, 26 h and the boundary 30 min 10 s ago (and, for the boundary, 29 min 50 s: a fresh cache, `ready`, no age sentence).
- When: hover (pointer) and `:focus-visible` (keyboard) on each of the four tiles, normal mode; read `aria-describedby` text.
- Then: the text is `Couldn't refresh - showing saved data. Updated 2 h ago. Currently …` per the table (`Updated 45 min ago`, `Updated 1 d ago`, `Updated 30 min ago`); the tile face (values, dashed border, size, retry glyph) is identical to `main`; a ready tile and an error tile have no age sentence; during `Trying again…` the description is the existing one; edit mode unchanged. The rows `Updated just now`, a future `fetchedAt` and N < 30 min are unit-only (decision 3).
- Verified by: E2E `dg-88` and unit `test/weatherTiles.test.js`, `test/weatherPresentation.test.js` (table incl. the boundaries 59 s / 60 s, 59 min / 60 min, 23 h 59 min / 24 h, negative and non-finite).

### AS-WRL-05 A late boot answer does not write the old city's forecast (decision 4, item 111)
- Given: stored city Tbilisi, no fresh cache, the boot forecast request held (routes told apart by the `latitude`/`longitude` in the URL: Tbilisi held, Berlin answered at once); the user changes the city to Berlin (change mode); then the held Tbilisi request is released.
- When: the page reloads offline (aborted routes), once with the cache as written and once after moving its `fetchedAt` 2 h back.
- Then: before and after the release `chrome.storage.local` `quietTabWeatherCache.locationName` is `Berlin` (not Tbilisi); the tiles show Berlin; the offline reload of the fresh cache shows Berlin values (`ready`, no age sentence), after moving `fetchedAt` 2 h back it shows Berlin stale values with the age sentence (AS-WRL-04). A normal boot with an unchanged city writes the cache as before (one write).
- Verified by: E2E `dg-88` and unit `test/weatherService.test.js` (city changed during the fetch: no `setCache`; unchanged: one `setCache`; re-read rejects: one `setCache`; location removed: no `setCache`).

### AS-WRL-06 A failed city write shows an honest text (decision 5, item 112)
- Given: `chrome.storage.sync.set` for the location key rejects (stub), the forecast for the new city answers.
- When: the user saves a new city in the change modal; and, in a fresh profile, finishes wizard step 1 with a city.
- Then: modal / wizard show `Couldn't save your city. Try again in a moment.` in their existing error slot (alert, no layout change beyond the existing error rule), the input and the previous city/tiles/cache are unchanged, focus returns to the field (existing), Save stays enabled; a second attempt with the stub removed succeeds. A forecast failure keeps its own network/timeout/http text.
- Verified by: E2E `dg-88` and unit `test/weatherService.test.js`, `test/weatherApi.test.js` (`storage` kind; unknown still `unknown`).

### AS-WRL-07 Nothing else moves: layout, keyboard, narrow and low windows
- Given: 500×800, 320×480 and 1280×300 windows; keyboard only.
- When: the AS-WRL-01 and AS-WRL-04 states are shown (the stale tooltip with its longer text, hovered and focused, on the four tiles at the window edges); Tab through the tiles.
- Then: no new element, no new visible text on a tile, tab order and tile geometry are identical to `main` (bounding boxes compared with the base); the longer tooltip stays inside the window (`placeTooltip`); the retry glyph, hover and focus ring are as in `weather-tile-retry.md`; reduced motion changes nothing; the only new strings are the age sentence (description/tooltip) and the storage error text.
- Verified by: E2E `dg-88` (geometry diff against `--base origin/main`); design review for the strings.

## Affected earlier scenarios

`10-weather-grid-states` (stale tile description text gains the age sentence; assertions on the exact stale description are updated, never deleted), `dg-54-weather-tile-retry` (stale descriptions in retry cases; the hanging-boot case it documents as "forever" is now a timeout), `dg-47-city-error-ux` and `dg-84-city-modal-focus-copy` (modal error texts: a storage failure now has its own text; any scenario that stubs a rejecting `sync.set` and expects `Couldn't load weather` is updated to the new text), tests and scenarios that script the reads of the city key or count them (`weather-tile-retry.md` "boot reads the location twice", dg-54, the scripted "rejecting location store, then a working one" cases): the guard of decision 4 adds one `getLocation` read on the fetch path, so such counts are updated, never deleted; `dg-37-write-failure` (widgets writes: unaffected, control). Pinned values and source pins in `test/newtabSource.test.js`, `test/weatherSource.test.js`, `test/weatherTiles.test.js`, `test/weatherService.test.js` are updated, never deleted; each change is named in the commit message. `dg-85` (AS-CSL-08) and `dg-86` (AS-LLW-04/05) are red on clean `main` on the Mac (backlog 135): new scenarios do not rely on them.

## Review focus

- **Scenarios/states:** the boot timeout interacting with generation and token (a city change during the 15 s, a retry press right after the timeout, a late answer after either); `weatherLocation`/`weatherLocationError` consistency after boot success, boot failure and retry; the service re-read in decision 4 on every `initialize()` path (fresh cache, no location, fetch failure with stale cache, retry); no regression of "a failed city change keeps city and tiles".
- **Visual/layout:** none expected; geometry of every state equals `main`; only the stale tooltip text is longer (edge placement at 500 / 320 / 1280×300).
- **Accessibility/texts:** the age sentence in tooltip and in `aria-describedby` (tone, order, no duplicated period), the storage text in the existing alert slots, no technical words; no re-announcement caused by the new description.

## Accepted exceptions

1. The age sentence is computed at render and is not refreshed while the tab stays open (the next render, retry or reload recomputes it).
2. The window between the stored-city re-read and the cache write in decision 4 remains (a city change inside that gap can still produce one foreign write; the next successful load of the stored city overwrites it).
3. A hung boot load is treated as failed after 15 s even if the network answers at 16 s; the user retries (the same rule as the city change and the retry).
4. A `getLocation`/`getCache` read failure keeps the generic text.
5. Two cities with the same `name` (Paris FR / Paris TX) are not told apart by the decision 4 guard (the cache keys on `name`, as today).
6. A hung boot with a stale cache shows error tiles, not the stale values (Ruling in decision 1).
7. The age is read as "2 h ago" by a screen reader; no expanded unit words, no upper bound on N ("400 d" is allowed).
8. If the city changes in another tab while a boot fetch runs, this tab keeps the fetched city's tiles until its next mutation or reload (no storage listener, as today); the cache is not written (decision 4).
9. The store's `Invalid weather location` rejection (unreachable from the UI: coordinates come from geocoding or the browser) shows the same `Couldn't save your city. Try again in a moment.`; unit test only.

## Non-goals

- Re-fetching on tab visibility or `online` (Р50), periodic refresh of the age text, a force-refresh bypassing a fresh cache.
- Any change to tile faces, the retry control, the 30 min cache rule, cache schema/version, request count, or the classified texts other than the new `storage` kind.
- Aborting the underlying `fetch` of a timed-out call (the call is not cancellable; its late answer is ignored in the UI and guarded in the service).
- City modal layout, suggestion list, wizard flow, typography and vocabulary (Р49), Chrome Sync edge cases (Р51).
- Any storage change.

## Review rounds

Revision 1: stage 0 author.
Revision 3 (stage 2, after `reports/weather-reliability-spec-review-2.md` and spec gate r1 on revision 2): N-1 and gate L0-02 AS-WRL-02 cases (b) and (b2); N-2 test doubles in AS-WRL-02 (Batumi, `delayFor`, `answerHung` order); N-3 plan header and E2E groups; gate L0-01 decision 4 result location and exception 8; gate L0-03 exception 9 (`Invalid weather location` text). Rejected by the skeptic: L0-04, L0-05.
Revision 2 (stage 2, after `reports/weather-reliability-spec-review.md` and spec gate r1): I-1 stale rows reachable only from 30 min (AS-WRL-04, decision 3 note); I-2 AS-WRL-05 cache assertion instead of an offline stale reload; I-3 Ruling plus AS-WRL-01b and Accepted exception 6; I-4 races added to AS-WRL-02; I-5 slow-success block in AS-WRL-01; M-1 decision 1 wording; M-2 decision 4 scope; M-3 exception 5; M-4 affected scenarios; M-5 decision 5 wraps any `setLocation` rejection; M-7 decision 2 note; M-9 / L0-07 exception 7; L0-03 AS-WRL-07 tooltip at edges; L0-04 silent timeout transition stated. M-8 (documents) is in the plan, Task 4.
