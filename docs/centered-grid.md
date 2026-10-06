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

## Default decisions (owner can override)

1. **Even column count.** `effectiveColumns(W) = max(2, fit − (fit mod 2))`, where `fit = floor((W − 2·pad + gap) / (cell + gap))` as today (same `W`, cell/gap/pad table, `scrollbar-gutter: stable`). The grid box stays centered, so the side margin is `(W − (C·cell + (C−1)·gap)) / 2`. Reference values (overlay scrollbar): 1280 → 14 (margin 84 px), 1920 → 22 (84), 2560 → 30 (84), 500 → 6 (38), 361 → 4 (40.5), 360 → 4 (59), 320 → 4 (39); classic 15 px scrollbar at 320 → 4. *Consequence, accepted:* on widths that used to give an odd count one edge column goes into the margins (1280: 15 → 14, margins 44 → 84 px; 320: 5 → 4). The run 13 rule "the whole window is the drop area" stays: a pointer in the margins targets the nearest edge column (`clampDropCell`), so the wider margin is not a dead zone.
2. **A centered frame for stored cells.** The center line of the grid is the boundary before column `origin(C) = floor(C / 2)` (for an even `C` it is exactly the window's center line). A stored `grid.x` is now **signed** and counts columns from that line: displayed column = `grid.x + origin(C)`; stored = displayed − `origin(C)`. `y`, `w`, `h` are unchanged. This is a new storage layout, **version 3** (meta `version: 3`); a v2 layout is migrated once (decision 7). Every write (every mutation re-bases the displayed grid of every widget, as today) stores displayed − `origin(C)` for the column count it was computed at.
3. **Display.** `displayLayout(items, C)` keeps the stateless repack and its `(y, x, order)` processing order, with one change: an item is first tried at its anchored cell (`grid.x + origin(C)`, `grid.y`); if that block lies inside the columns and is free it is kept; otherwise it takes the first free block scanning **its own row from column `clamp(anchoredX, 0, C − w)` to the right**, then the rows below **from column 0** (today the scan starts at column 0 of the own row). Items without a valid grid are placed after the positioned ones by the new-tile rule (decision 4). Consequences: whenever the layout fits, it is drawn exactly as stored, centered on the window's center line, at every width; widening or narrowing the window adds or removes columns on both sides and the tiles keep their distance from the center; a row wider than the window wraps from the left as today (owner's answer; AS-CG-07 gives the exact result at 500 and 320 px); a tile anchored beyond the right edge (stored on a wider window) lands at the right end of its row if that cell is free. Nothing is written by a resize or a load.
4. **New tile: the free cell nearest to the center.** `placeNew(layout, { w, h }, C)` (a new link, a restored weather metric) scans rows from 0 downwards; in the first row that has any free `w × h` block it takes the block whose center is nearest to the center line, `min |x + w/2 − C/2|`, ties to the right (larger `x`). In the fresh default row at 1280 the first new links land at displayed columns 11, 2, 12, 1, 13, 0 (stored 4, −5, 5, −6, 6, −7); when row 0 is full, row 1 starts at 7 (stored 0), then 6, 8, 5… *Rejected:* a ring search that prefers a nearer cell in a lower row (the owner's preview fills the row first, then "the row below the same way").
5. **Resize of a tile** (the size control of an edit dialog): kept at its cell when the new block fits, else the first free block from **its own column** in its own row, then the rows below from column 0 (same scan as decision 3; today it starts at column 0 of the own row).
6. **Defaults.** A fresh install places the six default tiles as **one contiguous row centered on the line**: temperature at stored x −4, precipitation −3..−2, air quality −1..0, UV 1, Settings 2, Add 3, row 0 (8 cells, 4 on each side). Displayed at 1280: columns 3..10, x 324..956 px, row center 640 px = the window center. Self-heal (`ensureWidgetsLayout` when some of them are missing next to existing tiles) places each missing tile in `DEFAULT_ENTRY_ORDER` by the new-tile rule (decision 4) over the 12 reference columns (`C = 12`, origin 6, stored x −6..5), in the stored frame.
7. **Migration v2 → v3, once.** `migrateWidgetsToV3(sync)` runs at boot after `migrateWidgetsToV2`, under the mutation lock, only for a valid v2 meta. The on-grid items (links, chrome tiles, enabled metrics) with a valid grid define the bounding columns `[minX, maxEnd)`; `shift = −(minX + floor((maxEnd − minX) / 2))`; every item with a valid grid, hidden metrics included, gets `x + shift`; an item without a valid grid stays unplaced; no on-grid item with a grid means `shift = 0`. All items and the v3 meta are written in **one** `set()` call (the batched write `setState` already uses; no chunks, so there is no half-migrated state to resume). Examples: the v2 default row at columns 0..7 → shift −4 → stored −4..3, drawn centered (AS-CG-08); on-grid items spanning columns 0..10 (11 wide) → shift −5 → stored −5..5, drawn half a cell right of center on an even grid (an odd width cannot be centered exactly). The legacy → v1 → v2 chain is unchanged and continues into v3; a fresh install writes v3 directly. A rejected write leaves storage untouched and locks the grid with the existing migration-failure message (`favoritesError`, reload advice), exactly like a failed v1 → v2 step; the next load retries. A meta above version 3 locks the grid as today. A v2 meta is never written by any mutation (like v1 today): it is either migrated or the grid is locked.
8. **Drag** keeps the run 13 rules in displayed cells; the service stores displayed − `origin(C)` (decision 2). Focus and DOM order keep following the displayed `(y, x)` order.
9. **Nothing else changes.** No new text, control, colour or token. Vertical placement (rows from the top), `viewportRows`, `maxDropRow`, the drop highlight, autoscroll, the hint tile rule, the first-run modal and its reveal (run 14) stay as they are.

## Scope

- `src/desktopLayout.js`: `effectiveColumns` even; new `originColumn(columns)`; `isValidGrid` accepts a negative integer `x` (v3 shape; the v1/v2 validators that need `x >= 0` keep their own check in the store); `displayLayout` anchored with the scan of decision 3; `placeNew` nearest to the center (decision 4); `placeResized` (decision 5); `placeMissing` (decision 6: contiguous centered row for a fresh install, the new-tile rule over 12 reference columns otherwise, results in the stored frame); a pure `centerShift(items)` (decision 7) so the migration rule is unit-tested; pure `toStored(grid, C)` / `toDisplayed(grid, C)` helpers. `cellFromPoint`, `clampDropCell`, `maxDropRow`, `canPlace`, `viewportRows`, `migrateV1ToV2` unchanged.
- `src/widgetsStore.js`: `WIDGETS_VERSION = 3`; `inspectWidgetsMeta` gains the kind `v2` (a valid version 2 meta: an upgrade in progress); v3 item and state validators with signed `x`; `migrateWidgetsToV3`; `ensureWidgetsLayout` writes v3 (and leaves `v2` alone, like `v1`); `migrateWidgetsToV2` writes a v2 meta exactly as today (the next step converts it).
- `src/widgetsService.js`: the conversion between the displayed and the stored frame (`rebase`, `placeNew`, `placeResized`, `moveWidget` results stored as displayed − `origin(C)`; hidden-metric placeholders in the stored frame). `requireColumns` unchanged (any integer ≥ 2; `origin` uses `floor(C / 2)` so an odd count from a caller still works).
- `src/newtab.js`: the bootstrap chain gains the v3 step after the v2 step (a `newer` result locks as the other steps; a failure goes to the existing migration-failure path); a `v2` meta in the early check is treated like `v1`. Nothing else is expected to change (the page works in displayed cells).
- Tests: `test/desktopLayout.test.js` (reference values of decision 1 replace the run 13 values `15/23/31/5`; anchored display, wrap at 500 and 320, the far-tile case, `placeNew` order, `placeResized`, `placeMissing`, `centerShift`); `test/widgetsStore.test.js` (v3 validators, `inspectWidgetsMeta` kinds incl. `v2`, `migrateWidgetsToV3`: one write, idempotent, failure leaves storage untouched, hidden and unplaced items); `test/widgetsService.test.js` and `test/desktopV2.test.js` (stored frame of every mutation; existing cases that assert stored `x` values are converted, each one named in the run record); `test/newtabSource.test.js` (bootstrap chain pin and any pin of the import list).
- E2E: `.private/e2e/lib/harness.mjs` gets a v3 seed helper that takes **displayed** cells and the scenario's column count (stored = displayed − C/2), so desktop scenarios keep their displayed-cell assertions; `widgetStorageV2` stays for migration scenarios. New `dg-57-centered-grid.mjs` (AS-CG-01..14). Scenarios that encode the old frame or the odd column counts and must be updated (each change named in the run record): the run 13 references in `dg-01` (column count at 1280), `dg-09`, `dg-55` (15/23/31/6/5 columns, margins 44 px, the cells used at 1280/1920), `dg-08` and `dg-19` (fill row 0 up to `--grid-columns` and expect the next block there: now nearest to the center), `dg-17` and `dg-30` (where a new link or a restored metric appears), `dg-10` (320×600: 4 columns), `dg-12`/`dg-12b`/`01-upgrade`/`dg-34`/`09-weather-ensure`/`dg-35` (migration and ensure results now end in v3, centered), `dg-14` (version above 3), every scenario seeding `widgetStorageV2` that asserts displayed cells (switch to the v3 helper). The full E2E decides; any other change is named in the run record.
- Docs: `docs/architecture.md` (grid metrics: even columns; storage: layout version 3, signed `x` from the center line, the v2 → v3 migration and the bootstrap chain; display layout; placement rules); `docs/widget-drag-limits.md` decision 1 gets a one-line "Amended by `docs/centered-grid.md`: even column count; the tiles start from the center" (that spec stays `implemented`); `README.md` (where it describes the column rule or where tiles start, if it does); `CHANGELOG.md` `[Unreleased]`: the run 13 line about columns filling the window is rewritten in place (unreleased behaviour) and one line for the centered start; private `agent-config/CLAUDE.md` (`desktopLayout.js` line, storage sharding paragraph: version 3, bootstrap step list).

## Process

This changes what the user sees and the storage format, so it follows the full UI-phase cycle: this spec, a spec review and the spec gate, a plan in `quiet-tab-notes/superpowers/plans/`, E2E-first implementation, a checkpoint and the final design review (`design-review/PROTOCOL.md`), independent verification, merge. It starts after run 14 (`docs/first-run-empty-desk.md`) is merged; the implementation branch is cut from that `main`.

## Non-goals

- Vertical centering (owner's answer: horizontal only).
- Centering the wrapped part of a row on narrow windows (owner's answer: from the left, as today).
- Compaction, gravity, auto-arrange, or re-centering a layout after the one-time migration (a layout the user arranged off-center stays off-center).
- Per-device layouts; keeping a wide layout intact when a narrower window edits it (the existing re-base on edit stays).
- Any new control, text or setting (e.g. a "center my tiles" button).

## Accepted exceptions

- **Odd widths lose one edge column** (decision 1, owner's answer): margins up to `pad + step + leftover/2` (84 px at 1280, 1920, 2560).
- **A layout of odd width cannot be centered exactly:** after the migration it sits half a cell right of the center line (decision 7).
- **Another device still on the previous version** reads the v3 meta as "newer" and shows the existing read-only lock and message ("…written by a newer version of Quiet Tab…") until that device updates. This is the purpose of the version bump: an old version must not repack and overwrite a centered layout.
- **A layout made on a wide window is repacked on a narrower one**, and an edit made there stores its displayed layout for every widget (existing rule, AS-36): unchanged, now in the centered frame.
- **The one-time shift moves existing layouts** (owner's answer): a user who placed tiles at the left edge on purpose sees them centered after the update.

## Acceptance scenarios

Common setup unless stated: unpacked extension in the E2E harness (`--hide-scrollbars`, so `clientWidth` = window width); cells are **displayed** cells `(column, row)` from the left of the grid; "stored" means `grid.x/y` in `chrome.storage.sync`; "the default row" = temperature 1×1, precipitation 2×1, air quality 2×1, UV 1×1, Settings, Add; the first-run modal is not shown (the harness default) unless a part says so; drags with `dragTile` as in `dg-55`. "Nothing written" means `chrome.storage.sync` is deep-equal before and after.

### AS-CG-01 A fresh install starts in the middle
- Given: fresh install (no widgets keys), no city.
- When: the page opens at 1280×800, 1920×1080 and 2560×1440.
- Then: `--grid-columns` is 14, 22, 30; the default row is drawn in row 0 at columns 3..10, 7..14, 11..18 (the hint tile in the temperature cell); the row's left and right edges (hint tile left edge, Add right edge) are 324/956, 644/1276, 964/1596 px, so its center equals the window center (±0.5 px). Stored: temperature (−4,0), precipitation (−3,0), air quality (−1,0), UV (1,0), Settings (2,0), Add (3,0); meta `version: 3`.
- Verified by: E2E `dg-57` (group 1); `test/desktopLayout.test.js` (`placeMissing`).

### AS-CG-02 The column count is even
- Given: the default row.
- When: the page is opened at 1280×800, 1920×1080, 2560×1440, 500×800, 361×800, 360×800, 320×600, and at 320×600 with classic scrollbars.
- Then: `--grid-columns` is 14, 22, 30, 6, 4, 4, 4, 4; the grid box is centered (left margin = right margin ±0.5 px: 84, 84, 84, 38, 40.5, 59, 39 px; with classic scrollbars the margin is computed from `clientWidth`) and `scrollWidth === clientWidth`. Nothing written.
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
- Verified by: E2E `dg-57` (group 4); `test/desktopLayout.test.js` (`placeNew` order with ties to the right; a 2×1 and a 2×2 block).

### AS-CG-05 A restored weather tile takes the nearest free block to the center
- Given: 1280×800; the default row with precipitation hidden (its cells 4..5 free), link L at (11,0).
- When: precipitation is restored from the Add menu ("Add weather tile…").
- Then: it is drawn at (4,0) 2×1 (the free 2-wide block nearest the center line: block center 5, |5 − 7| = 2, nearer than any block left of column 3 or right of 11), stored (−3,0); focus on it.
- Verified by: E2E `dg-57` (group 5).

### AS-CG-06 A dragged tile is stored relative to the center
- Given: 1280×800, the default row, link A at (11,0).
- When: A is dragged to (13,2) and dropped; then the window is resized to 1920×1080; then to 500×800.
- Then: stored A = (6,2); at 1920 (22 columns, origin 11) A is drawn at (17,2), still 6 columns right of the center line, and the default row at 7..14; at 500 (6 columns, origin 3) A is anchored at column 9, beyond the edge, and drawn at the first free block from column 5 in row 2, i.e. (5,2); nothing written by either resize.
- Verified by: E2E `dg-57` (group 6).

### AS-CG-07 Narrow windows wrap from the left as today
- Given: the default row (stored −4..3).
- When: the page opens at 500×800 (6 columns, origin 3) and at 320×600 (4 columns, origin 2).
- Then: 500: row 0 temperature (0), precipitation (1..2), air quality (3..4), UV (5); row 1 Settings (0), Add (1). 320: row 0 temperature (0), precipitation (1..2), UV (3); row 1 air quality (0..1), Settings (2), Add (3). The same arrangement `main` draws at those column counts. Nothing written; no horizontal scroll.
- Verified by: E2E `dg-57` (group 7); `test/desktopLayout.test.js` (`displayLayout` at 6 and 4 columns).

### AS-CG-08 An existing v2 layout is centered once
- Given: v2 storage (meta `version: 2`): the default row at (0..7,0) with UV hidden (`enabled: false`, stored grid (5,0)); links f0 (0,1) 1×1 and f1 (1,1) 2×1; link f2 without a valid grid.
- When: the page opens at 1280×800.
- Then: exactly one `chrome.storage.sync.set` call by the migration, carrying the v3 meta and every item; on-grid bounding columns [0, 8) give shift −4: temperature −4, precipitation −3, air quality −1, UV −1 (hidden, shifted too), Settings 2, Add 3, f0 (−4,1), f1 (−3,1); f2 keeps no grid and is drawn by the new-tile rule; drawn: the default row at columns 3..10 (UV's cell 8 empty), f0 at (3,1), f1 at (4..5,1); a second load writes nothing.
- Verified by: E2E `dg-57` (group 8); `test/widgetsStore.test.js` (`migrateWidgetsToV3`), `test/desktopLayout.test.js` (`centerShift`).

### AS-CG-09 Older formats reach v3
- Given: (a) a v1 layout (`version: 1`, `columns: 12`); (b) legacy favorites-only storage (`quietTabFavoritesMeta` + items).
- When: the page opens at 1280×800.
- Then: both end with meta `version: 3`, the layout shifted to the center by the rule of decision 7 (the v1 → v2 packing unchanged, then the shift), no legacy keys left, links kept.
- Verified by: E2E `dg-12`, `dg-12b`, `01-upgrade`, `dg-34` (updated), `dg-57` (group 9).

### AS-CG-10 A failed migration locks and retries
- Given: v2 storage as in AS-CG-08; `chrome.storage.sync.set` rejects for the meta key (`failStorageInit`).
- When: the page opens; then the fault is cleared and the page reloaded.
- Then: first load: the grid is locked with the existing migration message (reload advice), no tiles, storage deep-equal to the seed; second load: migrated as in AS-CG-08.
- Verified by: E2E `dg-57` (group 10); `test/widgetsStore.test.js`.

### AS-CG-11 Newer and in-progress metas
- Given: (a) meta `version: 4`; (b) a v2 meta when a service mutation is called (unit).
- When: (a) the page opens; (b) the mutation runs.
- Then: (a) the existing read-only lock and message, nothing written; (b) the write is refused (`assertWritable`), nothing written. A device on the previous version reading v3 shows its own "newer" lock (design review only: that code is not in this build; on `main` `inspectWidgetsMeta` returns `newer` for any version above 2).
- Verified by: E2E `dg-14` (updated to version 4); `test/widgetsStore.test.js`.

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

### AS-CG-14 Keyboard order and focus follow the displayed layout
- Given: 1280×800, the default row, links at (11,0) and (2,0).
- When: Tab is pressed from `body` repeatedly.
- Then: focus visits row 0 left to right: (2,0) link, the hint (or temperature), precipitation, air quality, UV, Settings, Add, (11,0) link; focus rings fully visible.
- Verified by: E2E `dg-57` (group 14).

## Review focus

- **Scenarios and states:** the repack scan of decision 3 at every width between 320 and 2560 px (no overlap, nothing lost, the same result as `main` when narrower than the row); the new-tile order (decision 4) with 1×1, 2×1 and 2×2 blocks and an odd caller column count; the one-time migration (one write, idempotent, hidden and unplaced items, failure and retry, the version lock for older clients); every mutation storing the centered frame.
- **Visual and layout:** the default row exactly centered at 1280/1920/2560 (even columns), the wider margins of decision 1, resizing keeps the tiles around the center, narrow windows unchanged in order, the first-run reveal (run 14) showing a centered desk.
- **Accessibility and copy:** Tab order still follows the displayed rows; no new strings; README, CHANGELOG and architecture wording.
