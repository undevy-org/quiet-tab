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
| `src/desktopLayout.js` | Pure grid engine: grid metrics and the (always even) column count for a viewport width, grid validation (`isValidGrid` with a signed `x`, `isValidGridV2` for the v1/v2 readers), the stored/displayed frame (`originColumn`, `toStored`, `toDisplayed`), the displayed layout (`displayLayout`, a stateless anchored repack of the stored grids for the current column count), placement rules (`canPlace`, `placeResized`, `placeNew` nearest to the center, `cellFromPoint`), the default block (`placeMissing`, with the vertical centering of its first placement: `centeredDefaultRow`, `defaultBlockRows`), the one-time v2 → v3 shift (`centerShift`) and the v1 → v2 packing (`migrateV1ToV2`). |
| `src/desktopUiState.js` | Pure UI state for edit mode, the Add menu, the open dialog and an active drag, and the Escape layering (`escapeLayer`). |
| `src/widgetsStore.js` | Validates, reads, and writes persisted widgets state (links, weather metrics and chrome tiles, each with a `grid`), sharded across `chrome.storage.sync` keys; reads are lenient about a missing or malformed `grid`. Also holds the legacy favorites → widgets v1 migration, the v1 → v2 migration (`migrateWidgetsToV2`), the v2 → v3 migration (`migrateWidgetsToV3`), `ensureWidgetsLayout` (defaults and self-heal), `inspectWidgetsMeta` and the write guard (`assertWritable`) that refuses `newer`, `v2`, `v1`, and `invalid` metas (only `valid` and `missing` are writable). |
| `src/widgetsService.js` | Add/update/delete for links, `updateWeatherMetric` (size, shown/hidden) and `moveWidget` (drop at a cell, `PlacementError` when the block is taken). Every mutation takes the current column count, runs under the mutation lock, checks `assertWritable` first, applies the action to the displayed layout of fresh storage and persists the displayed grid of every widget. |
| `src/widgetsShared.js` | Shared widget constants (types, weather metric ids, caps, the v1 column bounds and positions still read by the migration, lock name, newer-version message). |
| `src/widgetsLayout.js` | `defaultColumnsForItems` (column count of the legacy favorites → widgets v1 migration) and `placeTooltip` (edge-aware tooltip placement). |
| `src/favoritesShared.js` | Shared favorites constants (icon modes, color sources, tile sizes) and helpers. |
| `src/favoriteIcon.js` | Chooses a favicon, custom image, or letter icon for a tile. |
| `src/favoriteColor.js` | Derives a tile's accent color from its domain or a sampled icon. |
| `src/weatherApi.js` | Calls Open-Meteo's forecast, air-quality, and geocoding endpoints, normalizes responses, maps UV index and US AQI values to scale labels, and classifies failures (`details.kind`) into fixed user-facing texts via `weatherErrorMessage`. |
| `src/weatherStore.js` | Validates, reads, and writes the chosen location and the forecast cache, and reads/writes the per-device city-prompt-dismissed flag. |
| `src/cityPrompt.js` | Pure rules for whether the onboarding wizard may open on this page load (`onboardingWizardPossible` / `shouldShowOnboardingWizard`). |
| `src/onboardingWizard.js` / `src/onboardingStore.js` | First-run two-step wizard (city, then starter links) and the `quietTabOnboardingWizardComplete` local flag. |
| `src/weatherService.js` | Serves a fresh cached forecast or fetches and caches a new one; resolves a typed city name to a location. |
| `src/weatherPresentation.js` | Formats readings and picks each tile's color tone. |
| `src/weatherTiles.js` | Pure presentation of one weather tile (label, primary and secondary text, tone, description) for the loading, ready, stale and error states; for error and stale it also carries the retry phase (`ready`, `retrying`, `cooldown`) and the busy text. |
| `src/weatherUiState.js` | Pure state for the city modal (closed, or open in first-run or change mode), its live suggestion list, and the weather retry sub-state (attempt in flight, earliest next attempt, outcome of a result). |
| `src/icons.js` | Vendored, static SVG icon set. |
| `src/mutationLock.js` | Serializes mutations with the Web Locks API, with a promise-chain fallback. |
| `src/storeUtils.js` | Shared validation and cloning helpers. |

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
recomputed. The one-time v2 → v3 shift centers the bounding columns of the on-grid
items (`centerShift`).

**Writes.** Every explicit action (drag, add, edit, resize, delete, hide,
restore) is a read-modify-write under the mutation lock: read fresh storage,
compute the displayed layout for the current `C`, apply the action to it (a drop
on a block that is taken in fresh storage is rejected) and persist the displayed
grid of every widget in one batched `set()`, then remove the keys of deleted
widgets. Editing while the window is narrow therefore re-bases the stored layout
to the narrow arrangement. `getState()` tolerates a `meta.order` entry whose item
key hasn't propagated from another device yet by filtering it out; the next write
drops that id from `order` (and removes its key), so an item that arrives after that
write is no longer listed. The v1 → v2 migration, by contrast, keeps such absent ids
in the new `order`, so an item that syncs in late is still shown (unplaced). There
is no `storage.onChanged` listener: a tab that is open while another writes shows
stale data until its own next action or reload.

**Bootstrap.** Before the first read, `newtab.js` runs, under the same mutation
lock as every mutation:

1. `migrateToWidgets()` (needs `chrome.storage.local` too): moves the old
   favorites-only storage (`quietTabFavoritesMeta` + `quietTabFavorite:<id>` in
   sync, or the older single-blob `quietTabFavorites` in local) into the widgets
   v1 layout. A valid widgets meta is authoritative; leftover legacy keys are
   removed. Items are written in chunks of 25 with each chunk's legacy keys
   deleted right after, and the meta last.
2. `migrateWidgetsToV2()` (sync only): packs a valid v1 layout with the v1 column
   count, so the user's arrangement is kept. Links then metrics, enabled ones
   only, each at the first free block (a v1 `wide` tile is 2×1); then
   `chrome:settings` and `chrome:add`. Items are written in chunks of 25 (keeping
   their legacy `tileSize` for one release, so a not-yet-updated device can still
   read them), then the meta `version: 2` last; listed ids whose key has not synced
   yet are kept at the end of its `order`. Until the meta is v2 the run
   repeats; items that already carry a grid keep it, so a resumed run ends with
   the grids of an uninterrupted one. This step writes version 2 explicitly (`x`
   counted from the left column).
3. `migrateWidgetsToV3()` (sync only, only for a valid v2 meta, re-read under the
   lock): centers the arrangement once. Items are read as v2 wrote them (a
   non-negative `x`; an invalid item is neither rewritten nor deleted). The
   bounding columns `[minX, maxEnd)` of the on-grid items (links, chrome tiles,
   enabled metrics) with a grid give `shift = −(minX + floor((maxEnd − minX) /
   2))`; every readable item with a grid, hidden metrics included, gets `x +
   shift`, and the v3 meta (same `order`, same `createdAt`, new `updatedAt`) goes
   out in the same single `set()` call, so storage is fully v2 or fully v3. A
   rejected write leaves storage as it was and locks the grid like a failed step 2.
4. `ensureWidgetsLayout()`: adds any missing weather metric and chrome tile as one
   block (see Placement) with the default sizes (temperature 1×1, precipitation
   2×1, air quality 2×1, UV 1×1, Settings and Add 1×1), item keys before the
   meta; idempotent. The call receives the first screen of this boot,
   `ensureWidgetsLayout(sync, { screen })` with `screen = { rows, columns }` from
   `firstScreen()` in `newtab.js`. On a fresh install this creates temperature
   (−4,Y0), precipitation (−3,Y0), air quality (−1,Y0), UV (1,Y0), Settings
   (2,Y0), Add (3,Y0), with `Y0` the centered row of the first screen (4 at
   1280×800); without a valid `screen`, or for a partial self-heal, the row is 0.
   A legacy or v1 user's four metrics land as one block in the first row with room
   for all of them, which is below the links. It writes nothing for a newer, v2, v1
   or malformed meta. A write failure is non-fatal: the grid renders without the
   missing tiles and the page status line says so until the next open retries.

If step 1, 2 or 3 fails, the grid is locked with an error and a reload advice
instead of an editable empty grid, and the stored data is left untouched for the
next attempt.

A meta whose `version` is newer than this build understands (written by a newer
version on another device) is never touched: the migrations and the ensure step
write and delete nothing, every service mutation fails first with the
newer-version message (`assertWritable`), and the grid is locked read-only with
that message, also after a resize. Every write is likewise refused while the stored
meta is still v1 or v2 (an upgrade in progress, possibly on another device) or malformed,
with a message to reload the tab: from those metas a read is empty, so a write would
orphan every stored widget. A build from before the centered grid reads a
v3 meta the same way (newer, read-only), as a build from before the desktop grid
does with a v2 or v3 meta. A malformed meta is left alone by the
ensure step.

Chrome assigns the extension id; `manifest.json` does not pin a `key`. Two
separate "Load unpacked" installs from different directories therefore get
different ids and do not share synced storage — sync between devices applies
to installs of the same published extension.

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
   with `details.kind` (`network`, `timeout`, `http`, `notFound`, otherwise unknown) and
   wraps a rejected `fetch` as `network`; `weatherErrorMessage(error)` turns the kind
   into a fixed calm text, so `result.error` and the city modal's error slot never
   hold a browser or developer message.
4. Setting a city, from the city modal, geocodes the typed name (Open-Meteo returns English place
   names), stores the resolved location, and fetches a fresh forecast. Choosing a
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
ONE attempt for every tile, through the unchanged `weatherService.initialize()`: it re-reads the
city, serves a cache that another tab refreshed in the meantime (no request, the only cross-tab
effect; there is no `onChanged` listener) or fetches again. There is no way to refresh a fresh
tile. `retryWeather()` in `newtab.js` wraps the call in the same 15 s `withTimeout` as a city
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
  between suggestions and ArrowUp from the first returns to the field; Tab also
  reaches the suggestion buttons in DOM order.
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
- **DOM order and focus.** Tiles are in `(y, x)` order of the displayed layout,
  each − badge right after its tile; after a delete or hide focus moves to the next
  tile, else the previous, else Settings.
- **Escape order** (one document handler): drag, tooltip, city suggestions, city
  modal, dialog, Add menu, edit mode.

## Tooltips

One `#tooltip` element (`role="tooltip"`, `position: fixed`) lives on `body`,
outside every scrolling container, and is shared by the weather tiles. In normal
mode only, it shows on pointer hover and on keyboard focus (`:focus-visible`),
copies the text of the tile's hidden description node, and is placed by
`placeTooltip`: above the tile when there is room, otherwise below, centered on
the tile and clamped to an 8px margin inside the viewport. It hides on leave,
blur, Escape, grid scroll (except the scroll caused by focusing a tile), wheel,
touch scroll, window resize, entering edit mode or a drag, and every grid render.

## Concurrency

Multiple new tab pages can exist at once. Widgets mutations (and the bootstrap
migrations) are serialized
with the Web Locks API using one extension-wide lock name. A promise-chain
fallback provides deterministic behavior in environments without Web Locks
and in Node.js tests.

## Stylesheets (new tab)

The new tab page loads CSS in dependency order from `src/newtab.html`:

| File | Role |
| --- | --- |
| `design-tokens.css` | Color, typography, spacing, radius, shadow, and focus tokens (light/dark), including Phase 2 grid/page chrome tokens (`--radius-tile`, `--space-grid-*`, status chip, weather cell type). |
| `controls.css` | Overlay controls: buttons, inputs, segmented groups, add-menu rows, city field, and each control's own base focus style. |
| `surfaces.css` | Dialog and modal shells, backdrops, popovers, and the focus rings scoped to `.desktop-dialog` / `.city-modal`. |
| `newtab.css` | Desktop grid, tiles, weather presentation, tooltip, page chrome (Phase 2: grid radii, shadows, spacing, and typography via tokens). |

Public spec: [`docs/design-system.md`](design-system.md) (phase 1: controls + surfaces; phase 2: grid/tile/page chrome in `design-tokens.css` + `newtab.css`).

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
  broad host permissions; its only host access is Open-Meteo's three public
  endpoints.
