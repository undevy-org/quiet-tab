# Architecture

## Overview

Quiet Tab is a Manifest V3 extension with no service worker. The new tab page
(`src/newtab.js`) owns rendering directly. The page is one full-viewport,
macOS-style desktop grid: links, the four weather tiles and two fixed "chrome"
tiles (Settings and Add) are widgets placed on 2D cells (widgets store and
service); live weather data has its own small service/store pair. The widgets
layout and the chosen weather city persist to `chrome.storage.sync`; the weather
forecast cache and a per-device "city prompt dismissed" flag persist to
`chrome.storage.local`.

## Components

| File | Responsibility |
| --- | --- |
| `src/newtab.js` | Renders the desktop grid (links, weather tiles, the "Set a city" hint tile, the Settings and Add tiles), edit mode (jiggle, − badges, pointer drag with drop highlight and autoscroll), the desktop dialogs (add link, edit link without a Delete button, delete confirm, hide-weather confirm, weather edit), the Add menu, the page status line, the shared tooltip layer and the city modal, and wires them to the services. The only file that touches the DOM. |
| `src/desktopLayout.js` | Pure grid engine: grid metrics and the (always even) column count for a viewport width, grid validation (`isValidGrid` with a signed `x`), the stored/displayed frame (`originColumn`, `toStored`, `toDisplayed`), the displayed layout (`displayLayout`, a stateless anchored repack of the stored grids for the current column count), placement rules (`canPlace`, `placeResized`, `placeNew` nearest to the center, `cellFromPoint`), the default block (`placeMissing`, with the vertical centering of its first placement: `centeredDefaultRow`, `defaultBlockRows`). |
| `src/desktopUiState.js` | Pure UI state for edit mode, the Add menu, the open dialog and an active drag, the Escape layering (`escapeLayer`) and the tab-return re-read rules (`deskRefreshBlocker`: which layer is up; `deskRefreshDecision`: skip, pending, again or apply). |
| `src/widgetsStore.js` | Validates, reads, and writes persisted widgets state (links, weather metrics and chrome tiles, each with a `grid`), sharded across `chrome.storage.sync` keys; reads are lenient about a missing or malformed `grid`. Also holds `ensureWidgetsLayout` (defaults and self-heal), `inspectWidgetsMeta` (`missing|valid|newer|invalid`; a v1/v2 meta is `invalid`) and the write guard (`assertWritable`) that refuses `newer` and `invalid` metas (only `valid` and `missing` are writable). |
| `src/widgetsService.js` | Add/update/delete for links, `updateWeatherMetric` (size, shown/hidden) and `moveWidget` (drop at a cell, `PlacementError` when the block is taken). Every mutation takes the current column count, runs under the mutation lock, checks `assertWritable` first, applies the action to the displayed layout of fresh storage and persists the displayed grid of every widget. |
| `src/widgetsShared.js` | Shared widget constants (types, weather metric ids, caps, lock name, newer-version message). |
| `src/widgetsLayout.js` | `placeTooltip` (edge-aware tooltip placement). |
| `src/favoritesShared.js` | Shared favorites constants (icon modes, color sources, tile sizes) and helpers. |
| `src/favoriteIcon.js` | Chooses a favicon, custom image, or letter icon for a tile. (The default-globe check on top of it lives in `defaultFavicon.js` and `newtab.js`; see `docs/favicon-globe-fallback.md`.) |
| `src/defaultFavicon.js` | Tells Chrome's grey default `_favicon` globe from a real icon: pure exact-pixel comparison (`isDefaultFaviconPixels`), a per-page-load checker (one sentinel image, 2 s timeout, fail open) and an in-memory verdict cache. |
| `src/favoriteColor.js` | Derives a tile's accent color from its domain or a sampled icon. |
| `src/browserGeolocation.js` | Wraps `navigator.geolocation.getCurrentPosition` with a deadline race and maps failures to `BrowserLocationError` codes (`denied`, `unavailable`, `timeout`, `unsupported`). |
| `src/cityLocation.js` | Pure helpers: `roundCoordinate` (two decimals) and `locationErrorMessage` for the wizard and change-modal locate flow. |
| `src/weatherApi.js` | Calls Open-Meteo's forecast, air-quality, and geocoding endpoints, reverse-geocodes coordinates via Nominatim (`reverseGeocodeCoordinates`), normalizes responses, maps UV index and US AQI values to scale labels, and classifies failures (`details.kind`) into fixed user-facing texts via `weatherErrorMessage`. |
| `src/weatherStore.js` | Validates, reads, and writes the chosen location and the forecast cache, and reads/writes the per-device city-prompt-dismissed flag. |
| `src/cityPrompt.js` | Pure rules for whether the onboarding wizard may open on this page load (`onboardingWizardPossible` / `shouldShowOnboardingWizard`). |
| `src/onboardingWizard.js` / `src/onboardingStore.js` | First-run two-step wizard (city, then starter links) and the `quietTabOnboardingWizardComplete` local flag. |
| `src/onboardingLayout.js` | Pure: the island table per starter-link count (k = 0…8), `isFreshDesk(items)` and `islandPlacements({ k, linkIds, rows, columns })` for wizard Finish. |
| `src/weatherService.js` | Serves a fresh cached forecast or fetches and caches a new one; resolves a typed city name to a location. |
| `src/weatherShared.js` | Shared weather constants (the 30 minute cache rule, `WEATHER_CACHE_TTL_MS`). |
| `src/weatherPresentation.js` | Formats readings and picks each tile's color tone. |
| `src/weatherTiles.js` | Pure presentation of one weather tile (label, primary and secondary text, tone, description) for the loading, ready, stale and error states; for error and stale it also carries the retry phase (`ready`, `retrying`, `cooldown`) and the busy text. |
| `src/weatherUiState.js` | Pure state for the city modal (closed, or open in first-run or change mode), its live suggestion list, the weather retry sub-state (attempt in flight, earliest next attempt, outcome of a result), and `weatherRefreshDue` (when a returning tab refreshes the weather). |
| `src/icons.js` | Vendored, static SVG icon set. |
| `src/mutationLock.js` | Serializes mutations with the Web Locks API, with a promise-chain fallback. |
| `src/storeUtils.js` | Shared validation, cloning and value-equality (`isSameValue`) helpers. |

## Widgets Storage

Widgets sync across devices via `chrome.storage.sync`, which caps a single
key at 8KB — too small to hold all 200 possible links in one blob. Storage
is sharded instead (layout version 3):

- `quietTabWidgetsMeta` — `{ version: 3, order: [id, ...], createdAt, updatedAt }`.
  `order` is the stable iteration order and the tie-break of the repack (never
  trust `chrome.storage`'s object-key iteration order); it is not the layout.
  Version 1 also stored `columns` and `position`; both are gone. Version 2 counted
  `x` from the left column; version 3 counts it from the center line (below).
- `` `quietTabWidget:<id>` `` — one key per widget, each with a `type` and a
  `grid: { x, y, w, h }` (cell coordinates; `w` and `h` are 1 or 2; `x` is a
  signed integer counted in columns from the center line of the grid, `y` from
  the top row):
  - `favorite` — a link (URL, label, icon mode, color);
  - `weather-metric` — `{ id, type, enabled, grid }` with one of four fixed ids
    (`weather:temperature`, `weather:precipitation`, `weather:airQuality`,
    `weather:uv`); hidden is `enabled: false` (no cell, its grid is a placeholder).
    A metric stores only its place, size and shown/hidden flag; the values come
    from the weather cache at render time;
  - `chrome` — `{ id, type, role, grid }`, `chrome:settings` and `chrome:add`,
    always 1×1. They can be moved but never deleted or hidden.

Caps: 200 links, 4 metrics, 2 chrome tiles (206 widgets in all).

**Reading a grid.** An item whose other fields are valid but whose `grid` is
missing, malformed or out of range is kept and shown "unplaced": the read drops
the bad grid, never the item or its key. Items with invalid other fields are left
out of the read state as before. Writing an invalid grid is rejected.

**Centered frame.** The center line is the boundary before column
`originColumn(C) = floor(C / 2)`, which for the even `C` below is exactly the
middle of the window. Displayed column = stored `x` + origin; every write stores
displayed − origin for the `C` it was computed at (`toStored`/`toDisplayed`). A
fresh install therefore stores the default row at `x` −4..3 (temperature −4,
precipitation −3..−2, air quality −1..0, UV 1, Settings 2, Add 3) and it is drawn
in the middle at every width.

**Displayed layout.** The grid shows `displayLayout(stored widgets, C)`, where
`C` is the column count that fits the viewport (even, 2 or more, no upper limit,
from `document.documentElement.clientWidth`; the cell size, gap and padding come
from the same width and are set by `newtab.js`, not by CSS media queries; a width
that would fit an odd count gives one edge column to the margins). Widgets are
taken in `(y, x, order)` order; each is tried at its anchored cell (stored `x` +
origin) and keeps it if the block fits and is free, else takes the first free
block scanning its own row from the nearest column that fits (`clamp(anchored, 0,
C − w)`) to the right, then the rows below from column 0. Unplaced widgets follow
by the new-tile rule. It is a pure function of the stored grids and `C`: viewport
changes never write; widening or narrowing the window adds or removes columns on
both sides and the tiles keep their distance from the center, and a row that does
not fit a narrow window wraps from the left.

**Placement.** A new link, a restored metric and an unplaced widget take the free
block nearest to the center line in the first row that has one (`min |x + w/2 −
C/2|`, ties to the right). A resized tile keeps its cell when the block fits, else
scans its own row from its own column to the right, then the rows below. The
defaults and the self-heal (`placeMissing`, stored frame in and out, over 12
reference columns) lay the missing tiles out as one contiguous row block, in the
default order, in the first row with a free run of that width, nearest to the
center. The first placement of the whole default block (all six absent) takes its
row `Y0 = max(0, floor((R − blockRows) / 2))` from the first screen (`R` rows of
`viewportRows`, `blockRows` the displayed height of the six tiles at the page's
column count) instead of row 0, searching by distance from `Y0` (above first); the
self-heal of 1..5 tiles and `placeNew` stay row-0 first, and a stored `y` is never
recomputed.

**Writes.** Every explicit action (drag, add, edit, resize, delete, hide,
restore) is a read-modify-write under the mutation lock: read fresh storage,
compute the displayed layout for the current `C`, apply the action to it (a drop
on a block that is taken in fresh storage is rejected) and persist the displayed
grid of every widget in one batched `set()`, then remove the keys of deleted
widgets. Editing while the window is narrow therefore re-bases the stored layout
to the narrow arrangement. `getState()` tolerates a `meta.order` entry whose item
key hasn't propagated from another device yet by filtering it out; the next write
drops that id from `order` (and removes its key), so an item that arrives after that
write is no longer listed. There
is no `storage.onChanged` listener: a tab that is open while another writes shows
stale data until its own next action, until it is shown again (see Concurrency) or until a reload.

**Bootstrap.** Before the first read, `newtab.js` reads the raw meta
(`inspectWidgetsMeta`: `missing|valid|newer|invalid`) and then runs, under the same
mutation lock as every mutation:

1. `ensureWidgetsLayout()`: adds any missing weather metric and chrome tile as one
   block (see Placement) with the default sizes (temperature 1×1, precipitation
   2×1, air quality 2×1, UV 1×1, Settings and Add 1×1), item keys before the
   meta; idempotent. The call receives the first screen of this boot,
   `ensureWidgetsLayout(sync, { screen })` with `screen = { rows, columns }` from
   `firstScreen()` in `newtab.js`. On a fresh install this creates temperature
   (−4,Y0), precipitation (−3,Y0), air quality (−1,Y0), UV (1,Y0), Settings
   (2,Y0), Add (3,Y0), with `Y0` the centered row of the first screen (4 at
   1280×800); without a valid `screen`, or for a partial self-heal, the row is 0.
   It writes nothing for a newer or invalid meta. A write failure is non-fatal: the
   grid renders without the missing tiles and the page status line says so until the
   next open retries.
2. `getState()`.

There is no migration (removed in run 40, `docs/remove-migrations.md`): keys of
earlier versions (the favorites-only `quietTabFavoritesMeta`,
`quietTabFavorite:<id>` and `quietTabFavorites`) are neither read nor deleted, and
a v1 or v2 widgets meta is read as `invalid`.

A meta whose `version` is newer than this build understands (written by a newer
version on another device) is never touched: the ensure step writes and deletes
nothing, every service mutation fails first with the newer-version message
(`assertWritable`), and the grid is locked read-only with that message, also after a
resize. Every write is likewise refused while the stored meta is invalid (malformed,
or a v1/v2 meta of an older build), with a message to reload the tab: from such a
meta a read is empty, so a write would orphan every stored widget. A build from
before the centered grid reads a v3 meta the same way (newer, read-only), as a build
from before the desktop grid does with a v2 or v3 meta. An invalid meta is left alone
by the ensure step.

`manifest.json` pins the extension id with a `key` (see "Extension id" below), so
separate "Load unpacked" installs from different directories get the same id on
every machine. Chrome Sync still applies only to a browser signed into the same
Google account with sync enabled; it is not a property of the id.

## Weather

The chosen location (`quietTabWeatherLocation`: name, country, latitude,
longitude) is stored in `chrome.storage.sync`. The last forecast
(`quietTabWeatherCache`) and the city-prompt flag (`quietTabWeatherPromptDismissed`)
are stored in `chrome.storage.local`. Only the exact value `true` counts as
dismissed; the flag is per device and not synced.

Weather values are not part of the widgets store. Each metric tile in the grid is
matched to the forecast by its metric id at render time; the grid re-renders when
the forecast arrives. A 2-wide tile shows the primary and secondary values, a
2-high one larger type and the city name; type sizes follow the cell size.

1. `initialize()` reads the location. With none set, no weather tile is drawn and
   the first shown metric's cell holds one "Set a city" hint tile (unless all four
   metrics are hidden); the other metrics' cells stay reserved. In normal mode the
   hint opens the city modal; in edit mode it stands for its metric.
2. If the cache belongs to the same location and is under 30 minutes old, it
   is shown without any network request.
3. Otherwise the service fetches the forecast and air quality in parallel and
   caches the result. If that fails but an older cache for the same location
   exists, the tiles show it marked as stale (dashed border). With no cache the
   tiles show an unavailable state and their descriptions carry the user-safe error text.
   Failures are classified, never echoed: `weatherApi.js` tags each `WeatherApiError`
   with `details.kind` (`network`, `timeout`, `http`, `notFound`, `storage`, otherwise unknown) and
   wraps a rejected `fetch` as `network`; `weatherErrorMessage(error)` turns the kind
   into a fixed calm text, so `result.error` and the city modal's error slot never
   hold a browser or developer message. A rejected write of the city (`setLocation`) is
   wrapped by the service as kind `storage`: `Couldn't save your city. Try again in a moment.`
   The boot load runs under the same 15 s guard as the city change and the retry: a hung
   request ends in the retryable error tiles. A stale tile's tooltip and description say how
   old the data is (`Couldn't refresh — showing saved data. Updated 2 h ago. ...`; relative,
   computed at render, the tile face is unchanged). Before the cache is written, `initialize()`
   re-reads the stored city and skips the write when it is no longer the one the forecast was
   fetched for (no foreign cache). `docs/weather-reliability.md`.
4. Setting a city, from the city modal, geocodes the typed name (Open-Meteo returns English place
   names), stores the resolved location, and fetches a fresh forecast. **Use your location** (wizard
   step 1 and change mode only) asks the browser for a position, rounds it, reverse-geocodes via
   Nominatim, and fills the field through the same suggestion-choose path; nothing is stored until
   Continue or Save. Choosing a
   suggestion only fills the field; Save then stores that city without a geocoding
   request (editing the text drops the choice, so Save geocodes it instead). The
   modal is opened by the hint tile, by the weather edit dialog's city-field (a single
   button in the City row showing the stored city and a `Change` / `Set a city` hint; change mode,
   stacked over that dialog; in change mode the input is prefilled with the stored city, so Save
   without editing re-selects it by its coordinates), or automatically
   (first-run mode). While a request runs the field and buttons are disabled; on
   failure the modal stays open, keeps the typed text and shows the error. Save is
   always visible and is disabled while the field is empty; Enter in an empty field
   shows "Enter a city name" without a request.

### Retry from a tile

An error or stale tile in normal mode is one native button, `Retry <Metric>`. Pressing it runs
ONE attempt for every tile, through `weatherService.initialize()` (with the run-48 cache guard): it re-reads the
city, serves a cache that another tab refreshed in the meantime (no request: a cross-tab effect;
there is no `onChanged` listener) or fetches again. There is no way to force a refresh of a fresh
tile; a tile whose data has become 30 minutes old is refreshed when the tab is shown again (next
subsection). `retryWeather()` in `newtab.js` wraps the call in the same 15 s `withTimeout` as a city
change; a thrown or timed-out attempt never replaces the tiles' result and its late answer is
dropped by a token. The generation rule is the one of boot and city change: a successful city
change bumps the token and the generation and resets the retry state, so a late result cannot
overwrite the new city. While an attempt runs, and for 3 s after it failed, further presses are
ignored (`aria-disabled`, never `disabled`, so focus stays); the end of the pause updates the
existing nodes in place, without a re-render. A failure shows the result's user-safe text in
`#desktop-status` (it never displaces the persistent ensure message, and is then spoken through
`#desktop-live`), a success announces `Weather updated`. If the city was removed elsewhere
(`no-location`) the hint tile replaces the metric tiles and takes focus. Nothing is stored for
retry; a retry only writes the cache that `initialize()` already writes.

### Refresh on return

When a tab becomes visible again (`visibilitychange` to `visible`), and when the browser reports `online` while the tab is
visible, `newtab.js` starts the same attempt as a retry press if the shown weather is due: an error, a stale result, or a
`ready` result whose data is 30 minutes old or more (`weatherRefreshDue`; the 30 minutes is `WEATHER_CACHE_TTL_MS` in
`weatherShared.js`). Nothing is polled or repeated on a timer, and once a tab has loaded, a hidden tab starts no attempt. A
return does not try while `navigator.onLine` is `false`; an `online` event ignores the 3 s pause after a failed attempt; an
attempt in flight blocks both. The automatic attempt is silent: it never writes `#desktop-status` and never calls
`announce`, and a `ready` tile shows no busy state. `docs/tab-return-refresh.md`.

### Onboarding wizard (first run) and city modal (change mode)

- **First-run rule.** The decision is taken once per page load, **before** the first
  grid render. `onboardingWizardPossible` checks the same gates as the old first-run
  city prompt except it does not require an unset city; `shouldShowOnboardingWizard`
  also requires `quietTabOnboardingWizardComplete` false, `quietTabWeatherPromptDismissed`
  false, and a single capped `chrome.storage.local` read (250 ms) of both keys. When it
  opens, `#onboarding-wizard` shows step 1 (city) then step 2 (starter links); Finish
  writes `quietTabOnboardingWizardComplete` and never writes the weather dismissed flag.
  Reload or a new tab before completion reopens step 1 (no persisted step or checkbox
  draft). Spec: `docs/onboarding-wizard.md`.
- **Finish island.** Finish makes one `widgetsService.addFavorites(inputs, { columns, island: { rows } })`
  call (also with zero links) in `layOutFinishIsland` (`src/newtab.js`). On a fresh desk (no favorite, all
  six system tiles at their default sizes, all metrics enabled, temperature first; `isFreshDesk`) that fits
  the window (`W <= columns`), the one `setState` writes the system tiles and the new links in the cells of
  the fixed island table (`src/onboardingLayout.js`, `islandPlacements`), centered with the stored `dx` and
  `centeredDefaultRow(rows, H)`; otherwise the links go by `placeNew` as 2×1 and nothing else moves. A call
  that adds nothing and applies no island is a no-op (no write). With zero links a failed call is swallowed
  (the desk keeps the boot strip) and no heal runs, so a wiped storage stays unwritten. Reload and resize
  never re-pack. CSS: `scroll-margin: 6px` on `.desktop-grid > [data-widget-id]` keeps a focused tile's ring
  in the window. Spec: `docs/post-onboarding-grid.md`.
- **Veil and reveal.** While the wizard is open the desk uses the same veil/reveal as
  `docs/first-run-empty-desk.md` (`showOnboardingWizard` / `hideOnboardingWizard`).
- **Change-mode city modal.** Unchanged: `#city-modal` from the hint tile or weather
  edit dialog; `quietTabWeatherPromptDismissed` is not written by the wizard.
- **Dismissal (change mode only).** Backdrop clicks in the first 300 ms after opening
  are ignored.
- **Layout.** The dialog holds the city field with a clear button (shown while the
  field has text and no request runs), then the error line, then the modal actions
  row: Cancel and Save in change mode (50/50 with icons). The wizard step 1 footer is
  Skip | Continue; step 2 is Back | Finish. Change
  mode has no "Current: …" line; the field is prefilled with the stored city (caret at
  the end), first-run starts empty. Typing
  two or more characters opens the suggestion list as an absolutely positioned
  popover over the dialog, so the dialog does not move. When under 96px is free
  below the input (measured as if the list were an overlay) the list is docked in
  the dialog's flow instead and the dialog scrolls.
- **Error line.** The error text lives in one `role="alert"` node inside a feedback
  block with no reserved height: it is empty (height 0) at rest, so the buttons are
  16px under the field, and an error adds 8px above and 16px below its text, so
  the dialog grows when an error appears and shrinks when it goes (the field and the
  buttons move; there is no `feedbackReserve`, `--city-feedback-reserve` or `compact`
  state). `placePopover` runs again after an error is shown or cleared, and keeps only
  the docked/overlay suggestion list logic. Editing
  the field (typing, pasting, deleting) or pressing the clear button empties and hides
  that node; nothing else clears it besides opening the modal and starting a request.
- **Keyboard.** ArrowDown in the field moves into the list; ArrowDown/ArrowUp move
  between suggestions and ArrowUp from the first returns to the field. Tab never
  walks the suggestions (run 45): the options and the listbox are `tabindex="-1"`, so
  Tab from the field goes clear, Cancel/Skip, Save/Continue whatever the number of
  suggestions, and `tabTrapFocusables` leaves `role="option"` buttons out.
- **Combobox semantics (run 45).** The city input is `role="combobox"`
  (`aria-autocomplete="list"`, `aria-haspopup="listbox"`, `aria-controls=weather-city-suggestions`,
  `aria-label="City"`) and `aria-expanded` always equals "the list has options"
  (`renderSuggestionsList` writes it in both branches, so every close path keeps it in step).
  The list is `div#weather-city-suggestions[role=listbox][aria-label="City suggestions"][tabindex=-1]`,
  present (hidden by `:empty`) even with no options; each suggestion is a
  `button[role=option][tabindex=-1]`. Real focus moves onto the options by the arrow keys
  (no `aria-activedescendant`). Spec `docs/city-suggestion-list.md`.
- **List focus rule.** The list closes only when focus leaves the field wrapper
  (field, clear button and list), not when the window loses focus. A pointer press
  inside the dialog (Save, Not now/Cancel) does not close it before the click is
  delivered; it closes after the release. After choosing a suggestion, a click
  with a pointer (not Enter/Space) on the backdrop, Not now/Cancel or Save within 350 ms is
  ignored, so the second click of a double click cannot dismiss or submit.
- **Background.** While open, the grid is `inert` (and, when stacked, the weather
  edit dialog under it), so the modal is the only interactive region. While the
  wizard or first-run overlay is open the desk is also veiled: `#favorites[data-veiled]` is
  `visibility: hidden`, one screen high with no scroll, so no tile is painted,
  hit-testable, focusable or in the accessibility tree (the tiles stay in the DOM);
  the change-mode city modal never veils. On close, unless
  reduced motion is on, `#favorites[data-reveal]` runs one `desk-reveal` fade
  (opacity 0 to 1, 200 ms, ease-out), ended by the desk's own `animationend` with a
  400 ms fallback timer.
- **Focus.** In change mode focus moves to the city field at once; the wizard step 1
  city field never takes focus by itself. Tab wraps inside the active step; while a
  city request runs on step 1 every control is disabled. On wizard completion, focus
  returns to the Settings tile when the wizard had focus; change-mode close returns
  focus to the opener.
- **Busy.** While a city request runs the modal ignores every closing gesture,
  and Escape does nothing at all (it does not close the dialog behind it).

## Desktop grid UI

Tiles take one of four footprints (1×1, 1×2, 2×1, 2×2; chrome tiles 1×1 only), exposed on the DOM as `data-w` / `data-h`.

- **Normal mode.** A link tile opens its URL; the hint tile opens the city modal;
  Settings enters edit mode; Add opens the add-link dialog. A click on the
  background does nothing.
- **Edit mode** (Settings, `aria-pressed`): tiles jiggle (not with reduced
  motion), links and weather tiles get a − badge (links: Delete link? confirm; weather:
  Hide <metric>? confirm, `confirm-hide-weather`, Cancel focused, one write on Hide), a tap on a link or weather tile opens its edit dialog (link: URL, name,
  icon, color, size; weather: city-field and size), and any tile can be dragged.
  The whole window is the drop area: the pointer anywhere (side margins, above the
  grid, below the last row) targets the nearest allowed cell, `x` within the columns
  and `y` at most `maxDropRow` (every row of the first screen, `viewportRows`; below
  it at most one row below the lowest other tile; a tile may always stay in its own
  row or move up). A drop highlight is always drawn on that cell (dashed error
  outline only when it is occupied). While dragging the grid is as high as that
  area needs, so a drop inside the window never scrolls. An occupied drop returns
  the tile and writes nothing. Escape, a viewport change, a pointer cancel, a
  window blur, leaving the window or leaving edit mode cancels a drag. Settings, a
  background click or Escape leaves edit mode.
- **Add.** In edit mode with at least one hidden metric, Add opens a menu
  (`role="menu"`, "Add link", "Add weather tile…" → one item per hidden metric);
  otherwise it opens the add-link dialog. A new link and a restored metric take the
  free block nearest to the center line (focus returns to the Add tile after an
  add).
- **Dialogs.** One at a time, `role="dialog"`, `aria-modal`, focus trapped, the
  grid inert; a write failure inside a dialog is shown in its alert line; a failed
  drag, delete, hide or restore is shown in the page status line (`role="alert"`,
  cleared by the next action or after 8 s) and nothing is persisted.
- **Layers and the low window** (`docs/layers-low-window.md`). The page status
  chip (`#desktop-status`) is not painted while any modal layer is in the DOM (a
  dialog, the city modal, the wizard): `body:has(.desktop-dialog, .city-modal)`
  makes it `opacity: 0; pointer-events: none`, so it stays in the accessibility
  tree and keeps its box. While it exists, `newtab.js` writes `--status-reserve`
  (its height plus the bottom offset, 0 when hidden) from a `ResizeObserver`; it
  feeds only the `.desktop` bottom padding and the root `scroll-padding-bottom`,
  never a layout input or storage. A dialog taller than the window scrolls
  (`data-scrolls="true"`, kept by a `ResizeObserver` on the dialog and its form):
  only then the Cancel | Save footer is sticky (`bottom` is negative by the card
  padding because Chromium measures it from the content box), with an opaque panel
  and a 1px divider; a dialog that fits is unchanged. `scroll-padding-bottom` of
  the dialog is the footer's box and `scroll-margin: 5px` keeps a focused control's
  ring in view; a shown error is scrolled above the footer without moving the
  field's focus. A dialog closes in one of two modes: without a write that moves
  anything (Cancel, Escape, backdrop, failure, Add link) focus returns with
  `preventScroll`; after a successful Save, Delete, Hide or a gone-link recovery
  the target is also brought in by the nearest edge when it is not safely inside
  the window and above the chip.
- **DOM order and focus.** Tiles are in `(y, x)` order of the displayed layout,
  each − badge right after its tile; after a delete or hide focus moves to the next
  tile, else the previous, else Settings.
- **Escape order** (one document handler): drag, tooltip, city suggestions, city
  modal, dialog, Add menu, edit mode.

## Tooltips

One `#tooltip` element (`role="tooltip"`, `position: fixed`) lives on `body`,
outside every scrolling container, and is shared by the weather tiles and the
1×1 "Set a city" hint. In normal mode only, it shows on pointer hover and on
keyboard focus (`:focus-visible`), copies the text of the tile's hidden
description node (`[data-tooltip-text]`) or, for the 1×1 hint, which has no text
node, its `data-tooltip-label` (`docs/typography-copy.md` decision 6), and is
placed by `placeTooltip`: above the tile when there is room, otherwise below,
centered on the tile and clamped to an 8px margin inside the viewport. It hides on leave,
blur, Escape, grid scroll (except the scroll caused by focusing a tile), wheel,
touch scroll, window resize, entering edit mode or a drag, and every grid render.

## Concurrency

Multiple new tab pages can exist at once. Widgets mutations (and the bootstrap)
are serialized
with the Web Locks API using one extension-wide lock name. A promise-chain
fallback provides deterministic behavior in environments without Web Locks
and in Node.js tests.

An open tab never listens to storage changes; it re-reads the grid once when it is shown again (`refreshDeskOnReturn`, `docs/tab-return-refresh.md`): the raw meta is inspected (a `newer` or `invalid` one leaves the tab as it is), `getState()` is read, and the pure `deskRefreshDecision` says what to do with the result: show it (an equal state draws nothing, a state without Settings is healed by `healClearedDesk` under the busy lock); drop it and wait while a layer is up (an open dialog, edit mode with a drag or the Add menu, the city modal, the first-run wizard, a write in flight) or before the first render, the postponed re-read then starting one animation frame after the last layer is gone; or, when this tab's own state changed during the read, drop it and read once more. When its next mutation (Save, Delete, a drop) targets a link that another tab deleted, the service throws `LinkGoneError`; `runDesktopMutation` then re-reads storage without writing, redraws from it, closes the dialog, focuses the neighbouring tile and shows the message in the alert status (`recoverFromGoneLink`). If that re-read finds no Settings tile (another tab cleared the whole storage), the recovery heals the desk with `ensureWidgetsLayout` for the first screen of that moment, reads the state again and focuses Settings; a failing heal leaves the grid as it is until a reload (`docs/stale-tab-empty-state.md`). Since run 30 one helper (`healClearedDesk`) serves every write: a missing weather metric id also raises `LinkGoneError`, a state returned by any mutation without a Settings tile (Add link into a cleared storage) is healed, the heal always re-reads, a successful heal says `Your layout was reset in another tab.`, and a failed one shows a persistent message, leaves edit mode and focuses `#favorites` (`docs/stale-tab-recovery-followups.md`). The failure chip carries a Reload button and Escape (the lowest `escapeLayer` layer, `status`) dismisses it, the reset notice uses the neutral `desktop-status--info` tone, the first-run wizard heals after writing its starter links, and a heal drops a weather city the storage no longer has (`docs/stale-tab-closeout.md`).

## Stylesheets (new tab)

The new tab page loads CSS in dependency order from `src/newtab.html`:

| File | Role |
| --- | --- |
| `design-tokens.css` | Color, typography, spacing, radius, shadow, and focus tokens (light/dark), including Phase 2 grid/page chrome tokens (`--radius-tile`, `--space-grid-*`, status chip, weather cell type). |
| `controls.css` | Overlay controls: buttons, inputs, segmented groups, add-menu rows, city field, and each control's own base focus style. |
| `surfaces.css` | Dialog and modal shells, backdrops, popovers, and the focus rings scoped to `.desktop-dialog` / `.city-modal`. |
| `newtab.css` | Desktop grid, tiles, weather presentation, tooltip, page chrome (Phase 2: grid radii, shadows, spacing, and typography via tokens). |

Public spec: [`docs/design-system.md`](design-system.md) (phase 1: controls + surfaces; phase 2: grid/tile/page chrome in `design-tokens.css` + `newtab.css`).

## Extension id

`manifest.json` pins the extension id with a `key` (the public key, base64 of the DER, one line; no `BEGIN`/`END`
lines). The key comes from the Chrome Web Store Developer Dashboard (draft listing, Package tab, "View public key"),
so the id is the one the Store assigns: `dbcdpffdgfbjmdlomgheeijfkkjkhmma`. Chrome derives the id from the key (first 16 bytes of the SHA-256 of
the DER, each nibble mapped to `a`-`p`), so every unpacked copy of the repository gets the same id on every machine;
without a `key` an unpacked extension gets an id derived from its folder path.

The id is used in one place: `initiatorDomains` of `rules/nominatim-user-agent.json`. The rule sets the identifying
`User-Agent` on requests to `nominatim.openstreetmap.org`. `declarativeNetRequestWithHostAccess` already keeps it from
firing for pages on hosts the extension has no permission for, but a page on one of the permitted hosts (the Open-Meteo
ones) could still trigger it; `initiatorDomains` limits it to requests whose initiator is this extension.
`test/manifest.test.js` derives the id from the key and requires the rule to name exactly that id; E2E
`dg-63-nominatim-ua-wire.mjs` sends requests from the new tab page, from an ordinary page and from an Open-Meteo-host
page to a local server standing in for Nominatim and reads the `User-Agent` there.

Changing the key changes the id, so the key and the rule are changed together, and the key in the E2E harness
(`PROD_KEY`) with them.

**Publishing:** remove `key` from the `manifest.json` in the zip before uploading to the Web Store (the Store already holds the key of this listing and assigns the same id, so
nothing needs to be reconciled). Do not remove it from the repository.

## Security Boundaries

- User-provided text (favorite labels, city names) is rendered with DOM text
  nodes, never `innerHTML`. The only `innerHTML` use is `icons.js` inserting
  its own static, vendored SVG paths.
- Favorite and custom-icon URLs must use `http:` or `https:`; anything else
  is rejected during normalization.
- Custom-icon images are never sampled into a canvas, since arbitrary hosts
  rarely send CORS headers.
- Persisted state is schema-validated: on read, a malformed widget is left out
  (a widget whose only fault is its `grid` is kept, unplaced), a malformed meta
  reads as an empty grid, and a malformed location or cache reads as unset; on
  write, invalid state is rejected with an error.
- The extension has no content scripts, remote code, background worker, or
  broad host permissions; host access is Open-Meteo's three public endpoints and
  Nominatim (`nominatim.openstreetmap.org`) for reverse geocoding when the user
  activates **use your location**. The `declarativeNetRequestWithHostAccess`
  permission only lets one static rule set the identifying `User-Agent` header
  on requests to that host that the extension itself makes (see "Extension id").
