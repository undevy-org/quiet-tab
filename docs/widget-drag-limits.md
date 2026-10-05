# Widget drag: the whole window is the grid

## Status

`implemented`

Decision: **do it**. The owner checked the extension in the browser (2026-10-05): a free drag can only reach one row below the lowest tile, and sideways it reaches "a bit further" but never the edges of the tab. Both limits are deliberate rules of the desktop grid (`2026-10-02-desktop-grid-design`), not regressions; the owner wants them replaced: the visible window is divided into columns and rows, and a tile can be dropped on any free cell of it.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-05 | "I can drag a widget only one row below the lowest one, as if only n+1 rows were created, not the whole viewport divided into columns and rows." | `confirmed`, by rule | `canPlace` in `src/desktopLayout.js` rejects `y > lowest + 1`; the drag grid gets `lowest + 2` rows (`dragSession.rows` in `src/newtab.js`); `drawDropHighlight` draws nothing below that row. Measured below. |
| 2026-10-05 | "On X it is stranger: I can drag a bit further right and left, but again not over the whole viewport, as if this grid were finite too, finite in a strange way." | `confirmed`, by rule | `effectiveColumns` clamps the column count to 12 (`MAX_COLUMNS`), the 12-column block is centered (`.desktop-grid { margin: 0 auto }`), and a pointer in the page margin left of the grid is invalid while past the right edge there is no highlight (`updateDragTarget`, `drawDropHighlight`). The wider the window, the wider the dead margins. |

## Measurements (current behaviour, `main` at `3a8e3cf`)

Chromium via Playwright (`.private/e2e/lib/harness.mjs`, `--hide-scrollbars`, so `clientWidth` = window width), one 1×1 link at (0,0), the metrics hidden, Settings (6,0), Add (7,0), edit mode on; the link is grabbed at its centre and held over each point (probe in a scratchpad, not committed; the E2E of this run reproduces it).

| Window | Columns | Grid box (left..right) | Pointer 10 px from the right edge | Pointer 10 px from the left edge | Pointer over row 2, 4 or 60 px above the bottom |
|--------|---------|-------------------------|-----------------------------------|----------------------------------|----------------------------------------------------|
| 1280×800 | 12 | 164..1116 | no highlight, drop returns | dashed error at (0,0), drop returns | no highlight, drop returns |
| 1920×1080 | 12 | 484..1436 | same | same | same |
| 2560×1440 | 12 | 804..1756 | same | same | same |
| 500×800 | 6 | 38..462 | same | same | same |
| 320×600 | 5 | 8..312 | valid (the grid fills the width) | valid | no highlight |

Row 1 (one below the lowest tile) is valid everywhere. While dragging the grid is `--rows: 3` (232 px high, bottom edge at 248 px at 1280); the rest of the window is dead space for a drop. The service has the same cap: `requireColumns` (`src/widgetsService.js`) throws "The current column count is required" for any `columns` above 12 (`MAX_GRID_COLUMNS`), measured with `createWidgetsService` over memory: 12 ok, 13 and 15 rejected for `moveWidget` and `addFavorite`.

## Default decisions (owner can override)

1. **Columns fill the window.** `effectiveColumns(W) = max(2, floor((W − 2·pad + gap) / (cell + gap)))`, no upper bound (the cap of 12 goes). `W`, the cell/gap/pad table, the 2-column minimum and `scrollbar-gutter: stable` stay. Reference values (overlay scrollbar): 1280 → 15, 1920 → 23, 2560 → 31, 500 → 6, 360 → 5, 361 → 4, 320 → 5; classic 15 px scrollbar at 320 → 4. The grid block `C·cell + (C−1)·gap` still never exceeds `W − 2·pad` (no horizontal scroll) and stays centered; what is left over is less than one cell step, so the side margin is `pad + leftover / 2` (44 px at 1280, 1920 and 2560). *Consequence, accepted:* on a wide window the tiles now start near the left edge instead of inside a centered 12-column block (1280: x 164 → 44 px). The 12-column constant survives only where it is a stored reference, not a display limit: `placeMissing` keeps placing defaults over 12 columns (`REFERENCE_COLUMNS`), and the v1 → v2 migration keeps clamping a v1 `columns` value to 1..12 (the v1 format never had more; `MAX_GRID_COLUMNS` in `src/widgetsShared.js` stays for the v1 validators `isColumns` and `defaultColumnsForItems` and is no longer imported by the service). **The service accepts any integer column count ≥ 2:** `requireColumns` keeps its lower bound and its error, loses the upper bound. *Other consequence:* a new link and a restored metric (`placeNew`, first free block from (0,0)) fill row 0 up to `C` columns, not up to 12 (1280: a full row 0 of 12 tiles now leaves (12..14, 0) free).
2. **Rows fill the window during a drag.** `viewportRows(H) = max(1, floor((H − 2·pad + gap) / (cell + gap)))` with `H = document.documentElement.clientHeight` and the metrics of the current width. Reference values: 1280×800 → 9, 1920×1080 → 13, 2560×1440 → 17, 1280×700 → 8, 1280×600 → 7, 500×800 → 10, 320×600 → 9. The highest allowed top row for the dragged block (height `h`, displayed origin row `y0`) is `maxY(h) = max(lowest + 1, viewportRows − h, y0)`, where `lowest` is the lowest occupied row of the displayed layout without the dragged tile (−1 when the dragged tile is the only one). So: every row that fits in the first screen is a drop target; below the first screen the old rule stays (the block starts at most one row below the lowest other tile); and a tile can always stay in its own row or move up (`y0`: a tile that already sits below the allowed area, e.g. stored on a taller window, is not pulled up by merely picking it up). A drop can add at most `h` rows of page height. A block placed at `viewportRows − h` ends inside the first screen: a drop inside the window never creates a vertical scroll.
3. **The target snaps to the nearest allowed cell; only an occupied cell is invalid.** The cell under the pointer (minus the grab offset, `cellFromPoint`) is clamped to `0 ≤ x ≤ C − w` and `0 ≤ y ≤ maxY(h)`. A pointer in the side margins, above the grid, in the bottom padding, past the right edge or below the allowed rows therefore targets the nearest allowed cell and is not, by itself, invalid. The highlight is always drawn on that clamped cell: solid when the block is free, the existing dashed error outline when it overlaps a tile. **The AS-FU-03 invariant holds:** the outline is drawn exactly at the cell being judged and never moved to another cell; what changes is which cell is judged (the clamp happens in the target, before judging, not in `drawDropHighlight`). Because every block is now inside the grid, the "no highlight" case of AS-FU-03 no longer occurs. *Consequence, accepted:* releasing over the margin or below the grid no longer cancels a drag; the cancel paths are Escape, `pointercancel`, a viewport change and the pointer leaving the window (all unchanged), plus dropping back on the tile's own cell. *Rejected:* keeping "outside the grid box = invalid" (with full-width columns the margin is at most `pad + step / 2`, 44 px at 1280, and an invalid strip at the very edge reads as the bug the owner reported); keeping "no highlight beyond the allowed row" (with snapping there is no such position).
4. **During a drag the grid is exactly as high as the allowed area needs.** `rows = max(occupiedRows, maxY(h) + h)`, where `occupiedRows` is the at-rest row count (rows of the displayed layout, dragged tile included at its origin). This replaces today's `occupiedRows + 2`. Since `maxY(h) + h ≥ viewportRows`, the drag grid is at least one screen high, and when the allowed area fits in the first screen (`lowest + 1 + h ≤ viewportRows` and the layout itself fits) the drag creates no vertical scroll, so the autoscroll edge never shifts the page under a pointer that stays inside the window. Below the first screen the drag grid is at most `h` rows taller than at rest (1280×800, lowest row 12, 1×1: 13 rows at rest, 14 while dragging). The at-rest grid height is unchanged, so normal mode gains no empty height and no scroll.
5. **One rule in the engine, the service and the page.** `canPlace(layout, id, block, columns, viewportRows = 0)` returns true iff the block lies within the columns, `y ≤ maxY(h)` (with `y0` = the displayed row of `id` in `layout`) and it overlaps no other tile; with `viewportRows` omitted (or 0) it is today's rule plus the own-row allowance. `moveWidget(id, target, { columns, viewportRows })` passes it through (a drop accepted by the page is never refused by the service for its row, and a service call without `viewportRows` keeps the old rule). A `viewportRows` that is not an integer ≥ 0 (`NaN`, `1.5`, `-1`, a string) is treated as 0: an invalid value can only narrow the allowed area, never widen it. The page computes `viewportRows` once at drag start; a viewport change already cancels the drag (unchanged), so the value cannot go stale during a drag.
6. **Nothing else changes.** No new text, control, colour, token, storage field or migration. The storage shape already allows any non-negative integer `x` and `y`. Autoscroll (48 px edge, 12 px per frame), the 6 px tap threshold, Escape, `pointercancel`, leaving the window, the return animation, focus after a drop, reduced motion and the occupied-cell error outline all stay as they are.

## Scope

- `src/desktopLayout.js`: `effectiveColumns` without the upper clamp; new pure `viewportRows(height, width)` (or `(height, metrics)`); `canPlace` with the optional `viewportRows`; a pure helper for the clamped drop target (`dropTarget(...)` or equivalent) so the clamp is unit-tested, not only in the page. `MAX_COLUMNS` is removed or renamed to a v1-only constant used by `migrateV1ToV2`.
- `src/widgetsService.js`: `requireColumns` without the upper bound (the import of `MAX_GRID_COLUMNS` goes); `moveWidget` sanitises and passes `viewportRows` to `canPlace`. `src/widgetsShared.js`, `src/widgetsStore.js`, `src/widgetsLayout.js`: unchanged (v1 only).
- `src/newtab.js`: drag session `viewportRows` and `rows` (decision 4); `updateDragTarget` uses the clamped target (the `outside` test goes); `drawDropHighlight` always draws on the target; `commitDrop` passes `viewportRows` to `moveWidget`.
- `src/newtab.css`: none expected (the grid width already comes from `--grid-columns`).
- Tests: `test/desktopLayout.test.js` (`:15` `effectiveColumns(1280) === 12` and `:24` `(5000) === 12` encode the old cap and are replaced by the reference values above; the property loop "never exceeds W − 2·pad" at `:32` runs up to 5000 instead of 1400; the old `canPlace` cases `:117-121` stay as the `viewportRows`-omitted contract), `test/widgetsService.test.js` (`COLS = { columns: 12 }` stays for the existing cases; new cases above 12, AS-DL-11), `test/newtabSource.test.js`: the pins that encode the old behaviour are updated, each with a replacement pin, never only deleted: `:44` (import list), `:55` (`moveWidget(s.id, …, { columns })` gains `viewportRows`), `:56` (`canPlace(s.layout, s.id,`), `:681-684` (`drawDropHighlight`: `target.x + s.cell.w <= s.columns && target.y <= lowest + 1` and `highlight?.remove()`), `:897-900` (`const outside`, `const valid = !outside && canPlace(`).
- E2E: new `dg-55-drag-whole-window.mjs` (AS-DL-01..10). Existing scenarios that encode the old limits and must be updated to this spec (each change named in the run record): `dg-01:22` (12 columns at 1280 → 15), `dg-09:39` (`=== "12"` at 1280 → 15), `dg-08:72-74,95` and `dg-19:36-43` (they fill "row 0" with 12 tiles and expect the next block at (0,1); at 15 columns it lands at (12,0): read `--grid-columns` in the page and fill the row up to it), `dg-18:57-84` (two rows below / past the right edge at `cellCenter(page, 12, 0)` / left of the grid: now clamped targets), `dg-44:32-50` (block (a) "2×1 over (11,0) does not fit" fits at 15 columns; block (b) "two rows below" and "below the grid box" now draw a highlight; the "page does not grow" guard stays). Not affected (checked by grep and by reading): hard-coded pointer positions on the background or a backdrop (`dg-02`, `dg-03`, `dg-14`, `dg-16`, `dg-22`, `dg-30`, `dg-38`, `dg-40`, `12`, `13`), scenarios that address cells by `cellCenter` within columns 0..11, and the migration scenarios `01`, `05`, `09`, `dg-12` (v1 columns and `REFERENCE_COLUMNS`). The full E2E decides; any other change is named in the run record.
- Docs: `docs/architecture.md:68` ("2–12") and `:256` (§ Desktop grid UI: the dashed outline "outside the page margin", "at most one row below the lowest tile", the cancel paths); `docs/design-system.md:474` (the AS-DS-20 amendment line gets "Amended again by AS-DL (`docs/widget-drag-limits.md`)"); `docs/design-system-followup.md` decisions 2-4 and the non-goal "Changing the 'at most one row below' rule" get a one-line "Superseded by `docs/widget-drag-limits.md`" note (the spec stays `implemented`); `README.md:15` ("2–12"); `CHANGELOG.md` `[Unreleased]`: the existing lines `:49` (drop outline: "past the right edge … one row below … no outline") and `:85` ("columns follows the window (2–12)") are rewritten in place (they describe unreleased behaviour), plus one new line for the whole-window drag; private `agent-config/CLAUDE.md:59,62` (`desktopLayout.js`: "columns clamp 2–12", "at most one row below the lowest tile"; `widgetsService`: column count).

This spec **supersedes** the drag rules of `2026-10-02-desktop-grid-design` § Drag details ("only … up to one row below the lowest occupied row"; "clamp …, 2, 12"), AS-DS-20's amendment and `docs/design-system-followup.md` decisions 2-4 (AS-FU-03 "no highlight" for a block that does not fit or lies beyond the allowed row). AS-FU-03's invariant (the outline is at the judged cell) stays (decision 3).

## Process

This changes what the user sees, so it follows the full UI-phase cycle: this spec, a spec review and the spec gate, a plan in `quiet-tab-notes/superpowers/plans/`, E2E-first implementation, a checkpoint and the final design review (`design-review/PROTOCOL.md`), independent verification, merge.

## Non-goals

- Moving a tile with the keyboard (there is no keyboard move today).
- Empty rows or a full-screen grid at rest; a horizontally scrolling grid; any new cell size or breakpoint.
- Remembering the column count per device, or keeping a wide layout intact when a narrower window edits it (the existing re-base on edit stays, see Accepted exceptions).
- Compaction, gravity or auto-arrange.
- Changing the autoscroll speed or edge, or allowing more than one row below the lowest tile beyond the first screen.

## Accepted exceptions

- **Rows are never compacted.** `displayLayout` repacks by columns only. A tile stored low on a tall window (e.g. row 16 on 2560×1440) is below the first screen on a laptop (1280×800, 9 rows): the page scrolls at rest, the tile is reached by scrolling and by Tab (focus scrolls it into view), and only a drag brings it up. Settings and Add can be moved there too. Compaction is a non-goal.
- **Fractional zoom:** at a browser zoom such as 110-125 % `clientHeight` is an integer rounded by the browser, so the first-screen grid can end up to 1 px below the viewport and show a 1 px scroll while dragging. Accepted; E2E runs at 100 %.

- **Wide windows look different on the first load after the update:** the same stored cells are drawn from the left edge (44 px at 1280/1920/2560) instead of inside a centered 12-column block. Nothing is written; widening or narrowing never writes. This is the owner's request (the whole window is the grid).
- **A layout made on a wide window is repacked on a narrower one** (e.g. a tile at column 22 on a 1920 window shows at the first free block of its row at 1280), and **any edit made on the narrower window stores its displayed layout for every widget** (existing rule, AS-36 / `dg-36`). With more columns available this now happens between a large monitor and a laptop, not only below 12 columns. Accepted: the alternative needs per-device layouts (Non-goals).
- **Left-over margin:** the grid is centered, so up to `pad + step / 2` of each side is not covered by cells; a pointer there targets the edge column (decision 3), it is not a dead zone.
- **Below the first screen the old limit stays** (one row below the lowest tile): a drop must not grow the page without bound.

## Acceptance scenarios

Common setup unless stated: unpacked extension in the E2E harness (`--hide-scrollbars`, so `clientWidth` = window width); metrics hidden (`enabled: false`) so only links and chrome tiles are on the grid; Settings stored at (6,0) and Add at (7,0) (`defaultChrome()`; displayed per the repack rule at narrow widths) in addition to the tiles listed in Given; edit mode entered by clicking `[data-widget-id="chrome:settings"]`; drags with `dragTile` (pointer grabbed at the tile centre, 12 steps; the grab cell is the tile's top-left cell for 1×1, 2×1 and 2×2, because the centre lies on the first cell's far edge and `cellFromPoint` floors it). Each lettered part starts from a fresh seed (`seedAndReload`) unless it says "then". "Nothing written" means `chrome.storage.sync` is deep-equal before and after.

### AS-DL-01 Columns fill the window width
- Given: link A (0,0).
- When: the page is opened at 1280×800, 1920×1080, 2560×1440, 500×800 and 320×600.
- Then: `--grid-columns` is 15, 23, 31, 6, 5; the grid box is `C·cell + (C−1)·gap` wide (1192, 1832, 2472, 424, 304 px), centered (left = right margin ±0.5 px; 44, 44, 44, 38, 8 px), and `scrollWidth === clientWidth` (no horizontal scroll). At rest the grid is one row high (`--rows: 1`) and the page has no vertical scroll. With a classic scrollbar at 320 px: 4 columns of 56 px (unchanged). Nothing is written on load.
- Verified by: E2E `dg-55` (group 1); `test/desktopLayout.test.js` (reference values of decision 1, `effectiveColumns(5000)` is `floor((5000 − 32 + 8) / 80) = 62`).

### AS-DL-02 A tile reaches the last column
- Given: 1920×1080 (23 columns), link A (0,0) 1×1, link B (1,0) 2×1.
- When: A is dragged to the centre of cell (22,0) and released; then B is dragged so that the pointer is 10 px from the right edge of the window, row 1, and released.
- Then: A is stored at (22,0) and drawn in the last column (its right edge = grid right edge); B's highlight while held is solid at (21,1) (clamped so the 2-wide block ends in column 22) and B is stored at (21,1); no overlap; focus is on the dropped tile; no horizontal scroll at any moment.
- Verified by: E2E `dg-55` (group 2).

### AS-DL-03 The side margins snap to the edge column
- Given: 1280×800 (15 columns), link A (3,0).
- When: A is held with the pointer 10 px from the left edge of the window (inside the 44 px margin), row 0; then released.
- Then: while held the highlight is solid at (0,0); after release A is stored at (0,0). The same with the pointer 10 px from the right edge: highlight and drop at (14,0). No dashed error outline appears in the margins when the edge cell is free.
- Verified by: E2E `dg-55` (group 3).

### AS-DL-04 Any row of the first screen is a target
- Given: 1280×800 (`viewportRows` 9). (a) link A (0,0) (lowest occupied row without A: 0). (b) link A (0,0), link L (10,7) (lowest row 7, at rest 8 rows).
- When: (a) A is dragged to cell (3,8) (the last full row of the window) and released. (b) A is held over (3,8), then released.
- Then: (a) while held the highlight is solid at (3,8); during the drag the grid is exactly 9 rows high (`--rows: 9`) and the page has no vertical scroll (`scrollHeight === clientHeight`); A is stored at (3,8); after the drop the grid is 9 rows high at rest and the page has no vertical scroll; rows 1..7 stay empty (no repack pulls A up). (b) during the drag the grid is 9 rows high (`maxY(1) = max(8, 8, 0) = 8`, rows `max(8, 9)`, not today's 10) and `scrollHeight === clientHeight` at every sampled moment of the drag; A is stored at (3,8).
- Verified by: E2E `dg-55` (group 4).

### AS-DL-05 The bottom padding and the area below snap to the last allowed row
- Given: 1280×800, link A (0,0), link W (10,0) 2×2.
- When: (a) A is held with the pointer at x = the centre of column 3, 10 px above the bottom of the window (inside the bottom padding, below the last full row), then released; (b) on a fresh seed, W is held with the pointer at the centre of column 10, 10 px above the bottom, then released.
- Then: (a) highlight solid at (3,8) (`viewportRows − 1`), A stored at (3,8); (b) highlight solid at (10,7) (`viewportRows − 2`, so the 2-high block ends in row 8), W stored at (10,7); in both, no vertical scroll at any moment.
- Verified by: E2E `dg-55` (group 5).

### AS-DL-06 Below the first screen the one-row rule stays
- Given: 1280×800; links stacked so that the lowest occupied row is 12 (taller than the window, the page scrolls); link A (0,0).
- When: A is dragged down with autoscroll until the page bottom and held with the pointer inside the bottom 48 px edge; then released.
- Then: the target is clamped to row 13 (`lowest + 1`) at the pointer's column, the highlight is solid there, A is stored at row 13. Page height (`scrollHeight`): at rest before the drag 13 rows (`16 + 13·80 − 8 + 16` = 1064 px), while dragging 14 rows (1144 px, decision 4: one block height more), after the drop 14 rows (1144 px); no highlight or drop beyond row 13 is possible.
- Verified by: E2E `dg-55` (group 6); `test/desktopLayout.test.js` (`canPlace` with `viewportRows` 9 and `lowest` 12: row 13 true, row 14 false).

### AS-DL-07 An occupied target is still invalid
- Given: 1280×800, link A (0,0), link B (5,4).
- When: A is held over (5,4); then released.
- Then: the highlight is the dashed error outline at (5,4); the release returns A to (0,0) with the existing return animation; nothing is written; no status message (unchanged behaviour of AS-18).
- Verified by: E2E `dg-55` (group 7) and `dg-18` (updated).

### AS-DL-08 Low and narrow windows
- Given: link A (0,0), Settings (6,0) (displayed per width), Add (7,0).
- When: at 1280×600 (`viewportRows` 7), 500×800 (6 columns, `viewportRows` 10) and 320×600 (5 columns, `viewportRows` 9) A is dragged to the last full row and the last column (pointer in the bottom-right corner, 10 px from both edges) and released.
- Then: A is stored at (14,6), (5,9) and (4,8) respectively (the corner cell, clamped); no horizontal or vertical scroll at any moment; the highlight was solid at that cell.
- Verified by: E2E `dg-55` (group 8).

### AS-DL-09 Layouts from a wide window on a narrow one; upgrade
- Given: (a) stored layout from today's 12-column grid: default metrics enabled (`defaultMetrics()`), city and weather data from the harness fixture (`weatherFixture.sync` + `weatherFixture.local()`), Settings (6,0), Add (7,0), link A (11,0); (b) link B stored at (22,0) (made on a 1920 window), nothing else in row 0 but Settings (6,0) and Add (7,0); (c) link C stored at (0,16) (made on a 2560×1440 window).
- When: (a) opened at 1280×800 after the update; (b) opened at 1280×800, then the window is widened to 1920×1080; (c) opened at 1280×800, then Tab until C has focus.
- Then: (a) every tile is drawn at its stored cell (A at column 11), the grid has 15 columns and starts 44 px from the left; nothing is written. (b) at 1280 B is drawn at (0,0) (the first free block of row 0 from the left, the existing repack rule), nothing is written; at 1920 B is back at (22,0), nothing is written. (c) C is drawn at (0,16), the page scrolls vertically (rows are not compacted, Accepted exceptions), focusing C scrolls it fully into view; nothing is written.
- Verified by: E2E `dg-55` (group 9).

### AS-DL-10 Cancel paths and repeated drags
- Given: 1280×800, link A (0,0).
- When: (a) A is held over (10,6) and Escape is pressed; (b) A is held over (10,6) and the window is resized to 1280×700; (c) A is dropped at (10,6), then immediately dragged again to (2,3); (d) a movement under 6 px.
- Then: (a) and (b) A returns to (0,0), nothing is written, no highlight remains; (c) A is stored at (10,6) and then at (2,3), each write once, no overlap, focus on A; (d) it is a tap (the edit dialog opens), nothing is written.
- Verified by: E2E `dg-55` (group 10).

### AS-DL-11 The service keeps the page's rule
- Given: a widgets service over the in-memory store; layout A (0,0), B (0,1).
- When (each call on a fresh store): `moveWidget("A", { x: 4, y: 7 }, { columns: 15, viewportRows: 9 })`; `moveWidget("A", { x: 4, y: 7 }, { columns: 15 })`; the same with `viewportRows` `NaN`, `1.5`, `-1`, `"9"`; `moveWidget("A", { x: 14, y: 0 }, { columns: 15 })`; `moveWidget("A", { x: 15, y: 0 }, { columns: 15 })`; `addFavorite(…)` and `moveWidget` with `columns` 15 and 62; any mutation with `columns` 1, 1.5, `NaN`, `"15"`.
- Then: the first resolves and stores (4,7); the second and the four invalid `viewportRows` reject with `PlacementError` (the old rule, `lowest` 1); `(14,0)` resolves (last column); `(15,0)` rejects (outside the columns); `columns` 15 and 62 are accepted; `columns` 1, 1.5, `NaN`, `"15"` throw "The current column count is required". `canPlace` and the clamp helper: the reference values of decisions 2 and 3, including a 2×2 block at `viewportRows − 2` true and at `viewportRows − 1` false when `lowest + 1 < viewportRows − 1`, and a tile whose origin row `y0` is below `maxY` may stay in `y0`.
- Verified by: `test/widgetsService.test.js`, `test/desktopLayout.test.js`.

### AS-DL-12 Documented behaviour
- Given: the merged change.
- When: `README.md`, `docs/architecture.md`, `CHANGELOG.md` are read.
- Then: none of them says "2–12" columns, "one row below the lowest tile" without "below the first screen", or "outside the page margin" as invalid; the existing `[Unreleased]` lines about the drop outline and "(2–12)" are rewritten in place, and one line describes the whole-window drag.
- Verified by: design review only (text); `test/newtabSource.test.js` may pin the CHANGELOG line.

## Review focus

- **Scenarios and states:** the clamp semantics (decision 3) at every edge, with 1×1, 2×1 and 2×2 tiles and the grab offset (a 2-wide tile grabbed by its right half near the left edge); the boundary between the first screen and the one-row rule (`maxY` when `lowest + 1` is just above, equal to and below `viewportRows − h`); a page that already scrolls; the service and the page agreeing on every drop (no drop that looks valid and then fails with "That spot is taken").
- **Visual and layout:** the new look of wide windows (left-anchored layout, 44 px margins), no horizontal scroll at any width including classic scrollbars, no vertical scroll created by a drag while the allowed area fits in the first screen (decision 4), the drag grid height vs the window at 600 px high, the highlight never drawn outside the grid, a layout taller than the window (rows not compacted).
- **Accessibility and copy:** no new strings; focus after a drop on a far cell (the page may scroll to it); the dashed error outline stays the only invalid cue (not colour alone); reduced motion unchanged; README/CHANGELOG/architecture wording.

## Process notes for the implementer

- Keep `displayLayout`, `placeResized`, `placeNew`, `placeMissing` and `migrateV1ToV2` behaviour identical (their tests stay green unchanged); only the column cap (engine and `requireColumns`), `canPlace`'s optional argument and own-row allowance, the new pure helpers and the page's drag code change.
- Do not hard-code window-dependent numbers in `dg-55`: compute expected columns, rows and margins from `gridMetrics` values read in the page, and assert the reference values above only at the window sizes listed.
- Every `src/` change after the final gate needs a new final run.

## Changes after review

Round 1: design review `0-spec` (`.private/design-review/runs/2026-10-05-48bf5b9-spec-r1`, verdict BLOCKED: Important 3, Minor 5 after the skeptic) and pipeline stage 1 (`.private/pipeline/reports/widget-drag-limits-spec-review.md`, needs revision: Critical 1, Important 6, Minor 6). All reviewer defaults accepted; each fact re-checked against `main`.

- **C1 / S0-01** (`requireColumns` caps at 12): decision 1, decision 5, Scope, Measurements, AS-DL-11.
- **I6 / L0-01 / L0-02** (drag grid `occupiedRows + 2` scrolls inside the first screen; growth "one row" wrong): decision 4 (`rows = max(occupiedRows, maxY(h) + h)`), decision 2 ("at most `h` rows"), AS-DL-04(b), AS-DL-06 (exact heights), Review focus.
- **L0-03** (a tile below the allowed area is pulled up when picked): own-row allowance `y0` in `maxY` (decisions 2, 5), AS-DL-11.
- **I4 / L0-04** (rows not compacted across devices): Accepted exceptions, AS-DL-09(c).
- **I3** (sequential parts, missing chrome tiles): Common setup (chrome tiles, fresh seed per part, grab cell), AS-DL-05 split, AS-DL-09(b) neighbours.
- **I1** (E2E list incomplete): Scope lists `dg-08`, `dg-09`, `dg-19`, `dg-44` (a) with lines.
- **I5 / L0-06** (invariant, superseded rules, texts and pins): decision 3 (AS-FU-03 invariant), Scope (supersedes, every doc line, every pin).
- **L0-07 / I5** (CHANGELOG lines in `[Unreleased]`): Scope, AS-DL-12.
- **M1 / L0-09** (232 px): Measurements. **M2:** fresh store per call, `viewportRows` sanitising (decision 5, AS-DL-11). **M3:** Accepted exceptions (fractional zoom). **M4:** decision 3 (cancel paths). **M5:** decision 1 (`placeNew` fills up to `C`). **M6:** Scope (property loop to 5000).
- Rejected by the skeptic, no change: L0-05 (covered by decision 3, now also stated), L0-08 (weather fixture added to AS-DL-09(a) anyway), L0-10.
