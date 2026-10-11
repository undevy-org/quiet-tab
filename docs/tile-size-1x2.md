# Tile size 1×2: fourth grid footprint for all widget kinds

## Status

`implemented` — minor fixes from the initiative spec review (2026-10-10, notes `pipeline/reports/onboarding-grid-initiative-spec-review.md`, M1–M4). **Part 1** of the onboarding-grid initiative and prerequisite for part 2 (`docs/post-onboarding-grid.md`), whose island table uses 1×2 links, a 1×2 temperature and a 1×2 city hint.

Decision: **do it** (axiom agreed in brainstorming, 2026-10-10). The product exposes **four** equivalent tile footprints: **1×1**, **1×2**, **2×1**, and **2×2** for **favorites** and **weather metrics** (and the city hint, which mirrors its metric cell). **Chrome** tiles (Settings, Add) stay **1×1** only in this release (owner 2026-10-10).

**Data compatibility: not required** (no users rule).

Terms: **footprint** = stored `grid.w` × `grid.h` (each 1 or 2). **1×2** = `w: 1`, `h: 2`. **Tall weather model** = presentation branch for metrics when the cell is 1×2 (see decision 6). **Visual reference** = pixel-perfect mockup and CSS proposal in notes `.private/superpowers/mockups/2026-10-10-tile-1x2/widget-1x2-proposed.css` (companion session `widget-1x2-pixel-perfect.html`, 2026-10-10).

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-10 | Fourth size 1×2; all widget types; pixel-perfect mockup approved (weather values vertically centered in the middle band). | `confirmed` | Brainstorm companion; `widget-1x2-proposed.css`. |
| 2026-10-10 | Write full design spec before onboarding-grid work. | `confirmed` | This document. |
| 2026-10-10 | Chrome 1×1 only; segment order 1×1→1×2→2×1→2×2; onboarding starters → part 3 (out of scope here). | `confirmed` | Owner answers OQ-1, OQ-4, OQ-5. |
| 2026-10-10 | Drop DOM `data-tileSize`; size only `data-w` / `data-h`. Size row: tighter padding at 320px, else 2×2 segment grid. | `confirmed` | OQ-2, OQ-3. |

## Current behaviour (`main` at review time)

**Engine and storage already allow 1×2.** `isValidGrid` accepts any combination of `w` and `h` in `{1, 2}` (`src/desktopLayout.js`). `normalizeSpan`, `placeNew`, `placeResized`, `displayLayout`, and drag (`canPlace`, `maxDropRow`) treat height like width; no engine change is required for validity.

**UI and rendering do not.** The Size radiogroup lists only **1×1**, **2×1**, and **2×2** (`SIZE_OPTIONS` in `src/newtab.js`). `readSize` already parses `1x2` if present, but no control offers it.

| Widget kind | Today at 1×2 (if forced in storage) | Size in dialogs |
|-------------|----------------------------------------|-----------------|
| **Favorite** | Icon only (`createFavoriteTile`: label when `cell.w === 2` only). | Add link + Edit link: three sizes. |
| **Weather metric** | `describeWeatherMetric` uses `wide` only when `cell.w === 2`; 1×2 gets **square** data (e.g. precipitation hides start time). CSS: generic `data-h="2"` rules target **2×2** and **2×1** patterns, not 1×2. | Edit weather: same three sizes. |
| **City hint** | 1×1: map-pin icon; 2-wide: text `Set a city`. At 1×2 would still show pin only. | N/A (inherits metric cell size). |
| **Chrome** (Settings, Add) | Store rejects any grid except **1×1** (`hasGrid` in `src/widgetsStore.js`). | No size control. |

**Related rules unchanged today:** 2×2 favorite icon is horizontally centered, text left (`docs/link-tile-polish.md`). Weather at 2-high shows larger primary (28px), city line, larger retry glyph (`newtab.css`, `docs/weather-tile-retry.md`). Segmented Size control: 40px row, direction B inside dialogs (`docs/design-system.md`). The post-onboarding island is **part 2** (`docs/post-onboarding-grid.md`) and the step 2 starter rows **part 3** (`docs/onboarding-starter-rows.md`); this spec is **part 1** only.

## Default decisions (owner can override)

1. **Four footprints, one control.** Extend `SIZE_OPTIONS` with `["1x2", "1×2"]` in order **1×1 → 1×2 → 2×1 → 2×2** (owner OQ-5). Same radiogroup on **Add link**, **Edit link**, and **Edit weather**. Values remain `1x1` \| `1x2` \| `2x1` \| `2x2`; `readSize` unchanged. Default for **new** links stays **1×1**; default for **new** weather tiles stays each metric’s current default footprint from `defaultSize` / first placement (unchanged). No new user-visible strings beyond the **1×2** segment label (reuse multiplication sign `×` like existing options).

2. **Favorite tile content at 1×2.** Show **icon + label + host** (same information as 2×2, narrower column). Layout per approved mockup: column, centered icon **32×32**, label **11px** semibold, up to **3** lines (`-webkit-line-clamp: 3`), host **10px** muted on **one** line with ellipsis, centered text, padding **8×6** px, gap **5** px. Accessible name unchanged (`aria-label` / `title` = label). **1×1** stays icon-only; **2×1** / **2×2** unchanged (`docs/link-tile-polish.md`).

3. **Favorite DOM rule.** `createFavoriteTile` appends `.favorite-tile__text` when **`cell.w === 2` OR `cell.h === 2`**, with host line when **`cell.h === 2`** (covers 2×2 and 1×2, not 2×1).

4. **City hint at 1×2.** When `cell.w === 1 && cell.h === 2`: column layout — map-pin **18px**, then visible text **`Set a city`** (same copy as 2-wide), **11px** semibold, centered, one line at the **72px** cell, **2** lines at the **64px** and **56px** cells (measured), dashed border unchanged. **1×1** pin-only and **2×1** text-only behaviours unchanged.

5. **Chrome (Settings, Add) — 1×1 only (owner OQ-1).** No change: store validator keeps **`w === 1 && h === 1`** only; placement/self-heal unchanged; **no** 1×2 layout CSS and **no** chrome work in this run. The brainstorming mockup showed chrome 1×2 for completeness; it is **not** implemented here.

6. **Weather presentation: tall model.** Introduce a third `size` argument to `describeWeatherMetric`: `"square"` \| `"wide"` \| `"tall"`. Mapping from cell:
   - `w === 2` → `"wide"` (unchanged priority: 2×1 and 2×2 both wide for *data*; 2×2 layout is CSS).
   - `w === 1 && h === 2` → `"tall"`.
   - else → `"square"`.
   **`tall` content (mirror 2-high intent in a narrow column):**
   - **Temperature / UV:** same primary as square; no extra secondary.
   - **Precipitation:** primary + **secondary** = start time when available (same as wide).
   - **Air quality:** primary + **secondary** = PM2.5 line (same as wide).
   - Loading, error, stale, retry phases unchanged (`docs/weather-tile-retry.md`).

7. **Weather tile DOM/CSS at 1×2.** `createWeatherMetricTile`: city line when `cell.h === 2` (already); retry glyph **12px** at 1-high **and at 1×2**, **14px** only at **2×2** (`createIconNode("refresh", { size: cell.w === 2 && cell.h === 2 ? 14 : 12 })`; see the retry bullet below). CSS selectors use **`[data-w="1"][data-h="2"]`** for tall-only rules so **2×2** keeps existing rules. Approved layout:
   - Glyph top (**18px** SVG), flex-shrink 0.
   - `.weather-tile__values`: `flex: 1`, column, **justify-content: center** (values band vertically centered between glyph and city).
   - Primary **20px**, secondary **11px**, centered — at the **72px** cell. (The mockup's 22px leaves `100%` 60.4px wide in a 60px content box, clipped by a fraction of a pixel, design review r2; 20px is about 55px.) At **64px** and **56px** cells the 1×2 tile uses the existing per-cell weather tokens (`--font-size-weather-primary-cell-64` 16px / `-secondary-cell-64` 10px; `-cell-56` 14px / 9px). These need **explicit** 1×2 rules, e.g. `:root[data-cell="64"] .weather-tile[data-w="1"][data-h="2"] .weather-tile__primary`, because today's `.weather-tile[data-h="2"] .weather-tile__primary` (28px, specificity 0,3,0) beats the `:where(:root[data-cell])` token rules (0,1,0).
   - Secondary may wrap to **2** lines (e.g. `12.3 PM2.5` wraps at the 64px and 56px cells); it is never clipped.
   - City **10px**, up to **2** lines, bottom band.
   - Padding **8px 4px 6px**; tone borders/gradients unchanged.
   - Do **not** apply 2×2-only rules (`primary` 28px, glyph 24px) to 1×2.
   - Retry corner glyph at 1×2: **12px** at `top: 4px; right: 4px` (the 1-high rule), not the 2×2 rule (14px at 6px): in a 1-wide column the 14px glyph at 6px touches the centered 18px metric glyph at the 56px cell (0.25px of ink for wind, design review r2). With 12px at 4px the corner glyph starts at `tile width − 16` and the metric glyph ends at about `tile width / 2 + 9`, so their bounding boxes do not intersect at 72/64/56 (`docs/weather-tile-retry.md` decision 2 rule). Amend that doc's size table in the implementation PR: "12 px in a 1-high tile and a 1×2 tile, 14 px in a 2×2 tile".

8. **Remove DOM `data-tileSize` (owner OQ-2).** `placeTile` sets only CSS vars `--w` / `--h` and **`data-w` / `data-h`** on each tile node. **Delete** `node.dataset.tileSize = …` and any read of `dataset.tileSize` or `[data-tileSize]` in `src/`. (The DOM attribute is `data-tile-size`; every check of its absence uses that name.) Tile layout CSS and runtime logic use **`data-w` and `data-h` only** so future footprints (beyond today’s 1–2 span) do not need a parallel naming scheme. **Storage:** optional `tileSize` on very old migrated items may remain in `sizeOf` / v1→v2 paths as a read fallback when `grid` is missing — **non-goal** to remove that field from validators or migrations in this run (no users); new writes already omit it (`widgetsService` deletes `tileSize`).

9. **Tooltips, retry, edit mode, drag.** No behaviour change: tooltips still use full `description` text; retry `aria-label` and behaviour unchanged (corner glyph size per decision 7); edit dialogs gain the fourth size only; drag highlight and `maxDropRow` already respect `h`. **Hide weather** / **delete link** unchanged.

10. **Narrow windows / `data-cell`.** Tall rules use the same cell box as other sizes (`--cell-size` from `gridMetrics`). At **56px** cells (gap 6), 1×2 tile is **56×118** px; at **64px** cells (gap 8) **64×136** px; weather typography per decision 7 (20px / 11px only at the 72px cell; the per-cell tokens at 64 and 56). City hint text: one line at the 72px cell, two lines at 64 and 56.

11. **Segmented control with four options (owner OQ-3).** **Phase A:** one radiogroup row at **40px** height; use narrow-dialog segment padding (`0 6px`, `docs/design-system.md`). Measured in design review (2026-10-11) on the real CSS: segments are 53.5–71.3px wide at 320–440px with no clipping, so **Phase A is the plan**. Its E2E check (AS-1X2-08) at **320, 400 and 420px**: for each option `scrollWidth ≤ clientWidth` of its label and its rect inside the radiogroup rect; the radiogroup rect inside the dialog content box. **Phase B (only if that check fails during implementation):** same radiogroup becomes a **2×2** grid of segments (reading order 1×1, 1×2, 2×1, 2×2); outer control height grows; dialog scroll rules unchanged. Do not use horizontal scroll.

12. **Nothing else by default.** Part **2** (post-onboarding island) and part **3** (step 2 starter rows) are separate specs. **Data compatibility: not required.**

## Scope

- `src/newtab.js`: `SIZE_OPTIONS`; `createFavoriteTile`; `createCityHintTile`; `createWeatherMetricTile` size mapping; **`placeTile` drops `dataset.tileSize`**.
- `src/controls.css` or `surfaces.css`: only if Phase B — layout for four-option Size radiogroup as 2×2 grid inside dialogs (not expected, decision 11).
- `src/newtab.css`: 1×2 rules for favorite, weather, city hint (from mockup CSS, adjusted selectors); **no** chrome 1×2 rules; ensure 2×2 / 2×1 rules do not leak to 1×2 (audit `[data-h="2"]` without `[data-w]`).
- `src/weatherTiles.js`: `tall` branch in `readyModel` / `describeWeatherMetric`.
- `src/widgetsStore.js`: **no change** to chrome grid rule.
- Unit tests: `test/weatherTiles.test.js` (tall precipitation/AQI); `test/newtabSource.test.js` pins for fourth size option and favorite text guard; `test/desktopLayout.test.js` optional `placeNew` for 1×2 block.
- E2E: new scenario file `dg-NN-tile-1x2.mjs` (the plan takes the next free number; `dg-61`…`dg-63` are taken) — Add link 1×2, Edit weather 1×2, hint at 1×2 at 1280×800; **Add link Size row at 320×800** (four segments visible); tiles lack `data-tile-size`; tile box ±1 px and font sizes ±0.5 px against decision 7 at the 72px cell (the mockup is drawn for 72 only); at 64 and 56 only the no-clip checks of AS-1X2-07 / AS-1X2-10. Existing E2E that count three sizes and must change: `dg-04-edit-favorite.mjs` (lines 42–43), `dg-29-weather-modal.mjs` (line 38).
- Docs: `CHANGELOG.md` `[Unreleased]`; `docs/architecture.md` one sentence under Desktop grid UI (four sizes); `docs/design-system.md` Size row lists four options and names Add link as well as Edit link (today it says Edit link only, while the code has Size in both); agent-config `CLAUDE.md` (DOM contract: drop `data-tile-size`, four sizes); this spec → `implemented` after merge.
- Notes: mockup CSS path above; optional companion HTML archived in `.private/superpowers/mockups/2026-10-10-tile-1x2/`.

## Process

Full UI pipeline (spec review, plan in notes, E2E-first implementation, checkpoint, verification). Branches: `docs/tile-size-1x2-spec`, `feat/tile-size-1x2`, notes plan `docs/tile-size-1x2-plan`.

## Non-goals

- Part **2** (post-onboarding island) and part **3** (step 2 starter rows).
- New storage version or migration (1×2 is valid v3 grid already).
- Any chrome footprint other than **1×1** (including 1×2 mockup in notes).
- Chrome **2×1** / **2×2** or weather **2-wide** rule changes.
- **Data compatibility: not required.**

## Accepted exceptions

- **Size radiogroup** may switch to Phase B (2×2 segment grid) only if the AS-1X2-08 measurement fails.
- **Keyboard, focus, edit mode, large data:** unchanged mechanisms (the segmented radiogroup's arrow keys, tile focus rings, jiggle, the 200-link cap) apply to the new option and the new footprint as they are; no existing E2E seeds a 1×2 tile, so AS-1X2-12 checks keyboard focus once; jiggle and the cap are footprint-independent and not repeated.
- **Letter fallback** on 1×2 uses the same 32×32 box as favicon (not 40×40 of 2×2).

## Acceptance scenarios

Common setup: harness **1280×800** unless noted; `gridMetrics` → cell **72**, gap **8**; 1×2 tile box **72×152** px.

### AS-1X2-01 Size control shows four options including 1×2
- Given: Add link or Edit link or Edit weather open.
- When: inspecting the Size radiogroup.
- Then: four options; values `1x1`, `1x2`, `2x1`, `2x2`; default selection matches spec (Add **1×1**, Edit **current footprint**).
- Verified by: E2E group 1; `newtabSource` pin.

### AS-1X2-02 Add link creates a 1×2 favorite with label and host
- Given: Add link, valid URL, Size **1×2**.
- When: Save.
- Then: stored `w:1, h:2`; tile shows icon, label, host; label centered, ≤3 lines with ellipsis; host visible.
- Verified by: E2E group 2.

### AS-1X2-03 Edit weather saves 1×2 and shows tall layout
- Given: city set, precipitation tile, Edit weather, Size **1×2**.
- When: Save.
- Then: stored `h:2, w:1`; tile shows glyph, primary, secondary (start time when fixture provides it), city; values band vertically centered between glyph and city (±1 px: the band's center equals the midpoint between the glyph's bottom and the city's top).
- Also: air quality at 1×2 shows primary + `PM2.5` secondary; temperature and UV at 1×2 show the primary only; loading and error states keep their 1×1 content (decision 6).
- Verified by: E2E group 3.

### AS-1X2-04 City hint at 1×2 shows pin and text
- Given: no city; metric cell displayed as 1×2 (seeded storage).
- When: page load.
- Then: hint tile shows pin and `Set a city` (one line at the 72px cell); dashed border; tap opens city modal. At 500×800 (64px cell) the text takes two lines and stays inside the tile.
- Verified by: E2E group 4.

### AS-1X2-05 Weather retry on 1×2 matches 2-high retry chrome
- Given: stale/error fixture, metric 1×2.
- When: tile in retry state.
- Then: dashed border, corner refresh **12px** at `top/right 4px`; its bounding box does not intersect the metric glyph's at 1280×800, 500×800 and 320×800 (cells 72/64/56) for all four metrics; behaviour per `docs/weather-tile-retry.md`.
- Verified by: E2E group 5.

### AS-1X2-06 Drag and drop preserves 1×2 footprint
- Given: edit mode, a 1×2 link on grid.
- When: drag to empty cell.
- Then: `w`/`h` unchanged; highlight matches 1×2.
- Verified by: E2E group 6.

### AS-1X2-07 Narrow window 320×600 does not clip 1×2 tiles
- Given: one 1×2 favorite and one 1×2 weather tile seeded.
- When: load at 320×600.
- Then: no horizontal scroll; tiles 56×118; tile content within cell (host ellipsized on one line, label ≤ 3 lines); weather primary 14px, its `scrollWidth ≤ clientWidth` with the longest fixture value (`100%`); typography readable (no zero-size text).
- Verified by: E2E group 7.

### AS-1X2-08 Size radiogroup fits at 320px dialog width
- Given: viewport **320×800**, Add link dialog open.
- When: measuring the Size radiogroup and its four options.
- Then: all labels **1×1**, **1×2**, **2×1**, **2×2** visible; at 320, 400 and 420px each option's label has `scrollWidth ≤ clientWidth` and the option rect lies inside the radiogroup rect, which lies inside the dialog content box (decision 11).
- Verified by: E2E group 8.

### AS-1X2-09 Tiles expose w/h only on the DOM (no data-tile-size)
- Given: desk with at least one favorite and one weather tile.
- When: inspecting tile nodes in the grid.
- Then: each has `data-w` and `data-h`; **`data-tile-size` is absent** (`hasAttribute("data-tile-size")` false; this step fails on today's `main`); `placeTile` in source does not assign `dataset.tileSize` (`newtabSource` pin inverted).
- Verified by: E2E smoke + `test/newtabSource.test.js`.

### AS-1X2-10 1×2 weather at the 64px cell
- Given: viewport 500×800 (cell 64, gap 8), precipitation and air quality at 1×2, fixture with a `100%` primary.
- When: page load.
- Then: tiles 64×136; primary 16px, secondary 10px; no primary or secondary has `scrollWidth > clientWidth`; secondary at most 2 lines.
- Verified by: E2E group 9.

### AS-1X2-11 Resize an existing tile to 1×2 and back
- Given: 1280×800 (14 columns, origin 7); seeded storage (stored frame) with the six system tiles in row 0 and links A `{x:-5,y:5,w:2,h:1}`, B `{x:1,y:5,w:2,h:1}`, C `{x:1,y:6,w:1,h:1}` (displayed A (2,5), B (8,5), C (8,6)); edit mode.
- When: Edit link → Size 1×2 → Save for each; then reopen Edit link.
- Then: A is stored `{x:-5,y:5,w:1,h:2}` (keeps its top-left cell); B cannot keep (8,5) because C is at (8,6), so `placeResized` scans its row from column 8 and puts it at displayed (9,5): stored `{x:2,y:5,w:1,h:2}`; reopening Edit link preselects 1×2; C and the system tiles keep their stored grids; Edit A → 2×1 restores `{x:-5,y:5,w:2,h:1}`.
- Verified by: E2E group 10; unit `placeResized` with `h: 2` already exists.

### AS-1X2-12 Keyboard focus on a 1×2 tile
- Given: 1280×800, a 1×2 favorite and a 1×2 weather tile.
- When: Tab through the grid.
- Then: each 1×2 tile receives focus in `(y, x)` order and its focus ring follows the 72×152 tile box.
- Verified by: E2E group 11.

### AS-1X2-13 Loading and error content at 1×2
- Given: a 1×2 precipitation tile; (a) weather loading, (b) error without a stored location.
- When: page load.
- Then: no city line; the values band is vertically centered between the glyph's bottom and the tile's bottom padding edge (±1 px); content as at 1×1 (decision 6).
- Verified by: E2E group 12.

## Review focus

- Selector discipline: **`[data-w="1"][data-h="2"]`** vs broad `[data-h="2"]`.
- Precipitation/AQI **tall** parity with **wide** secondary fields.
- Favorite text guard (`w === 2 || h === 2`).
- `data-tileSize` fully removed from DOM; no CSS keyed on it.
- Segmented control at 320 / 400 / 420px (Phase A expected).
- 1×2 weather type sizes per cell (20 only at 72).
- Regression: 1×1, 2×1, 2×2 tiles unchanged (checkpoint screenshots).

## Resolved decisions (owner)

| ID | Decision |
|----|----------|
| **OQ-1** | Chrome (Settings, Add): **1×1 only**; no 1×2 in this spec. |
| **OQ-2** | Remove DOM **`data-tileSize`**; **`data-w` / `data-h` only** on tiles (storage `tileSize` fallback on legacy read stays out of scope). |
| **OQ-3** | Size row at **320px**: Phase A tighter padding + E2E; if fail → Phase B **2×2** segment grid (no horizontal scroll). |
| **OQ-4** | Onboarding starters: parts 2 and 3; out of scope for this spec (part 1). |
| **OQ-5** | Size segment order: **1×1 → 1×2 → 2×1 → 2×2**. |

## Visual reference

Pixel-perfect mockup (owner-approved 2026-10-10): `widget-1x2-pixel-perfect.html`, archived next to the CSS in notes `superpowers/mockups/2026-10-10-tile-1x2/`; CSS reference for implementation: `.private/superpowers/mockups/2026-10-10-tile-1x2/widget-1x2-proposed.css`, drawn for the 72px cell only; where it differs from decisions 4, 7 and 10 (primary 22px, retry glyph 14px at 5px, one type size for every cell) **this spec wins**. Weather values band: **centered vertically** between glyph and city (approved adjustment).

## Copy (user-visible)

| Location | Text |
|----------|------|
| Size radiogroup | **1×2** (segment label only) |
| City hint 1×2 | `Set a city` (unchanged) |

No other new strings.
