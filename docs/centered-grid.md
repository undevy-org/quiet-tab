# Centered grid: the desk starts from the middle of the window

## Status

`draft`

Decision: **do it**. Owner request 2026-10-06 (local session): the grid starts from the center of the screen by default; the starting tiles sit in the center and new cells appear from the center towards the edges. Owner answers to the UX questions (2026-10-06):

- center **horizontally only**; rows still start at the top and grow down;
- a new tile goes to the **free cell nearest to the center** (right, left, then the next row);
- **existing layouts are shifted to the center once**, keeping the tiles' arrangement;
- the column count is **always even**, so the starting row sits exactly in the middle of the window (one edge column fewer on widths that would give an odd count);
- a row that does not fit a narrow window wraps **from the left, as today**.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-06 | "By default the grid starts from the center of the screen: the starting tiles in the center, new cells appear from the center to the edges." | `confirmed`, by rule | Stored `grid.x` counts from the left column (`src/desktopLayout.js` `isValidGrid`: `x >= 0`); `displayLayout` keeps a stored cell or repacks from column 0; `placeNew` takes the first free block from (0,0); the defaults are placed from (0,0) over 12 columns (`placeMissing`). Since run 13 (`docs/widget-drag-limits.md`, decision 1) the columns fill the window, so the tiles start 44 px from the left edge at 1280, 1920 and 2560. |

## Current behaviour (`main` at `b6dfdb7`)

Fresh install at 1280×800: 15 columns (`effectiveColumns`), grid box 44..1236 px; the default row (temperature 1×1, precipitation 2×1, air quality 2×1, UV 1×1, Settings, Add: 8 cells) is drawn in columns 0..7, x 44..676 px, so its center is at 360 px while the window center is at 640 px. A new link takes the first free cell of row 0 from the left (column 8). Widening the window adds columns on the right only. At 1920 and 2560 the same row sits 44 px from the left edge and the rest of the width is empty.

**Release status of the formats.** The only published version is 0.1.0 (`CHANGELOG.md` `[0.1.0]`, manifest `0.1.0`); widgets layout version 2 is in `[Unreleased]` and exists only on development profiles, in the E2E and on the owner's own browsers. Real users arrive with legacy or v1 data and go legacy → v1 → v2 → v3 in one load. The v3 bump still pays off: it shifts the owner's existing v2 layouts once (the owner's answer) and keeps any build of the previous `main` from repacking a centered layout. *Rejected:* keeping version 2 and reading `x` as signed (no migration): the owner's v2 layouts (x 0..7) would be read as offsets from the center and drawn right of it, not centered.

Code references below are to `main` at `b6dfdb7`; run 14 (`docs/first-run-empty-desk.md`) merges first and moves lines in `src/newtab.js` and `test/newtabSource.test.js`, so the implementer re-locates them by content.

## Default decisions (owner can override)

1. **Even column count.** `effectiveColumns(W) = max(2, fit − (fit mod 2))`, where `fit = floor((W − 2·pad + gap) / (cell + gap))` as today (same `W`, cell/gap/pad table, `scrollbar-gutter: stable`). The grid box stays centered, so the side margin is `(W − (C·cell + (C−1)·gap)) / 2`. Reference values (overlay scrollbar): 1280 → 14 (margin 84 px), 1920 → 22 (84), 2560 → 30 (84), 500 → 6 (38), 361 → 4 (40.5), 360 → 4 (59), 320 → 4 (39); classic 15 px scrollbar at 320 (`clientWidth` 305) → 4 (31.5). *Consequence, accepted:* on widths that used to give an odd count one edge column goes into the margins (1280: 15 → 14, margins 44 → 84 px; 360 and 320: 5 → 4). The run 13 rule "the whole window is the drop area" stays: a pointer in the margins targets the nearest edge column (`clampDropCell`), so the wider margin is not a dead zone.
2. **A centered frame for stored cells.** The center line of the grid is the boundary before column `origin(C) = floor(C / 2)` (for an even `C` it is exactly the window's center line). A stored `grid.x` is now **signed** and counts columns from that line: displayed column = `grid.x + origin(C)`; stored = displayed − `origin(C)`. `y`, `w`, `h` are unchanged. This is a new storage layout, **version 3** (meta `version: 3`); a v2 layout is migrated once (decision 7). Every write (every mutation re-bases the displayed grid of every widget, as today) stores displayed − `origin(C)` for the column count it was computed at.
3. **Display.** `displayLayout(items, C)` keeps the stateless repack and its `(y, x, order)` processing order, with one change: an item is first tried at its anchored cell (`grid.x + origin(C)`, `grid.y`); if that block lies inside the columns and is free it is kept; otherwise it takes the first free block scanning **its own row from column `clamp(anchoredX, 0, C − w)` to the right**, then the rows below **from column 0** (today the scan starts at column 0 of the own row). Items without a valid grid are placed after the positioned ones by the new-tile rule (decision 4; today they take the first free block from (0,0)). Consequences: whenever the layout fits, it is drawn exactly as stored, centered on the window's center line, at every width; widening or narrowing the window adds or removes columns on both sides and the tiles keep their distance from the center; the default row on a narrow window wraps exactly as `main` wraps it at the same column count (owner's answer; AS-CG-07); a tile anchored beyond an edge lands at the nearest end of its own row if a cell there is free (today: the first free cell from the left), so sparse layouts can repack differently from `main`. Nothing is written by a resize or a load.
4. **New tile: the free cell nearest to the center.** `placeNew(layout, { w, h }, C)` (a new link, a restored weather metric, an item without a valid grid) scans rows from 0 downwards; in the first row that has any free `w × h` block it takes the block whose center is nearest to the center line, `min |x + w/2 − C/2|`, ties to the right (larger `x`). In the fresh default row at 1280 the first new links land at displayed columns 11, 2, 12, 1, 13, 0 (stored 4, −5, 5, −6, 6, −7); when row 0 is full, row 1 starts at 7 (stored 0), then 6, 8, 5… *Rejected:* a ring search that prefers a nearer cell in a lower row (the owner's preview fills the row first, then "the row below the same way").
5. **Resize of a tile** (the size control of an edit dialog): kept at its cell when the new block fits, else the first free block scanning its own row from column `clamp(x, 0, C − w)` to the right, then the rows below from column 0 (the scan of decision 3; today the own row is scanned from column 0). *Consequence, accepted:* a resized tile never moves left within its own row; if nothing is free to its right it goes to the next rows from the left.
6. **Defaults and self-heal: one contiguous block near the center.** `placeMissing(missingIds, existing)` takes and returns grids in the **stored** frame and works over the 12 reference columns (existing stored grids mapped with `+6`, the origin of 12; results mapped back with `−6`, stored x −6..5). The missing tiles, in `DEFAULT_ENTRY_ORDER`, are laid out as **one contiguous row block** (total width = the sum of their widths, height 1) in the first row from 0 that has a free run of that width, at the position whose center is nearest to the reference center line (`min |x + width/2 − 6|`, ties to the right). The weather tiles therefore stay together and in their order, never spread around the user's links. Fresh install (all six missing, nothing else on the grid): the block of 8 lands in row 0 at reference 2..9, i.e. stored temperature −4, precipitation −3..−2, air quality −1..0, UV 1, Settings 2, Add 3 (4 cells on each side; displayed at 1280: columns 3..10, x 324..956 px, row center 640 px). One missing tile (e.g. Settings) is a block of width 1 and takes the nearest free cell of the first row that has one (AS-CG-15). The legacy upgrade (links only, metrics added by this step) puts the metrics as one centered block on the first row that has room for all four (AS-CG-09 b). *Rejected:* placing each missing tile on its own by the new-tile rule (the metrics of a legacy user would land on both sides of the links); building the metrics before the shift (the shift would then center links and metrics together, but `ensureWidgetsLayout` runs after the whole migration chain and is also the self-heal path for v3).
7. **Migration v2 → v3, once.** `migrateWidgetsToV3(sync)` runs at boot after `migrateWidgetsToV2`, under the mutation lock, only for a valid v2 meta (kind `v2`).
   - Read: the meta and every key in `meta.order`, with today's lenient item read and the **v2** grid check (`x >= 0`; `readItem`: an item with valid fields keeps its valid v2 grid, an invalid grid is dropped, an invalid item is neither rewritten nor deleted).
   - Shift: the on-grid items (links, chrome tiles, enabled metrics) with a valid grid define the bounding columns `[minX, maxEnd)`; `shift = −(minX + floor((maxEnd − minX) / 2))`; every readable item with a valid grid, hidden metrics included, gets `x + shift`; an item without a valid grid stays unplaced; no on-grid item with a grid means `shift = 0`. The shift is centered on the bounding box: a single far tile pulls the box (accepted, see Accepted exceptions).
   - Write: all readable items and the v3 meta in **one** `set()` call (the batched write `setState` already uses: up to 206 items plus the meta, 207 keys).
   - Concurrency: the step runs under the extension-wide mutation lock and re-reads the meta kind inside it, so of two tabs opening at once only the first migrates; the second sees `valid` (v3) and writes nothing. The meta keeps `order` as it is, including ids whose key has not synced yet (as v1 → v2 does); `createdAt` is kept, `updatedAt` = now.
   - Examples: the v2 default row at columns 0..7 → shift −4 → stored −4..3, drawn centered (AS-CG-08); on-grid items spanning columns 0..10 (11 wide) → shift −5 → stored −5..5, drawn half a cell right of center on an even grid.
   - Chain: legacy → v1 → v2 → v3 (the v1 → v2 packing unchanged); a fresh install writes v3 directly.
   - Failure: a rejected write leaves storage as it was and locks the grid with the existing migration-failure text ("Couldn't move your favorites to the new layout — Chrome Sync storage may be full or unavailable. Free up some sync space, then reload this tab to try again. Your favorites are kept.", `favoritesError`), exactly like a failed v1 → v2 step; the next load retries. A quota rejection is deterministic, so a user at the 100 KB sync limit stays locked with that text (the v3 items are at most 1-2 bytes larger each: a minus sign).
   - Other metas: a meta above version 3 locks the grid as today (`NEWER_WIDGETS_MESSAGE`); a `v2` meta is never written by any mutation: `assertWritable` refuses it with `V1_WIDGETS_MESSAGE` ("Your saved widgets are still being updated to the new layout. Reload this tab to finish."), like `v1`.
8. **Store paths that know the version** (lesson 2026-10-05: every consumer of a changed value is listed):
   - `WIDGETS_VERSION = 3`; `inspectWidgetsMeta` returns `missing | valid (v3) | v2 | v1 | newer | invalid`;
   - `migrateToWidgets` treats `v2` like `valid` and `v1` (an existing widgets meta is authoritative: legacy keys are dropped, the meta is never rewritten; today `metaKind === "valid" || metaKind === "v1"`), otherwise legacy leftovers next to a v2 meta would get a v1 meta written over it;
   - `migrateWidgetsToV2` builds and validates **version 2** explicitly (own v2 meta builder and state check; today it uses `WIDGETS_VERSION` and `buildWidgetsMeta`, which would now write a v3 meta with unshifted x);
   - `ensureWidgetsLayout` writes for `missing` and `valid` (v3) only, and leaves `v2` alone like `v1`;
   - the v1/v2 readers keep `x >= 0`: `migrateV1ToV2`'s resume branch and `migrateWidgetsToV2`'s `hasValidGrid` use a non-negative check, not the signed v3 `isValidGrid`.
9. **Drag** keeps the run 13 rules in displayed cells; the service stores displayed − `origin(C)` (decision 2). Focus and DOM order keep following the displayed `(y, x)` order.
10. **Nothing else changes.** No new text, control, colour or token. Vertical placement (rows from the top), `viewportRows`, `maxDropRow`, the drop highlight, autoscroll, the hint tile rule, the first-run modal and its reveal (run 14) stay as they are.

## Scope

- `src/desktopLayout.js`: `effectiveColumns` even; new `originColumn(columns)`; `isValidGrid` accepts a negative integer `x` (v3 shape); `displayLayout` anchored with the scan of decision 3 and unplaced items by decision 4; `placeNew` (decision 4); `placeResized` (decision 5); `placeMissing` (decision 6, stored frame in and out); a pure `centerShift(items)` (decision 7); pure `toStored(grid, C)` / `toDisplayed(grid, C)`; `migrateV1ToV2` resume branch with a non-negative check (decision 8). `cellFromPoint`, `clampDropCell`, `maxDropRow`, `canPlace`, `viewportRows` unchanged.
- `src/widgetsStore.js`: every item of decision 8, `migrateWidgetsToV3` (decision 7), v3 item and state validators with signed `x`; the comment of `assertWritable` ("Only a valid v2 meta…") updated.
- `src/widgetsService.js`: the conversion between the displayed and the stored frame (`rebase`, `placeNew`, `placeResized`, `moveWidget` results stored as displayed − `origin(C)`; hidden-metric placeholders in the stored frame). `requireColumns` unchanged (any integer ≥ 2; `origin` uses `floor(C / 2)`, so an odd count from a caller still works).
- `src/newtab.js`: the bootstrap chain gains the v3 step after the v2 step (a `newer` result locks as the other steps; a failure goes to the existing migration-failure path). Nothing else is expected to change (the page works in displayed cells; it never reads `item.grid` directly).
- Unit tests: `test/desktopLayout.test.js` (decision 1 reference values replace `:16-23` (15/23/31/5); anchored display, wrap at 6 and 4 columns, the far-tile case, a 15-wide migrated row at 14 columns, `placeNew` order incl. 2×1 and 2×2 and an odd caller count, `placeResized`, `placeMissing` fresh and self-heal, `centerShift`); `test/widgetsStore.test.js` (v3 validators; `inspectWidgetsMeta` kinds incl. `v2`; `migrateWidgetsToV3`: one write, idempotent, failure leaves storage untouched, hidden, unplaced and absent ids, timestamps; `migrateToWidgets` with a v2 meta and legacy leftovers writes no meta; `migrateWidgetsToV2` writes version 2; `assertWritable` for `v2`; every case that uses `version: 3` as "newer", `:63`, `:543-544`, `:556`, `:567`, `:580`, moves to 4); `test/widgetsService.test.js` (incl. `:615`) and `test/desktopV2.test.js` (incl. `:62`) (stored frame of every mutation; changed cases named in the run record); two concurrent `migrateWidgetsToV3` calls write once; `test/newtabSource.test.js` (bootstrap chain pin and any import-list pin).
- E2E harness (`.private/e2e/lib/harness.mjs`): `widgetStorageV3(items)` writing `version: 3`, plus displayed-frame helpers `favV3(i, displayedGrid)`, `defaultMetricsV3()`, `defaultChromeV3()` and `g`-style grids converted with the scenario's column count (default 14 at 1280: stored = displayed − 7; a scenario at another width passes its column count); `storedGrids(page, { columns })` returning displayed cells for comparisons; `widgetStorageV2` stays for migration scenarios only. The desktop scenarios that seed `widgetStorageV2` (49 of 63 files) are switched to the v3 helpers by a codemod, not by hand; **every scenario with a v2 seed either tests the migration or is switched**. 
- E2E scenarios to update besides the switch (each change named in the run record): run 13 references in `dg-01`, `dg-09`, `dg-55` (15/23/31/6/5 columns, 44 px margins, the cells used at 1280/1920); `dg-08`, `dg-19`, `dg-17`, `dg-30` (where a new link or restored metric appears: now nearest to the center); `dg-10` (320×600: 4 columns); migration and ensure results now end in v3, centered: `dg-12`, `dg-12b`, `01-upgrade`, `dg-34`, `09-weather-ensure` (`:83-97` use `version: 3` as "newer" → 4; `:109` `version === 2`, the migration result, → 3; AS-1 `:31-35` and AS-29 `:111-115` metric cells recomputed by decision 6), `dg-35`, `05-migration-failure` (`:35`, `:65` assert `version === 2` and `x + w <= 12`); `dg-14` (version above 3); `14-modal-upgrade` (`:55` `version !== 2`, `:194` `version: 3` as "newer" → 4); v1-seeded scenarios whose tile positions move after the migration (`10-weather-grid-states`, `12-tooltip-placement`, `13-city-modal`, `15-city-modal-layout`: tooltip and modal placements relative to tiles); run 14 scenarios `dg-15`, `dg-56` (switched to v3 seeds so the migration write does not enter their timing checks). New `dg-57-centered-grid.mjs` (AS-CG-01..16, one group per AS except AS-CG-11 (b), which is a unit test). The full E2E decides; any other change is named in the run record.
- Docs: `docs/architecture.md` (grid metrics: even columns; storage: layout version 3 (`:43` "layout version 2" and the table rows `:19`, `:21`), signed `x` from the center line, the v2 → v3 migration and the bootstrap chain; display layout; placement rules); `docs/widget-drag-limits.md` decision 1 gets a one-line "Amended by `docs/centered-grid.md`: even column count; the tiles start from the center" (that spec stays `implemented`); `README.md` (where it describes the column rule or where tiles start, if it does); `CHANGELOG.md` `[Unreleased]` (unreleased behaviour, rewritten in place): `:125` "layout version 2" → 3 and the centered frame, the run 13 line about columns filling the window (even count), `:102` ("A new link takes the first free cell from the top left") and `:131` ("placed at the first free cell") rewritten for decisions 4 and 3, plus one line for the centered start; private `agent-config/CLAUDE.md` (`:42` "layout version 2", `:49` the list of meta kinds (+ `v2`), `:80` the meta format, `:95-100` the bootstrap steps (step 3's fresh-install cells and "first free block over 12 columns" become decision 6), the `desktopLayout.js` line); the E2E harness gets a `chrome.storage.sync.set` recorder (init script) for the "one `set` call" checks.

## Process

This changes what the user sees and the storage format, so it follows the full UI-phase cycle: this spec, a spec review and the spec gate, a plan in `quiet-tab-notes/superpowers/plans/`, E2E-first implementation, a checkpoint and the final design review (`design-review/PROTOCOL.md`), independent verification, merge. It starts after run 14 (`docs/first-run-empty-desk.md`) is merged; the implementation branch is cut from that `main`.

## Non-goals

- Vertical centering (owner's answer: horizontal only).
- Centering the wrapped part of a row on narrow windows (owner's answer: from the left, as today).
- Compaction, gravity, auto-arrange, or re-centering a layout after the one-time migration (a layout the user arranged off-center stays off-center).
- Per-device layouts; keeping a wide layout intact when a narrower window edits it (the existing re-base on edit stays).
- Any new control, text or setting (e.g. a "center my tiles" button).
- A `chrome.storage.onChanged` listener (an open tab stays stale after another device migrates, as today).

## Accepted exceptions

- **Odd widths lose one edge column** (decision 1, owner's answer): the margin is `pad + leftover/2` plus half a step on those widths (16 + 28 + 40 = 84 px at 1280, 1920 and 2560; the largest is about 96 px, e.g. 95.5 px at 663 px).
- **A layout as wide as an old odd column count** (15, 23 or 31 columns, made at 1280, 1920 or 2560 on `main`) has one column more than the even grid at the same width: after the shift its last column is anchored beyond the right edge and that tile goes to the start of the next row. If that next row is itself full, every row below shifts by the same rule (a cascade, as `main`'s repack does today: with 200 links over 15 columns most tiles are drawn off their anchored cell). Nothing overlaps, nothing is lost, nothing is written until the next edit, which stores the repacked cells.
- **A layout of odd width cannot be centered exactly:** after the migration it sits half a cell right of the center line (decision 7). **A single far tile** (e.g. moved to the right edge of a wide window) widens the bounding box, so the migration centers the box, not the main cluster.
- **Another device still on the previous version** (an unreleased build: v2 never shipped) reads the v3 meta as "newer" and replaces the desk with the existing message ("Your saved widgets were written by a newer version of Quiet Tab and can't be edited here. Update Quiet Tab to keep using them."), no tiles, until it updates. This is the purpose of the version bump. Keys of a migration that reached another device only in part (the meta still v2, some items already shifted) are not handled specially: one `set()` makes this very unlikely. If it happens, the v2 → v3 step there reads items with the v2 grid check (`x >= 0`, decision 8), so an already shifted item with a negative `x` loses its grid and is placed by the new-tile rule; items with `x >= 0` are shifted again. Nothing is lost; some tiles move.
- **A layout made on a wide window is repacked on a narrower one**, and an edit made there stores its displayed layout for every widget (existing rule, AS-36): unchanged, now in the centered frame.
- **The one-time shift moves existing layouts** (owner's answer): tiles placed at the left edge on purpose end up centered after the update.
- **Legacy and v1 users' weather tiles go below their links:** after the shift row 0 holds the links plus Settings and Add, so the block of four metrics (decision 6) lands in the first row with room for all of them, which is below the links (AS-CG-09 b); on `main` they sat right of the links. Accepted: the block keeps the metrics together and centered.
- **A late-synced key** (an id in `order` whose item arrives after the migration) is read in the v3 frame with its v2 `x`, so it appears that many columns right of the center line; it is not lost.

## Acceptance scenarios

Common setup unless stated: unpacked extension in the E2E harness (`--hide-scrollbars`, so `clientWidth` = window width); cells are **displayed** cells `(column, row)` from the left of the grid; "stored" means `grid.x/y` in `chrome.storage.sync`; "the default row" = temperature 1×1, precipitation 2×1, air quality 2×1, UV 1×1, Settings, Add, stored −4..3; no city (the hint tile stands in the temperature cell, the other metric cells are reserved and have no tiles) unless a part says "with a city" (`weatherFixture` stored, so every enabled metric has a tile); "one `set` call" is counted by an init script that records every `chrome.storage.sync.set` with its keys from navigation on; the first-run modal is not shown (the harness default); drags with `dragTile` as in `dg-55`. "Nothing written" means `chrome.storage.sync` is deep-equal before and after.

### AS-CG-01 A fresh install starts in the middle
- Given: fresh install (no widgets keys).
- When: the page opens at 1280×800, 1920×1080 and 2560×1440.
- Then: `--grid-columns` is 14, 22, 30; the default row is drawn in row 0 at columns 3..10, 7..14, 11..18; the row's left and right edges (hint tile left edge, Add right edge) are 324/956, 644/1276, 964/1596 px, so its center equals the window center (±0.5 px). Stored: temperature (−4,0), precipitation (−3,0), air quality (−1,0), UV (1,0), Settings (2,0), Add (3,0); meta `version: 3`.
- Verified by: E2E `dg-57` (group 1); `test/desktopLayout.test.js` (`placeMissing` fresh).

### AS-CG-02 The column count is even
- Given: the default row.
- When: the page is opened at 1280×800, 1920×1080, 2560×1440, 500×800, 361×800, 360×800, 320×600, and at 320×600 with classic scrollbars.
- Then: `--grid-columns` is 14, 22, 30, 6, 4, 4, 4, 4; the grid box is centered (left margin = right margin ±0.5 px: 84, 84, 84, 38, 40.5, 59, 39, 31.5 px, the last from `clientWidth` 305) and `scrollWidth === clientWidth`. Nothing written.
- Verified by: E2E `dg-57` (group 2); `test/desktopLayout.test.js` (reference values).

### AS-CG-03 Widening and narrowing keep the tiles around the center
- Given: 1280×800, the default row.
- When: the window is resized to 1440×800, then 1600×800, then back to 1280×800.
- Then: 16, 18, 14 columns; the row is drawn at columns 4..11, 5..12, 3..10; its center stays at the window center (720, 800, 640 px ±0.5); nothing written at any step.
- Verified by: E2E `dg-57` (group 3).

### AS-CG-04 New links fill from the center outwards
- Given: 1280×800, the default row, no links.
- When: nine links are added one by one through Add link (1×1 each).
- Then: they are drawn at (11,0), (2,0), (12,0), (1,0), (13,0), (0,0), then (7,1), (6,1), (8,1); stored x: 4, −5, 5, −6, 6, −7, 0, −1, 1. Focus after each add is on the new tile (unchanged rule).
- Verified by: E2E `dg-57` (group 4); `test/desktopLayout.test.js` (`placeNew` order with ties to the right; a 2×1 and a 2×2 block; an odd column count).

### AS-CG-05 A restored weather tile takes the nearest free block to the center
- Given: 1280×800, with a city; the default row with precipitation hidden (its cells 4..5 free), link L at (11,0); edit mode on (the Add menu with "Add weather tile…" opens in edit mode, as in `dg-08`).
- When: precipitation is restored from the Add menu ("Add weather tile…").
- Then: it is drawn at (4,0) 2×1 (block center 5, |5 − 7| = 2, nearer than any free block left of column 3 or right of column 11), stored (−3,0); focus on it.
- Verified by: E2E `dg-57` (group 5).

### AS-CG-06 A dragged tile is stored relative to the center
- Given: 1280×800, the default row, link A at (11,0).
- When: A is dragged to (13,2) and dropped; then the window is resized to 1920×1080; then to 500×800.
- Then: stored A = (6,2); at 1920 (22 columns, origin 11) A is drawn at (17,2), still 6 columns right of the center line, and the default row at 7..14; at 500 (6 columns, origin 3) A is anchored at column 9, beyond the edge, and drawn at the first free block from column 5 in row 2, i.e. (5,2); nothing written by either resize.
- Verified by: E2E `dg-57` (group 6).

### AS-CG-07 Narrow windows wrap from the left as today
- Given: with a city; the default row.
- When: the page opens at 500×800 (6 columns, origin 3) and at 320×600 (4 columns, origin 2).
- Then: 500: row 0 temperature (0), precipitation (1..2), air quality (3..4), UV (5); row 1 Settings (0), Add (1). 320: row 0 temperature (0), precipitation (1..2), UV (3); row 1 air quality (0..1), Settings (2), Add (3). The same arrangement `main` draws for the default row at those column counts. Nothing written; no horizontal scroll.
- Verified by: E2E `dg-57` (group 7); `test/desktopLayout.test.js` (`displayLayout` at 6 and 4 columns).

### AS-CG-08 An existing v2 layout is centered once
- Given: (a) v2 storage (meta `version: 2`, `widgetStorageV2`): the default row at (0..7,0) with UV hidden (`enabled: false`, stored grid (5,0)); links f0 (0,1) 1×1 and f1 (1,1) 2×1; link f2 without a valid grid; `order` also lists `f9`, whose key is absent. (b) with a city, v2 storage with row 0 full at 15 columns: the default row at (0..7,0) and links f0..f6 at (8..14,0).
- When: the page opens at 1280×800.
- Then: (a) exactly one `chrome.storage.sync.set` call by the migration, carrying the v3 meta and every readable item; on-grid bounding columns [0, 8) give shift −4: temperature −4, precipitation −3, air quality −1, UV 1 (hidden, shifted too), Settings 2, Add 3, f0 (−4,1), f1 (−3,1); f2 keeps no grid; `order` still lists `f9`; `createdAt` unchanged. Drawn: the default row at columns 3..10, f2 by the new-tile rule at (8,0) (UV's free cell, block center 8.5, |8.5 − 7| = 1.5), f0 at (3,1), f1 at (4..5,1). A second load writes nothing. (b) bounding [0, 15) gives shift −7: stored −7..7; at 14 columns f6 is anchored at 14, beyond 13, and drawn at (0,1); every other tile in row 0 at columns 0..13; nothing written by a second load.
- Verified by: E2E `dg-57` (group 8); `test/widgetsStore.test.js` (`migrateWidgetsToV3`), `test/desktopLayout.test.js` (`centerShift`, the 15-wide row at 14 columns).

### AS-CG-09 Older formats reach v3
- Given: with a city; (a) a v1 layout (`version: 1`, `columns: 12`) with links f0 (narrow) and f1 (`tileSize: "wide"`) and the four metrics enabled (precipitation and air quality `tileSize: "wide"`, temperature and UV narrow); (b) legacy favorites-only storage (`quietTabFavoritesMeta` + `quietTabFavorite:f0`, `:f1`).
- When: the page opens at 1280×800.
- Then: (a) the v1 → v2 packing (unchanged) gives f0 (0,0), f1 (1..2,0), temperature (3,0), precipitation (4..5,0), air quality (6..7,0), UV (8,0), Settings (9,0), Add (10,0), 11 columns wide; the v3 step shifts by −5: stored f0 −5, f1 −4, temperature −2, precipitation −1, air quality 1, UV 3, Settings 4, Add 5; drawn at columns 2..12; meta `version: 3`. (b) (links f0, f1 narrow) legacy → v1 takes `columns` from `defaultColumnsForItems` (2 for two narrow links), so v1 → v2 packs over 2 columns: f0 (0,0), f1 (1,0), Settings (0,1), Add (1,1); the v3 step shifts by −1 (bounding [0, 2)): stored f0 (−1,0), f1 (0,0), Settings (−1,1), Add (0,1); then `ensureWidgetsLayout` adds the four metrics as one block of width 6 (decision 6): rows 0 and 1 have free runs of 5 only (reference 0..4 and 7..11), so the block goes to row 2 at reference 3..8: stored temperature (−3,2), precipitation (−2,2), air quality (0,2), UV (2,2). Drawn at 1280: row 0 f0 6, f1 7; row 1 Settings 6, Add 7; row 2 temperature 4, precipitation 5..6, air quality 7..8, UV 9; every row centered on 640 px. No legacy keys left; meta `version: 3`.
- Verified by: E2E `dg-12`, `dg-12b`, `01-upgrade`, `dg-34` (updated), `dg-57` (group 9).

### AS-CG-10 A failed migration locks and retries
- Given: v2 storage as in AS-CG-08 (a); a browser context with `failStorageInit` making `chrome.storage.sync.set` reject for the meta key.
- When: the page opens; then that context is closed and a new context is opened **on the same profile directory without the fault** (not through `freshProfile`, which deletes it).
- Then: first load: one `set` call carrying the meta key was attempted; the grid shows the existing migration-failure text, no tiles; storage deep-equal to the seed. Second load: migrated as in AS-CG-08 (a). (`clearStorageFault` cannot be used: the fault script runs again on every reload, `dg-13-migration-failure.mjs:19`.)
- Verified by: E2E `dg-57` (group 10); `test/widgetsStore.test.js`.

### AS-CG-11 Newer, in-progress and previous-version readers
- Given: (a) meta `version: 4`; (b) a v2 meta when a service mutation is called (unit); (c) the v3 storage of AS-CG-01 opened by a build of the last v2 `main` (`buildFromRef` with the SHA the implementation branch is cut from, pinned as a constant like `PRE_PHASE` in `dg-14`, so the part stays valid after the merge).
- When: the page opens (a, c); the mutation runs (b).
- Then: (a) the existing newer-version message, no tiles, nothing written. (b) refused with `V1_WIDGETS_MESSAGE`, nothing written. (c) the base build shows its newer-version message ("Your saved widgets were written by a newer version…"), no tiles, storage deep-equal.
- Verified by: E2E `dg-14` (updated to version 4) for (a), `dg-57` (group 11) for (c); `test/widgetsStore.test.js` for (b).

### AS-CG-12 A tile stored far from the center on a wide window
- Given: v3 storage: the default row, link F stored (10,0) (made at 1920: displayed column 21, the last of 22).
- When: the page opens at 1920×1080, then at 1280×800.
- Then: 1920: F at (21,0), the right edge. 1280: F is anchored at 17, beyond the last column 13, and drawn at (13,0), the right end of row 0; nothing written. An edit made at 1280 (F's edit dialog, Save) stores F at (6,0) (displayed 13 − 7) and every other widget unchanged.
- Verified by: E2E `dg-57` (group 12).

### AS-CG-13 Resize of a tile near the edge
- Given: 1280×800, the default row, link D at (12,0), link B at (13,0) 1×1.
- When: (a) B is resized to 2×1 in its edit dialog; (b) on a fresh seed without D, the same.
- Then: (a) B does not fit at (13,0) (column 14 does not exist); the scan of its own row from column `clamp(13, 0, 12) = 12` finds no free 2-wide block (D), so B takes the first free 2-wide block of row 1 from column 0, (0,1), stored (−7,1). (b) the scan from column 12 finds (12,0) free: B is drawn at (12..13,0), stored (5,0).
- Verified by: E2E `dg-57` (group 13); `test/desktopLayout.test.js` (`placeResized`).

### AS-CG-14 Keyboard order follows the displayed layout
- Given: 1280×800, the default row (no city), links at (11,0) and (2,0).
- When: Tab is pressed from `body` repeatedly.
- Then: focus visits row 0 left to right: the (2,0) link, the hint tile, Settings, Add, the (11,0) link (the reserved metric cells have no tiles while no city is set); each focus ring fully visible.
- Verified by: E2E `dg-57` (group 14).

### AS-CG-15 Self-heal puts a missing tile back near the center
- Given: v3 storage: the default row with the Settings key removed (`order` still lists it), links at (11,0) and (2,0) (stored 4 and −5).
- When: the page opens at 1280×800.
- Then: `ensureWidgetsLayout` writes Settings by the block rule of decision 6 with width 1, over 12 reference columns: the existing stored cells mapped with `+6` occupy reference columns 1 (link), 2, 3..4, 5..6, 7, 9 (Add) and 10 (link); free are 0, 8 and 11; the nearest to the reference center 6 is 8 (|8.5 − 6| = 2.5 against 5.5 and 5.5), so Settings is stored at (2,0) and drawn at (9,0), where it was. No other item key changes; the meta is rewritten with a new `updatedAt` (as `ensureWidgetsLayout` always does).
- Verified by: E2E `dg-57` (group 15); `test/desktopLayout.test.js` (`placeMissing` self-heal).

### AS-CG-16 Large data
- Given: with a city; v2 storage with 200 links packed over 15 columns from (0,1) (rows 1..14: 13 full rows and 5 links in row 14) plus the default row at (0..7,0).
- When: the page opens at 1280×800; then Add link is opened and a link submitted.
- Then: one migration `set` call with 207 keys (206 items and the meta) succeeds; all 206 tiles are in the DOM, no two overlap, the 15-wide rows cascade per Accepted exceptions; the page scrolls vertically, never horizontally (`scrollWidth === clientWidth`); submitting the 201st link shows the existing limit error ("You can save up to 200 favorites") in the dialog; a reload writes nothing.
- Verified by: E2E `dg-57` (group 16), `dg-24-cap-200` (switched to v3 seeds).

## Review focus

- **Scenarios and states:** the repack scan of decision 3 at every width between 320 and 2560 px (no overlap, nothing lost; the default row wraps as on `main`; sparse layouts may differ, decision 3); the new-tile order (decision 4) with 1×1, 2×1 and 2×2 blocks and an odd caller column count; the one-time migration (one write, idempotent, hidden, unplaced and absent items, failure and retry, the previous-version reader, two tabs under the lock); the default and self-heal block of decision 6 (fresh install, one missing tile, legacy metrics below the links); every store path of decision 8; every mutation storing the centered frame.
- **Visual and layout:** the default row exactly centered at 1280/1920/2560 (even columns), the wider margins of decision 1 (and a drop in them, run 13 clamp), resizing keeps the tiles around the center, narrow windows, a migrated 15-wide row at 14 columns.
- **Accessibility and copy:** Tab order still follows the displayed rows; no new strings; README, CHANGELOG and architecture wording.

## Changes after review

Round 1: design review `0-spec` (`.private/design-review/runs/2026-10-06-8230054-spec-r1`: Important 8, Minor 9 before the skeptic) and pipeline stage 1 (`.private/pipeline/reports/centered-grid-spec-review.md`, needs revision: Important 6, Minor 10).

- **I1 / L0-04** (`migrateToWidgets`, `migrateWidgetsToV2`, `assertWritable`): decision 8, decision 7 (other metas), Scope, unit tests.
- **I2** (v2 never released): Current behaviour (release status, option B rejected), Accepted exceptions, Scope docs (`CHANGELOG.md:125`, `architecture.md:19,21,43`, `CLAUDE.md:42,97`).
- **I3** (AS-CG-10 retry): a new context on the same profile without the fault.
- **I4** (E2E volume): Scope (v3 helpers, codemod, every v2 seed migrates or is switched, the listed scenarios and unit cases).
- **I5 / L0-05 / L0-06** (absent ids, read validator, timestamps, quota, partial sync): decision 7, Accepted exceptions, AS-CG-08 (a).
- **I6** (previous-version reader in E2E): AS-CG-11 (c).
- **L0-01 / L0-02 / M7** (AS-CG-08 numbers, f2): AS-CG-08 (a) (UV 1, f2 at (8,0)), decision 3 (unplaced items by decision 4).
- **L0-03 / M3** (15-wide layouts): Accepted exceptions, AS-CG-08 (b), unit test.
- **L0-07 / M5** (self-heal, fresh predicate): decision 6, AS-CG-15.
- **L0-08** (large data): AS-CG-16.
- **M1** (margin formula), **M2** (decision 5 clamp), **M4** (narrow wording), **M6** (non-negative v1/v2 readers), **M8** (AS-CG-14 without a city), **M9** (AS-CG-09 numbers), **M10** (group numbering; the "v2 in the early check" line removed), lens Minors (texts quoted, the lock replaces the desk, code references at `b6dfdb7`).

Round 2: design review `0-spec` (`.private/design-review/runs/2026-10-06-ce6c9a6-spec-r2`: Important 1, Minor 5 before the skeptic) and pipeline stage 3 (`.private/pipeline/reports/centered-grid-spec-review-2.md`, needs revision: N1, N2, m1-m6).

- **N1 / L0-21** (legacy users: metrics spread around the links): decision 6 (missing defaults as one contiguous block nearest the center; the per-tile rule and building before the shift rejected), AS-CG-09 (b) with numbers.
- **N2** (no city vs. metric tiles): Common setup ("with a city"), AS-CG-05 (and edit mode), AS-CG-08 (b), AS-CG-09, AS-CG-16.
- **m1 / L0-22** (207 keys, cascade, limit message): decision 7, AS-CG-16, Accepted exceptions. **m2:** Accepted exceptions (cascade). **m3 / L0-23:** AS-CG-15 (meta `updatedAt`). **m4:** Common setup (`set` recorder), AS-CG-10 (same profile directory). **m5:** AS-CG-11 (c) (pinned SHA). **L0-24:** Scope (test and doc lines). **L0-25:** Accepted exceptions (margins up to ~96 px). **L0-26:** decision 7 (concurrency), unit test.

Round 3: design review `0-spec` (`.private/design-review/runs/2026-10-06-203e501-spec-r3`: Important 1, Minor 4 before the skeptic) and pipeline stage 3 pass 3 (`.private/pipeline/reports/centered-grid-spec-review-3.md`, ready for spec gate, Minor m-A..m-D).

- **L0-27** (legacy v1 columns are 2 for two links): AS-CG-09 (b) recomputed with `defaultColumnsForItems`.
- **L0-28** (AS-CG-07 cells without tiles): AS-CG-07 with a city. **L0-29** (partial sync): decision 7 (v2 grid check on read), Accepted exceptions. **L0-30 / m-B / m-D:** Scope lines. **L0-31:** Review focus. **m-A:** Accepted exceptions (legacy metrics below the links). **m-C:** AS-CG-15 wording.

