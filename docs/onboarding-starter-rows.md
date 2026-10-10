# Onboarding step 2: full-width starter rows

## Status

`draft` — revision 2 (2026-10-10) after the initiative spec review (notes `pipeline/reports/onboarding-grid-initiative-spec-review.md`). **Part 3** of the onboarding-grid initiative. Renamed from `onboarding-starter-footprints.md`: the link footprint hints moved into part 2's normative island table (`docs/post-onboarding-grid.md` § Island table), so this spec covers only the step 2 list UI. Independent of part 1 and part 2; may ship in any order.

Decision: **do it**. Replace step 2's three-zone row (checkbox · text · preview tile) with **one full-width starter row** that looks like a grid link tile; the **20×20 check is on the right** of that row, not a separate column.

**Data compatibility: not required** (no storage change).

Companion: `onboarding-wizard-step2-starters-v1.html` (To-Be panel), archived in notes `superpowers/mockups/2026-10-10-onboarding-grid/`. Class names there (`starter-tile-check*`) are renamed to `onboarding-wizard__starter*`; the pixel layout must match.

Related: `docs/onboarding-wizard.md` (decision 5, AS-OB-04, AS-OB-17, AS-OB-26), `src/onboardingStarters.js`, `src/surfaces.css`, `test/borderContrast.test.js`.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-10 | Step 2: the cell **is** the control — full width, check **right**, vertically centered; no duplicate row label. | `confirmed` | Companion To-Be panel. |
| 2026-10-10 | OQ-P3-5: unchecked = mute the **entire** row. OQ-P3-6: checked = filled check only, **no** primary border on the row. | `confirmed` | § Decision log. |
| 2026-10-10 | Footprint hints (OQ-P3-2/3/4/7/8) superseded by part 2's island table. | `default` (spec review) | `docs/post-onboarding-grid.md` revision 2. |
| 2026-10-10 | Unchecked mute keeps text and check contrast (WCAG 1.4.3 / 1.4.11): grayscale on the whole row, opacity only on the icon. | `default` (spec review I7; owner may override) | § Default decision 3. |

## Current behaviour (`main` at review time)

Each starter is `label.onboarding-wizard__row` (`src/surfaces.css`): a 20×20 native checkbox (checked glyph drawn by `.onboarding-wizard__row:has(> input:checked)::before`), a `.onboarding-wizard__row-label` with the title, and `.onboarding-wizard__preview` → `.onboarding-wizard__preview-tile` (fixed 152×72, icon `.onboarding-wizard__preview-icon` or `--letter` fallback). Unchecked mutes only the preview (`opacity` + grayscale). The list is capped at about 3.5 rows (`max-height: calc(var(--cell-size) * 3.5 + var(--grid-gap) * 3)`). `test/borderContrast.test.js` pins the checkbox border via `.onboarding-wizard__row input[type="checkbox"]`.

## Default decisions (owner can override)

1. **Row structure.** One control per list item:

   ```html
   <li>
     <label class="onboarding-wizard__starter">
       <input type="checkbox" aria-label="Add {label} to your grid" … />
       <span class="onboarding-wizard__starter-surface">
         <img class="onboarding-wizard__starter-icon" … />   <!-- or the letter fallback span -->
         <span class="onboarding-wizard__starter-label">…</span>
         <span class="onboarding-wizard__starter-check" aria-hidden="true"></span>
       </span>
     </label>
   </li>
   ```

   - `.onboarding-wizard__starter`: `display: block`, `width: 100%`, `height: var(--cell-size)` (72 at 1280×800; `--cell-size` is set on `:root` by `applyGridMetrics`), `position: relative`, `cursor: pointer`.
   - Native checkbox: `position: absolute; inset: 0; margin: 0; opacity: 0;` — the whole row is its hit target; it stays the only focusable element of the row and keeps its `aria-label`.
   - `.onboarding-wizard__starter-surface`: flex row, `align-items: center`, `gap: 8px`, `padding: 0 10px`, height 100%, the border, radius and background of today's `.onboarding-wizard__preview-tile`; `pointer-events: none`.
   - Icon **22×22**, `border-radius: 4px`; the letter fallback keeps today's behaviour (`createOnboardingStarterPreview`), renamed to `.onboarding-wizard__starter-icon--letter`.
   - Label: own class `.onboarding-wizard__starter-label` (not `favorite-tile__label`, so grid tile rules never leak in), `flex: 1`, `min-width: 0`, one line with ellipsis, same font as today's row label.
   - `.onboarding-wizard__starter-check`: **20×20**, `border-radius: 6px`, last flex item (right), `flex-shrink: 0`; the border, background and checked glyph of today's checkbox move here.

2. **Checked.** `input:checked + .onboarding-wizard__starter-surface .onboarding-wizard__starter-check`: primary fill + contrast glyph (today's checked style). The row surface keeps `var(--border)`; no primary outline (OQ-P3-6 B).

3. **Unchecked: the whole row reads "off" without losing contrast.** On `input:not(:checked) + .onboarding-wizard__starter-surface`: `filter: grayscale(1)` on the surface; `opacity: 0.4` on the icon only. Label colour `var(--muted)`; the check keeps today's unchecked border token. Label and check stay above 4.5:1 and 3:1 against the surface, in light and dark. (Today's companion used `opacity: 0.4` on the whole surface; that drops the label below 4.5:1 on an enabled control.)

4. **Focus.** `input:focus-visible + .onboarding-wizard__starter-surface`: today's checkbox focus ring, drawn around the surface.

5. **Forced colors.** Under `@media (forced-colors: active)`: the check gets `border: 1px solid CanvasText`; checked → `background: Highlight` with the glyph in `HighlightText`; the focus ring uses `Highlight`.

6. **Remove obsolete CSS and DOM.** Delete `.onboarding-wizard__row`, `.onboarding-wizard__row-label`, `.onboarding-wizard__preview`, `.onboarding-wizard__preview-tile`, `.onboarding-wizard__preview-icon` (and `--letter`), the `:has(> input:checked)::before` glyph and the preview-only mute rule. `test/borderContrast.test.js` pins `.onboarding-wizard__starter-check` instead of the old checkbox selector.

7. **Unchanged.** Starter table, default-checked set, Finish payload and behaviour, list scroll cap (~3.5 rows of `--cell-size`), tab order, `aria-label`s, Space toggles, step-2 guards.

## Scope

- `src/newtab.js`: `buildOnboardingStep2` / `createOnboardingStarterPreview` → the row DOM of decision 1.
- `src/surfaces.css`: new `.onboarding-wizard__starter*` rules; delete the obsolete ones (decision 6).
- `test/borderContrast.test.js`: selector update; `test/newtabSource.test.js`: pin the new row structure and the absence of the preview.
- `docs/onboarding-wizard.md` (in the implementation PR): decision 5 UI bullet; AS-OB-04 (row height now `--cell-size`), AS-OB-17, AS-OB-26 (click anywhere on the row toggles) cross-link this spec.
- E2E: `dg-63-onboarding-starter-rows.mjs` (new) or groups added to `dg-60`.
- `CHANGELOG.md` `[Unreleased]`.

## Acceptance scenarios

Common setup: harness **1280×800**, wizard step 2, eight starters, light theme unless noted.

### AS-OSR-01 One full-width row per starter
- Given: step 2.
- When: inspecting the list.
- Then: 8 `label.onboarding-wizard__starter`; no `.onboarding-wizard__row-label`, `.onboarding-wizard__preview`; each row's width equals the list content width; height 72 px.
- Verified by: E2E; `newtabSource` pin.

### AS-OSR-02 Check on the right, centered
- Given: step 2, any row.
- When: measuring.
- Then: `.onboarding-wizard__starter-check` is 20×20, its right edge 10 px from the surface's right edge, its vertical center equals the row's (±1 px); the native input covers the whole row.
- Verified by: E2E.

### AS-OSR-03 Click anywhere toggles
- Given: an unchecked row.
- When: click on the label text, then on the icon, then on the check.
- Then: the state toggles on each click (checked, unchecked, checked); Space on the focused row toggles too.
- Verified by: E2E (replaces the AS-OB-26 preview click).

### AS-OSR-04 Unchecked row is off but readable
- Given: one unchecked and one checked row, light and dark theme.
- When: reading computed styles and contrast.
- Then: unchecked surface has `grayscale(1)`, its icon opacity 0.4; label contrast ≥ 4.5:1 and check border ≥ 3:1 against the surface in both themes; the checked row has no filter.
- Verified by: E2E computed style; `borderContrast` unit for the check border.

### AS-OSR-05 Checked row has no primary outline
- Given: a checked row.
- When: inspecting.
- Then: the check is primary-filled with the glyph; the surface border colour equals `--border`.
- Verified by: E2E.

### AS-OSR-06 Keyboard and names unchanged
- Given: step 2.
- When: Tab from the first row.
- Then: order is the eight checkboxes → Back → Finish; each checkbox named `Add {label} to your grid`; the focused row shows the focus ring around the surface.
- Verified by: E2E (AS-OB-17 adapted).

### AS-OSR-07 Narrow window
- Given: harness 320×600.
- When: step 2.
- Then: rows 56 px high (`--cell-size` 56), label ellipsized, check fully visible, no horizontal scroll; list cap still ~3.5 rows.
- Verified by: E2E.

### AS-OSR-08 Forced colors
- Given: `forced-colors: active` emulated.
- When: step 2 with one checked row.
- Then: the unchecked check has a visible border; the checked one is filled with `Highlight`.
- Verified by: E2E (emulated media).

## Decision log

| ID | Answer (2026-10-10) | Revision 2 |
|----|---------------------|------------|
| OQ-P3-1 | B: one spec for hints + UI. | UI only; hints moved to part 2. |
| OQ-P3-2, -3, -4, -7, -8 | Hints prune search; j-th added; interim 2×1; canonize companion JSON; part 2 may ship first. | Superseded by part 2's normative island table (j and the 2×1 not-fresh size live there). |
| OQ-P3-5 | A: mute the entire row. | Kept as intent; implemented as grayscale on the row + opacity on the icon (decision 3). |
| OQ-P3-6 | B: checked = filled check only. | Kept. |

## Non-goals

- Starter URLs, labels, default-checked set.
- Showing the future tile size in the row.
- Persisting checkbox state across reloads.

## Review focus

- Duplicate label gone; one focusable element per row.
- Contrast of the unchecked row in both themes (decision 3).
- List scroll cap and step 2 height unchanged at 1280×800 and 320×600.

## Process

Full UI pipeline (`quiet-tab-pipeline`); design checkpoint against the companion To-Be panel.
