# Tile size 1×2 follow-ups: shape glyphs, city-line contrast, dark theme, forced colors, two tabs, engine tests

## Status

`draft` — closes every open Minor and every "not verified" item of `docs/tile-size-1x2.md` (run 24): the Size segments do not show which number is the width, the city line on a rain-toned tile fails WCAG contrast, dark theme and forced colors were never checked on 1×2 surfaces, two open tabs were never exercised, and the layout engine has no unit tests for a 1-wide, 2-high tile at the edges. Follow-up to `docs/tile-size-1x2.md` (`implemented`).

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`); storage shape unchanged.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-11 | "Ничего не оставляем на потом": check dark theme and forced colors on 1×2, check two open tabs, fix city-line contrast, make "1×2" / "2×1" readable as width × height, add engine unit tests for 1×2 at the edges. | `confirmed` | Owner chat after run 24; backlog 63–65, `design-review/runs/2026-10-11-1449745-final-r1`. |
| 2026-10-11 | Size labels: **shape glyph + label** (not tooltip-only, not unchanged). | `confirmed` | Owner answer to the question "how to show width vs height". |

## Current behaviour (`main` after run 24)

- Size segments read `1×1 / 1×2 / 2×1 / 2×2` with no hint which number is the width. `createSegmentedControl` already accepts an optional third tuple element rendered as `<i class="segmented__glyph segmented__glyph--<name>" aria-hidden>` but no option uses it and `src/controls.css` has no rule for it.
- `.weather-tile__city` is `var(--muted)`. On a tile with `data-weather-tone="rain-5"` (background `rgba(58,130,214,0.6)`) the 10px city line measures 2.58:1 (the 12px city line of a 2×2 tile the same); on the other tones 4.66–4.89:1.
- Dark theme (`@media (prefers-color-scheme: dark)` in `src/design-tokens.css`, `src/surfaces.css`) and forced colors were not exercised on 1×2 tiles, the 1×2 hint or the Size row.
- Two new tab pages: an open tab does not listen to storage changes (`docs/architecture.md`); every mutation starts from fresh storage under the extension-wide lock. Never exercised for 1×2.
- `test/desktopLayout.test.js` has no case with `w: 1, h: 2`.

## Default decisions (owner can override)

1. **Shape glyph per Size option.** Every option (1×1, 1×2, 2×1, 2×2) shows, before its label, an outline rectangle in the footprint's proportion: unit **5 px**, a block gap of **1 px** inside a 2-unit side: 1×1 **5×5**, 1×2 **5×11**, 2×1 **11×5**, 2×2 **11×11** (width × height), border **1.5 px** `currentColor`, radius **1.5 px**, the glyph is aligned to the vertical center, gap to the label **4 px**. It is `<i class="segmented__glyph segmented__glyph--size-<w>x<h>" aria-hidden="true">`, drawn by CSS only (no `innerHTML`, no SVG). The visible label text is unchanged (`1×2` etc., spec `docs/tile-size-1x2.md` Copy).
2. **Accessible names.** Each Size radio gets `aria-label` = `"<w> wide, <h> high"` (`1 wide, 1 high`, `1 wide, 2 high`, `2 wide, 1 high`, `2 wide, 2 high`), set by `createSegmentedControl` through an optional fourth tuple element (the other segmented controls are unchanged). No `title`.
3. **Fit.** The glyph must not change the Size row geometry: AS-1X2-08 (labels unclipped, radiogroup inside dialog at 320, 400, 420 px) keeps passing. Segment padding is not increased; if a label clips at 320 px the glyph is reduced to unit 4 px (4×4, 4×9, 9×4, 9×9) at `max-width: 400px` only.
4. **City-line color.** `.weather-tile__city` uses `var(--text)` on every tile that has `data-weather-tone` (rain-1…rain-5, green, yellow, orange, red, purple, maroon, neutral), in light and dark; an untoned tile keeps `var(--muted)`. Measured requirement: contrast of the city line against the composited tile background **≥ 4.5:1** for every tone, in both themes, for the 10px (1×2) and 12px (2×2) line, in ready and stale states. Tone gradients are **not** changed.
5. **Dark theme.** In dark theme every text on a 1×2 link tile (label, host), every text on a 1×2 weather tile (primary, secondary, city), the 1×2 hint text, and the Size row (label, glyph) has contrast **≥ 4.5:1** (text) / **≥ 3:1** (glyph, borders, focus ring) against its composited background. Where a measured value is lower, the token or rule that produces it is fixed in this run (no new token unless unavoidable); a defect in a surface that part 1 did not touch is recorded in `backlog.md`, not fixed here (Non-goals).
6. **Forced colors.** With `forced-colors: active`: the 1×2 link, weather and hint tiles keep a visible boundary (the border is not transparent and not equal to the canvas color), the focus ring is visible (non-`none` outline with a non-canvas color), the Size glyph is visible (its border resolves to a non-canvas color), text is readable (the UA overrides), nothing clips. Tone backgrounds are overridden by the UA (Accepted exceptions).
7. **Two tabs.** Tab A and tab B are open on the same profile. A resizes a link to 1×2. B shows its old state (no live update) until reload. B's next mutation (rename another link, add a link) starts from fresh storage: A's 1×2 footprint survives, no tile overlaps, no error appears. B after reload shows the 1×2 tile.
8. **Engine unit tests.** `test/desktopLayout.test.js` gains cases for a `w:1, h:2` tile (and a 2×1 and 1×1 next to it) at the right edge and the bottom limit: `placeResized` to 1×2 with the cell below occupied, with the right neighbour occupied, in the last column; `canPlace` / `maxDropRow` / `clampDropCell` with `h = 2` at the last row of the first screen and one row below the lowest tile; `displayLayout` of two adjacent 1×2 tiles and of a 1×2 overlapped by a stored neighbour. No engine code changes unless a test finds a defect.

## Scope

- `src/newtab.js`: `SIZE_OPTIONS` (glyph and accessible-name elements), `createSegmentedControl` (optional `aria-label` element).
- `src/controls.css`: `.segmented__glyph` and `--size-*` rules (and the narrow `max-width: 400px` variant if needed).
- `src/newtab.css`: city-line color on toned tiles; any dark-theme fix of 1×2 surfaces found by AS-TSF-03.
- `src/design-tokens.css` / `src/surfaces.css`: only if AS-TSF-03 or AS-TSF-04 finds a failing token on a 1×2 surface.
- `test/newtabSource.test.js` pins, `test/desktopLayout.test.js` (decision 8).
- E2E: new `dg-66-tile-size-followups.mjs`; `dg-64`, `dg-04`, `dg-29` expectations only if the Size row markup change breaks them.
- Docs: `docs/tile-size-1x2.md` (Copy: segment glyph and accessible names), `docs/design-system.md` (Size row), `CHANGELOG.md`, `backlog.md` rows 63–65 closed.

## Process

Full UI pipeline (`quiet-tab-pipeline`): spec review and spec gate → plan in notes → E2E-first implementation → one design checkpoint (after the Size glyph and city-contrast tasks) → final code review of the branch → final design gate → independent verification. Run №27, E2E `dg-66`.

## Non-goals

- Changing tone gradients (colors of `data-weather-tone`) or any tile background.
- Changing the visible Size label text, the option order or the stored values.
- Live sync between open tabs (`chrome.storage.onChanged`).
- Real screen-reader runs (VoiceOver / NVDA): not automatable here; the accessible names and tree are asserted instead.
- Fixing a dark-theme or forced-colors defect of a surface part 1 did not touch (recorded in `backlog.md`).
- Engine behaviour changes.

## Accepted exceptions

- In forced colors the UA replaces tile backgrounds and tone colors; only boundary, focus ring, glyph and text visibility are required (decision 6).
- An open tab stays stale until its next mutation or reload (existing design, decision 7).

## Acceptance scenarios

### AS-TSF-01 Size segments show the footprint shape
- Given: Add link, Edit link and Edit weather dialogs, 1280×800.
- When: open each Size row.
- Then: four segments in order 1×1, 1×2, 2×1, 2×2; each has a `.segmented__glyph` whose box is 5×5, 5×11, 11×5, 11×11 px (±0.5) and sits left of its label, vertically centered (±1 px); the glyph is `aria-hidden`; the visible text of each segment is unchanged; each radio's `aria-label` is `1 wide, 1 high`, `1 wide, 2 high`, `2 wide, 1 high`, `2 wide, 2 high`; the glyph border color equals the segment text color (selected and unselected).
- Verified by: E2E `dg-66` group 1; `newtabSource` pins.

### AS-TSF-02 Size row still fits
- Given: Add link at 320, 400, 420 px.
- When: open the Size row.
- Then: AS-1X2-08 holds (each label unclipped, inside the radiogroup, radiogroup inside the dialog) with glyphs present; no horizontal scroll.
- Verified by: E2E `dg-66` group 2 (and `dg-64` group 8 stays green).

### AS-TSF-03 City-line contrast
- Given: city set; precipitation, temperature, air quality and UV tiles in every tone (rain-1…rain-5, green, yellow, orange, red, purple, maroon, neutral); sizes 1×2 and 2×2; ready and stale; light and dark.
- When: render.
- Then: contrast of `.weather-tile__city` against the composited tile background (tile `background` over the page/panel background, alpha handled) is ≥ 4.5:1 in every case.
- Verified by: E2E `dg-66` group 3 (computed colors, composited in the page).

### AS-TSF-04 Dark theme on 1×2 surfaces
- Given: `colorScheme: dark`; a 1×2 link, 1×2 weather tiles (ready, stale, error, loading), a 1×2 hint, the Add link dialog Size row; windows 1280, 500, 320.
- When: render; focus each tile with Tab.
- Then: all texts ≥ 4.5:1; glyph, tile border, focus ring ≥ 3:1 against their backgrounds; no clipping; no horizontal scroll.
- Verified by: E2E `dg-66` group 4 (computed styles; failing values listed in the FAIL line).

### AS-TSF-05 Forced colors on 1×2 surfaces
- Given: `forcedColors: active` (and light scheme); the same surfaces as AS-TSF-04.
- When: render; focus each tile with Tab.
- Then: each tile boundary is a visible border (width ≥ 1 px, color ≠ canvas); the focus ring is an outline with width ≥ 2 px and color ≠ canvas; the Size glyph border color ≠ canvas; no clipping.
- Verified by: E2E `dg-66` group 5.

### AS-TSF-06 Two open tabs
- Given: tabs A and B on the same profile, a desk with links f0, f1 and the default tiles.
- When: A edits f0 to 1×2; B (still showing the old state) renames f1; then B reloads; then A adds a link.
- Then: after B's rename f0 is still 1×2 in storage and no two tiles overlap; B shows no error; after reload B shows f0 as 1×2 and f1 with the new name; A's added link does not overlap anything and f0 stays 1×2.
- Verified by: E2E `dg-66` group 6 (two pages in one context).

### AS-TSF-07 Engine edge cases for a 1×2 tile
- Given: layouts at 14, 6 and 4 columns with 1×2, 2×1, 1×1 tiles at the right edge and the bottom limit.
- When: `placeResized`, `canPlace`, `maxDropRow`, `clampDropCell`, `displayLayout` are called as in decision 8.
- Then: results match the documented rules (resize keeps the cell when free, else the first free block in the own row to the right, then rows below from column 0; a 1×2 at the last column fits; `clampDropCell` keeps `x ≤ columns − 1`; `maxDropRow` for `h = 2` is `viewportRows − 2` on the first screen).
- Verified by: unit `test/desktopLayout.test.js`.

## Review focus

- Glyph proportions read as width × height at a glance (1×2 is tall, 2×1 is wide); selected and focused segment states; glyph does not push the label out at 320 px.
- Every tone × theme × size combination of the city line (AS-TSF-03): no tone missed; stale dashed tiles.
- Dark theme of the 1×2 surfaces beyond the city line (link host line, secondary line, hint text).
- Forced colors: the tile boundary and the focus ring are not lost with `background` only styling.
- Two tabs: no data loss and no overlap after the stale tab's mutation.

## Copy (user-visible)

- Visible: unchanged (`1×1`, `1×2`, `2×1`, `2×2`).
- Accessible only: `1 wide, 1 high`, `1 wide, 2 high`, `2 wide, 1 high`, `2 wide, 2 high` (radio `aria-label`).
