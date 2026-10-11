# Tile size 1×2 follow-ups: shape glyphs, tone contrast, dark theme, forced colors, two tabs, engine tests

## Status

`implemented` — closes the open Minors 63 and 64 and every "not verified" item of `docs/tile-size-1x2.md` (run 24): the Size segments do not show which number is the width, text on rain-toned and other toned weather tiles fails WCAG contrast, dark theme and forced colors were never checked on 1×2 surfaces, two open tabs were never exercised, and the layout engine has no unit tests for a 1-wide, 2-high tile at the edges. Backlog 65 (checkpoint Minors L2-01, L2-02) is **closed as an accepted design decision** of the owner-approved mockup, as the Intake log row and the Accepted exceptions state it, not as a code change. Follow-up to `docs/tile-size-1x2.md` (`implemented`).

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`); storage shape unchanged.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-11 | "Ничего не оставляем на потом": check dark theme and forced colors on 1×2, check two open tabs, fix city-line contrast, make "1×2" / "2×1" readable as width × height, add engine unit tests for 1×2 at the edges. | `confirmed` | Owner chat after run 24; backlog 63–65, `design-review/runs/2026-10-11-1449745-final-r1`. |
| 2026-10-11 | Backlog 65 (checkpoint L2-01: icons of adjacent 1×2 links at different heights; L2-02: word broken at 320 px) is **not changed in code**: it is the consequence of the owner-approved mockup (the whole icon + label + host block centered vertically, `justify-content: center` of the 1×2 link tile in `src/newtab.css` and the visual reference of `docs/tile-size-1x2.md`). The owner can override: then it becomes a decision with an AS here. | `default, pending owner confirmation` | Run 27 spec review (M-N1). |
| 2026-10-11 | Size labels: **shape glyph + label** (not tooltip-only, not unchanged). | `confirmed` | Owner answer to the question "how to show width vs height". |

## Current behaviour (`main` after run 24)

- Size segments read `1×1 / 1×2 / 2×1 / 2×2` with no hint which number is the width. `createSegmentedControl` (`src/newtab.js:347-369`) accepts an optional third tuple element rendered as `<i class="segmented__glyph segmented__glyph--<name>" aria-hidden>`; no option uses it and no stylesheet has a rule for it. Its other users (`iconMode`, `backgroundColorSource`) pass two-element tuples.
- `.weather-tile__city` is `var(--muted)` (`src/newtab.css:582-590`; 1×2 override `:557-569`); `.weather-tile__glyph` is `var(--muted)` (`:489`). The tone backgrounds are `rgba(58,130,214, 0.12…0.6)` for `rain-1…rain-5` and a `linear-gradient` (alpha 0.18 → 0.06) for the other tones (`:716-738`). Measured at run 24: the city line on rain-5 is 2.58:1 (10px and 12px). Hand estimates for the light theme: rain-2 about 4.0, rain-3 about 3.5, rain-4 about 3.0, so more tones than rain-5 fail; the exact table is produced by AS-TSF-03.
- Dark theme is the `@media (prefers-color-scheme: dark)` block of `src/design-tokens.css:106`. It and forced colors were not exercised on 1×2 tiles, the 1×2 hint or the Size row. There is no `@media (forced-colors)` rule in `src/`.
- The selected Size segment is drawn with a background, a color and an inset `box-shadow` (`src/surfaces.css:491-496`, `src/controls.css:141-145`); forced colors drops background and shadow.
- Two new tab pages: an open tab does not listen to storage changes (`docs/architecture.md`); every mutation starts from fresh storage under the extension-wide lock.
- `test/desktopLayout.test.js` has no case with `w: 1, h: 2`.

## Default decisions (owner can override)

1. **Shape glyph per Size option.** Every option (1×1, 1×2, 2×1, 2×2) shows, before its label, an outline rectangle in the footprint's proportion. Unit **5 px**, a 1 px gap inside a 2-unit side: 1×1 **5×5**, 1×2 **5×11**, 2×1 **11×5**, 2×2 **11×11** (width × height). Border **1.5 px** `currentColor` (the browser rounds it at device pixel ratio 1; E2E does not assert the border width), `box-sizing: border-box` (the box sizes above include the border), radius **1.5 px**, `flex: none` (never shrinks), vertically centered. The gap to the label is the existing `--control-gap-icon` (6 px) of `.segmented__option`. At `max-width: 451px` the glyph uses **unit 4 px** (4×4, 4×9, 9×4, 9×9); from 452 px up unit 5. It is `<i class="segmented__glyph segmented__glyph--size-<w>x<h>" aria-hidden="true">`, drawn by CSS only (no `innerHTML`, no SVG). The visible label text is unchanged (`1×2` etc., `docs/tile-size-1x2.md` Copy).
2. **Accessible names (Label in Name, WCAG 2.5.3).** Each Size radio gets `aria-label` = `"<w>×<h>, <w> wide, <h> high"`: `1×1, 1 wide, 1 high`, `1×2, 1 wide, 2 high`, `2×1, 2 wide, 1 high`, `2×2, 2 wide, 2 high` (the visible text comes first). Set by `createSegmentedControl` through an optional fourth tuple element; the other segmented controls are unchanged. No `title`.
3. **Fit.** The glyph must not change the Size row geometry: AS-1X2-08 keeps passing, and every segment keeps **at least 2 px** of free room: `option.clientWidth − paddingLeft − paddingRight − (glyph width + gap + text width)` ≥ 2 px, the text width measured with a `Range` over the label text of the widest (selected, weight 600) option. Measured on the code before the glyph (run 27 review): the content box of an option is 48 px at 320, 68 at 400, 37 at 401 and 41 at 420 px, the widest text about 24.7 px (selected, weight 600, measured by Range; the E2E uses the measured value, not this constant); the dialog Size row is a column only up to 400 px, so 401–451 px is the tight range. Therefore the narrow segment rule (`white-space: nowrap`, unit 4 glyph) applies up to `max-width: 451px`, with `padding: 0 5px` in that range (padding is only reduced, never increased; in the old ≤ 400 px range it changes from 6 to 5 px). The rule moves out of the `max-width: 400px` block into its own `max-width: 451px` block; the row wrapping of the dialog stays in the 400 block. At 452 px and wider the content box is about 49 px and unit 5 fits.
4. **Contrast on toned weather tiles.** On every `.weather-tile[data-weather-tone]` (rain-1…rain-5, green, yellow, orange, red, purple, maroon, neutral) the city line and the metric glyph use `var(--text)` (the secondary line is already `var(--text)`, `src/newtab.css`); an untoned tile keeps `var(--muted)`. Requirement, measured (AS-TSF-03): text ≥ **4.5:1** (primary, secondary, city; 10px, 12px and larger sizes), glyph ≥ **3:1**, in light and dark, ready and stale, 1×1, 2×1, 1×2 and 2×2. Tone gradients and backgrounds are **not** changed. If a pair still fails after this rule, the failing text color on that tone is fixed by the same kind of override (`--text`), recorded in the plan ledger.
5. **Dark theme.** In dark theme: every text on a 1×2 link tile (label, host), every text on a 1×2 weather tile (primary, secondary, city), the 1×2 hint text, and the Size row (label) has contrast **≥ 4.5:1**; the Size glyph, the hint's dashed border (`--border-control`), the segmented group border (`--border-control`) and the focus ring have **≥ 3:1** against their backgrounds. Tile borders of link and weather tiles are decorative (`docs/border-contrast.md`, AS-CT-05 keeps exactly six `--border-control` users) and are **not** held to 3:1. Where a measured value is lower, the token or rule that produces it is fixed in this run (no new token unless unavoidable); a defect in a surface that part 1 did not touch is recorded in `backlog.md`, not fixed here (Non-goals).
6. **Forced colors.** With `forced-colors: active`: (a) the 1×2 link, weather and hint tiles keep a visible boundary (a border of width ≥ 1 px whose color differs from the Canvas color, probed with an element styled `background: Canvas`); (b) the focus ring of each tile is an outline of width ≥ 2 px whose color differs from Canvas; (c) the Size glyph border color differs from the background it sits on (Canvas, or Highlight when its segment is selected: HighlightText equals Canvas in the light scheme); (d) the **selected** Size segment is distinguishable from the unselected ones: a new `@media (forced-colors: active)` rule `.desktop-dialog .segmented__option:has(input:checked)` (the same specificity as the rule at `src/surfaces.css:491`, placed after it in `surfaces.css`; the dialogs' segmented controls: Icon, Color, Size) sets `forced-color-adjust: none` (otherwise Chromium paints a Canvas backplate under the label and HighlightText vanishes on it), `background: Highlight; color: HighlightText` (the glyph follows through `currentColor`); (e) while a Size radio has keyboard focus, its group `.segmented` (the element that draws the ring, `src/surfaces.css:430-434`) shows an outline of width ≥ 2 px, color ≠ Canvas; (f) nothing clips. Tone backgrounds are overridden by the UA (Accepted exceptions).
7. **Two tabs.** Tab A and tab B are open on the same profile. A resizes a link to 1×2; B shows its old state (no live update) until reload. B's next mutation starts from fresh storage: A's 1×2 survives it, no two stored tiles overlap, no error appears. B editing the **same** tile applies B's choice (last write wins). B reload shows the 1×2 tile.
8. **Engine unit tests.** `test/desktopLayout.test.js` gains cases for `w:1, h:2` tiles (with 2×1 and 1×1 neighbours) at 14, 6 and 4 columns: `placeResized` to 1×2 with the cell below occupied, with the right neighbour occupied, in the last column (stays in its own row, `firstFree` looks for a block of height 2); `canPlace` at the right edge and at the bottom limit; `maxDropRow` for `h = 2` in three separate cases (a short layout: `viewportRows − h` wins; a tall layout: `lowest other bottom + 1` wins; own row below both: own `y` wins); `clampDropCell` keeps `x ≤ columns − w` (`columns − 1` for a 1-wide tile; it does not take `h`); `displayLayout` of two adjacent 1×2 tiles and of a 1×2 overlapped by a stored neighbour. No engine code changes unless a test finds a defect.

## Scope

- `src/newtab.js`: `SIZE_OPTIONS` (glyph and accessible-name elements), `createSegmentedControl` (optional `aria-label` element).
- `src/controls.css`: `.segmented__glyph` and `--size-*` rules.
- `src/surfaces.css`: a new `@media (max-width: 451px)` block for the Size segments (`padding: 0 5px`, `white-space: nowrap`, glyph unit 4); the `@media (max-width: 400px)` block keeps the row-wrap rules; an `@media (forced-colors: active)` rule for the selected segment (`forced-color-adjust: none`, Highlight, HighlightText).
- `src/newtab.css`: `--text` on toned weather tiles (city and glyph; the secondary line is already `--text`); any dark-theme fix of 1×2 surfaces found by AS-TSF-04.
- `src/design-tokens.css`: only if AS-TSF-04 finds a failing token on a 1×2 surface.
- `test/newtabSource.test.js`: the `SIZE_OPTIONS` pin (today an exact regexp over two-element tuples, line ~950) is rewritten for the new tuples; new pins for the aria-label, glyph classes and `--text` rules. `test/desktopLayout.test.js` (decision 8).
- E2E: new `dg-66-tile-size-followups.mjs` (`dg-65` is reserved by run 25); `dg-64`, `dg-04`, `dg-29` expectations only if the Size row markup change breaks them.
- Docs: `docs/tile-size-1x2.md` (Copy: segment glyph and accessible names), `docs/design-system.md` (Size row, forced-colors rule), `CHANGELOG.md`; backlog rows 63–65 closed.

## Process

Full UI pipeline (`quiet-tab-pipeline`): spec review and spec gate → plan in notes → E2E-first implementation → one design checkpoint (after the Size-glyph, contrast and forced-colors tasks) → final code review of the branch → final design gate → independent verification. Run №27.

## Non-goals

- Changing tone gradients or any tile background; changing link/weather tile borders.
- Changing the visible Size label text, the option order or the stored values.
- Re-centering or re-laying out the 1×2 link tile (backlog 65; Accepted exceptions).
- Live sync between open tabs (`chrome.storage.onChanged`).
- Real screen-reader runs (VoiceOver / NVDA): not automatable here; the accessible names and the accessibility tree are asserted instead.
- Fixing a dark-theme or forced-colors defect of a surface part 1 did not touch (recorded in `backlog.md`).
- Engine behaviour changes.

## Accepted exceptions

- In forced colors the UA replaces tile backgrounds and tone colors; only the items of decision 6 are required.
- An open tab stays stale until its next mutation or reload; a stale tab editing the same tile overwrites it (last write wins, decision 7).
- With `prefers-reduced-motion`, a stale tile in the busy state dims its values (primary, secondary) to opacity 0.7 (`docs/weather-tile-retry.md`, existing transient state); the contrast matrix of AS-TSF-03 measures the resting states only.
- The 1×1 shape glyph at unit 4 (4×4 with a 1 px border at device pixel ratio 1) reads as a small ring, not a square (checkpoint L1-01 / V2-02); the sizes are fixed by decisions 1 and 3.
- In the Icon row of the same dialog the free room at 401 px is 1 px (measured, checkpoint V2R2-01): the label does not clip and that row is not changed by this run except for the narrower padding.
- **Backlog 65 (checkpoint L2-01, L2-02).** The 1×2 link tile centers the whole icon + label + host block (owner-approved mockup, `docs/tile-size-1x2.md` decision 2), so the icons of two adjacent 1×2 links sit at different heights when their labels wrap to a different number of lines; and on a 56 px cell a long word is broken inside the word (`overflow-wrap: anywhere`) instead of being clipped. Both stay as designed.

## Acceptance scenarios

### AS-TSF-01 Size segments show the footprint shape
- Given: Add link, Edit link and Edit weather dialogs, 1280×800.
- When: open each Size row.
- Then: four segments in order 1×1, 1×2, 2×1, 2×2; each has a `.segmented__glyph` whose box is 5×5, 5×11, 11×5, 11×11 px (±0.5), left of its label, vertically centered (±1 px); the glyph is `aria-hidden`; the visible text of each segment is unchanged; each radio's `aria-label` is `1×1, 1 wide, 1 high`, `1×2, 1 wide, 2 high`, `2×1, 2 wide, 1 high`, `2×2, 2 wide, 2 high`; the glyph border color equals the segment text color (selected and unselected); the other segmented controls (Icon, Color) have no glyph and no `aria-label` change.
- Verified by: E2E `dg-66` group 1; `newtabSource` pins.

### AS-TSF-02 Size row still fits
- Given: Add link at 320, 400, 401, 420, 451 and 452 px.
- When: open the Size row; select the 2×2 option (widest text).
- Then: AS-1X2-08 holds (each label unclipped, inside the radiogroup, radiogroup inside the dialog) with glyphs present, and every segment has ≥ 2 px of free room by the formula of decision 3; the glyph box is 4×4, 4×9, 9×4, 9×9 at 320–451 px and 5×5, 5×11, 11×5, 11×11 at 452 px; no horizontal scroll.
- Verified by: E2E `dg-66` group 2 (and `dg-64` group 8 stays green).

### AS-TSF-03 Contrast on toned weather tiles
- Given: city set; fixtures per metric — precipitation probability 0, 10, 30, 50, 70, 90 (tones `neutral`, `rain-1…rain-5`), US AQI 25, 75, 125, 175, 250, 400 (green, yellow, orange, red, purple, maroon), temperature pairs producing green (today 18, yesterday 18), yellow (today 27 and yesterday 27 at 15:00) and orange (today 33), UV 1, 4 and 8 (green, orange, red; `src/weatherPresentation.js`); sizes 1×1, 2×1, 1×2, 2×2; ready and stale; light and dark.
- When: render.
- Then: for each tile, the contrast of the primary, secondary and city text against the composited background is ≥ 4.5:1 and of the metric glyph ≥ 3:1 (the secondary line is already `--text`; city and glyph are the changed ones). Compositing in the page: the worst stop of the tile background (`--weather-tone-rgb` at the largest alpha of its gradient or solid `rgba`, over `getComputedStyle(body).backgroundColor`) — for dark text on a dark tone and light text on a light tone alike the worst-case stop is used. A table (tone, theme, size, element, ratio) is written to the E2E report.
- Verified by: E2E `dg-66` group 3.

### AS-TSF-04 Dark theme on 1×2 surfaces
- Given: `colorScheme: dark`; a 1×2 link with accent colors default `105,168,255`, white, yellow and red; 1×2 weather tiles (ready, stale, error, loading); a 1×2 hint; the Add link dialog Size row; windows 1280×800, 500×800, 320×600.
- When: render; focus each tile with Tab.
- Then: link label and host, weather primary/secondary/city, hint text and Size labels ≥ 4.5:1; Size glyph, the hint's dashed border, the `.segmented` border and the focus ring ≥ 3:1; no clipping; no horizontal scroll. Link and weather tile borders are not asserted (decision 5).
- Verified by: E2E `dg-66` group 4 (computed styles; failing values listed in the FAIL line).

### AS-TSF-05 Forced colors on 1×2 surfaces
- Given: `forcedColors: active`, light scheme; the same surfaces as AS-TSF-04 plus the Edit link dialog with the 1×2 option selected.
- When: render; focus each tile and the Size radios with Tab.
- Then: the items (a)–(f) of decision 6: tile boundary border ≥ 1 px with color ≠ Canvas; focus outline ≥ 2 px with color ≠ Canvas; Size glyph border ≠ the background it sits on (Canvas; Highlight when selected); the selected Size segment has the `Highlight` background and the unselected ones do not; while a Size radio is focused the `.segmented` group outline is ≥ 2 px with color ≠ Canvas; no clipping.
- Verified by: E2E `dg-66` group 5.

### AS-TSF-06 Two open tabs
- Given: tabs A and B on the same profile, a desk with links f0, f1, f2 and the default tiles.
- When: (1) A edits f0 to 1×2; (2) B (still showing the old state) renames f1; (3) B adds a link; (4) B drags f2 onto the cell under A's 1×2 tile; (5) B edits f0 to 2×1; (6) B reloads; (7) A adds a link.
- Then: after (2) f0 is still 1×2 in storage and no two stored tiles overlap, B shows no error; after (3) the new link overlaps nothing (placed from fresh storage); after (4) the drop is refused (`That spot is taken` in `#desktop-status`) and storage is unchanged; after (5) f0 is 2×1 (last write wins) with no overlap; after (6) B shows f0 as 2×1 and f1 with the new name; after (7) A's new link overlaps nothing. "No overlap" is asserted on the stored `grid` rectangles in one coordinate frame (stored signed x).
- Verified by: E2E `dg-66` group 6 (two pages in one context; helpers of `dg-26-two-tabs.mjs`).

### AS-TSF-07 Engine edge cases for a 1×2 tile
- Given: layouts at 14, 6 and 4 columns with 1×2, 2×1, 1×1 tiles at the right edge and the bottom limit.
- When: `placeResized`, `canPlace`, `maxDropRow`, `clampDropCell`, `displayLayout` are called as in decision 8.
- Then: results match the code's documented rules: resize keeps the cell when the 1×2 block is free, else the first free block of height 2 in the own row from the nearest column that fits (never left of its own column), then the rows below from column 0; a 1×2 in the last column fits; `clampDropCell` keeps `x ≤ columns − w`; `maxDropRow` is `max(lowest other bottom + 1, viewportRows − h, own y)` and each of the three terms wins in its own test.
- Verified by: unit `test/desktopLayout.test.js`.

## Review focus

- Glyph proportions read as width × height at a glance (1×2 is tall, 2×1 is wide); selected and focused segment states; the glyph never pushes a label out at 320 px.
- Every tone × theme × size combination (AS-TSF-03): no tone missed, secondary and glyph included; stale dashed tiles.
- Dark theme of the 1×2 surfaces beyond the city line (link host line, secondary line, hint text); link accent extremes.
- Forced colors: tile boundary, focus ring, the selected segment and its glyph are not lost.
- Two tabs: no data loss and no overlap after the stale tab's mutations; the refused drop.
- The accessible name starts with the visible text.

## Copy (user-visible)

- Visible: unchanged (`1×1`, `1×2`, `2×1`, `2×2`).
- Accessible only (radio `aria-label`): `1×1, 1 wide, 1 high`, `1×2, 1 wide, 2 high`, `2×1, 2 wide, 1 high`, `2×2, 2 wide, 2 high`.
