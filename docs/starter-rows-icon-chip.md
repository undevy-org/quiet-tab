# Onboarding starter rows: light backdrop under favicons in the dark theme, CSS tidy-up

## Status

`implemented` — revision 4 (2026-10-14, after spec review rounds 1–3, spec gate rounds 1–2 (`2026-10-14-f4d4d33-spec-r2`) and the live probe). Run №34 (`starter-rows-icon-chip`). A follow-up of run 33 (`docs/starter-rows-polish.md`, backlog 87 and 88).

**Data compatibility: not required** (no storage change).

Related: `docs/starter-rows-polish.md` (decision 2), `docs/onboarding-starter-rows.md`, `src/surfaces.css`, `src/design-tokens.css`.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-14 | Fix backlog 87 (a dark favicon is nearly invisible in an unchecked row of the dark theme) and 88 (style notes on the run 33 CSS). | `confirmed` | § Decisions 1, 2 |
| 2026-10-14 | For 87: a light backdrop under the favicon (owner picked it over "accept as an exception" and "leave open"). | `confirmed` | § Decision 1 |

## Current behaviour (`main` after run 33, `b9ef8df`)

- A starter row shows a favicon `img.onboarding-wizard__starter-icon` (22×22, radius 4) with no background, straight on the row surface (`--panel`). In the dark theme the panel is `rgb(29,34,41)`: a black favicon pixel has 1.31:1 against it at full strength and about 1.15:1 in an unchecked row (`opacity: 0.4` plus `grayscale(1)`), so no `opacity` value can make a dark favicon readable (found by the run 33 checkpoint skeptic, S2-01).
- The letter fallback (`.onboarding-wizard__starter-icon--letter`) has its own chip (`background: var(--soft-fill)`) and is not affected.
- `src/surfaces.css` (run 33): the unchecked `img` rule and the unchecked `--letter` rule both repeat `filter: grayscale(1)`; the hover-chip comment does not say that an unchecked letter is already at `opacity` 0.6; the busy comment does not say that the busy `opacity` sits on the surface (so the focus ring is dimmed too, which cannot show on a disabled row).

## Default decisions (owner can override)

1. **Light backdrop under the favicon (backlog 87).** A new token `--icon-backdrop` in `src/design-tokens.css`: `transparent` in the light theme, `#eef1f5` (the light `--color-fill-soft`) in the dark theme (inside the existing `@media (prefers-color-scheme: dark)` block). `img.onboarding-wizard__starter-icon` gets `background: var(--icon-backdrop)` in every row (checked and unchecked, so the two states look alike). The letter chip is unchanged. The backdrop is part of the `img`, so an unchecked row fades it with the icon (`opacity: 0.4`) and the busy surface fades it with the row (`opacity: var(--control-disabled-opacity)`). Under `forced-colors: active` the browser replaces the backdrop; nothing is added there. Light theme: nothing changes (transparent). Run 32's default-icon check (`[data-icon-check]`, `visibility: hidden` while pending, the letter swap) is untouched. Measured target (computed by the reviewer from the tokens `#eef1f5` and the dark `--panel` `#1d2229`): the whole `img` (backdrop and glyph) is blended with the panel at the row's icon `opacity`, so a black glyph pixel is `over(black, --panel, α)` and the backdrop is `over(backdrop, --panel, α)`: 3.96:1 at α 0.4 (unchecked) and 18.5:1 at α 1 (checked), against 1.15:1 and 1.31:1 for the bare glyph today. The backdrop fills the whole 22×22 box (also the `object-fit: contain` margins) with the 4px corners of the `img`; `grayscale(1)` moves it by at most 4.35 on the blue channel (measured shift `[3, 0, 4]` at opacity 1). The grid tiles are out of scope. (Run 35, `docs/favicon-backdrop.md`: a real-favicon probe confirmed this decision and added no per-icon backdrop; the "every row" rule stands.)
2. **CSS tidy-up (backlog 88), behaviour-neutral.** The two unchecked icon rules share one `filter: grayscale(1)` declaration through a plain selector list (`OFF img.onboarding-wizard__starter-icon, OFF .onboarding-wizard__starter-icon--letter { filter: grayscale(1) }`, no `:is`, because the run 33 test helper `selectorList` splits on commas) and keep one `opacity` rule each (0.4 and 0.6); `SRP pin 3` of run 33 is rewritten for this shape (both fragments in exactly one rule with `grayscale(1)`, exactly one `opacity` rule per kind, every other starter rule without `filter`); the hover-chip comment says an unchecked letter is already at 0.6; the busy comment says the `opacity` sits on the surface. The computed styles of every row state (rest, hover, focus, busy, forced colors, both themes) stay byte-identical to run 33, apart from decision 1.
3. **Unchanged.** Everything else of `docs/starter-rows-polish.md` (hover fill, busy values, pills, the unchecked surface colour), the DOM, sizes, tab order, names, Finish, storage, `newtab.js`.

## Scope

- `src/design-tokens.css` (token), `src/surfaces.css` (backdrop rule, merged filter rule, comments).
- `test/newtabSource.test.js` (pins: token in both themes, `img` background rule, no `background` for the `img` inside `@media (forced-colors: active)`, `SRP pin 3` rewritten for the merged filter rule), `test/borderContrast.test.js` (unit: black glyph over its backdrop, both blended with `--panel` at α 0.4 ≥ 3:1 and at α 1 ≥ 10:1; the dark value read from the dark token slice, the light value `transparent` asserted separately because `rgba()` does not parse the keyword; each proven by mutation).
- `.private/e2e/scenarios/dg-76-starter-rows-icon-chip.mjs` (next free number; it builds its own PNG favicons: a black 16×16 square centred on a transparent 32×32, a generator like `dg-74:74`, the `_favicon` route set before the first load); `dg-75` changes by ONE check (`dg-75-starter-rows-polish.mjs:336`, "no chip behind the img": light stays transparent, dark expects the resolved `--icon-backdrop`, the token added to its `tokens()`); `dg-73` does not read the icon background and stays green.
- `docs/design-system.md` (a row for `--icon-backdrop`, near the `--soft-fill` tokens).
- `docs/starter-rows-polish.md` (decision 2: the favicon now sits on a backdrop in the dark theme; the "no opacity can fix it" note), `docs/onboarding-starter-rows.md` only if it describes the bare favicon, `CHANGELOG.md` `[Unreleased]`, this spec (`implemented`).

## Acceptance scenarios

Common setup: harness **1280×800**, wizard step 2, eight starters; `_favicon` answered with a PNG of a black 16×16 square centred on a transparent 32×32 for the favicon rows (the worst case of backlog 87: a dark glyph that does not cover the box) and failed for one row (letter); tokens resolved through probe spans. The glyph pixel is read at (11, 11) of the 22×22 icon box and the backdrop pixel at (3, 3) from the box's top-left corner (inside the 4px corner radius; (0, 0) is outside the rounded corner), from a screenshot clip, with a tolerance of ±3 per channel; the 2.5:1 threshold applies to the pixel sample of the unchecked row only (softer than the computed 3:1, so the dark pixel does not make the check flaky); a hovered unchecked favicon row keeps the backdrop and the hover fill, its label stays ≥ 4.5:1 on the hover fill (run 33 numbers; the backdrop/hover-fill contrast is 4.11:1) and a busy row fades the backdrop with the surface (`opacity` 0.62).

### AS-ICB-01 Dark theme: the favicon sits on a light backdrop
- Given: dark theme, a favicon row checked and the same row unchecked.
- When: reading computed styles of `img.onboarding-wizard__starter-icon`.
- Then: `background-color` equals the resolved `--icon-backdrop` (`rgb(238, 241, 245)`); the glyph pixel against the backdrop pixel is ≥ 10:1 in the checked row (computed 18.5) and ≥ 3:1 in the unchecked row (icon `opacity` 0.4, `grayscale(1)`; computed 3.96): the assertion is the computed ratio of the blended colours, the pixel sample is a sanity check with the tolerance above.
- Verified by: E2E `dg-76`; unit in `test/borderContrast.test.js`.

### AS-ICB-02 Light theme and forced colors are unchanged
- Given: light theme; forced colors (light and dark).
- When: reading computed styles of the favicon `img`.
- Then: light theme: `background-color` is transparent (alpha 0, `rgba(0, 0, 0, 0)`); forced colors: the dark theme (token `#eef1f5`) computes the probe-resolved Canvas, equal to the surface's own background (not painted differently); the light theme (token `transparent`) computes what it computes without the change (measured by the probe: `rgba(255, 255, 255, 0)`, alpha 0, the same with and without the change; the dark theme computes `rgb(0, 0, 0)` with the change and `rgba(0, 0, 0, 0)` without it); and no rule inside `@media (forced-colors: active)` sets a `background` on `img.onboarding-wizard__starter-icon` (source pin).
- Verified by: E2E `dg-76`; `newtabSource` pin.

### AS-ICB-03 Letter chip, busy and hover are unchanged
- Given: dark theme.
- When: reading the letter icon, a hovered favicon row, and a busy row (held write, `failStorageSetAfter` key `quietTabWidgetsMeta`, 9000 ms).
- Then: the letter chip stays `--soft-fill` (hover: `--soft-fill-strong`); a hovered favicon row keeps the backdrop and the hover fill; a busy row keeps surface `opacity` 0.62 with the backdrop faded by it; `dg-73` stays green unchanged and `dg-75` stays green after its one amended check (Scope).
- Verified by: E2E `dg-76`, `dg-75`, `dg-73` (full run).

### AS-ICB-04 CSS tidy-up changes no computed style
- Given: both themes and forced colors.
- When: comparing the computed `filter`, `opacity`, `background-color`, `cursor` of surface, icon (favicon and letter) and label in rest, checked, unchecked, hover, focus and busy states against run 33.
- Then: identical, except the favicon `background-color` of decision 1 in the dark theme; the unchecked `img` and letter still carry `grayscale(1)` with `opacity` 0.4 and 0.6.
- Verified by: E2E `dg-75` (green after its one amended check) and `dg-73`, `newtabSource` pins.

## Paint-only

The change is a background colour on the favicon `img` plus a CSS tidy-up: no geometry, text, DOM, tab order or animation changes, at every window width (500, 320 and the 600 px high window included), so keyboard behaviour and `prefers-reduced-motion` are untouched; `dg-73` AS-OSR-10 geometry checks must stay green.

## Review focus

- Does the light chip look right in the dark panel (a bright square next to the muted label), checked and unchecked? Is it too loud in a checked row? (AS-ICB-01)
- A favicon with its own transparent background and a light glyph (white on transparent) on the light chip: unreadable? (the case the chip creates; the owner accepted the trade-off, the lens reports how bad it is)
- The checked row: bright squares (about 14:1 against the panel) next to quiet letter chips (about 1.2:1, 1.22 computed) in one list: is the list uneven?
- Busy and hover look unchanged (AS-ICB-03).

## Accepted exceptions

- A light favicon with a transparent background (a white glyph) is now white on `#eef1f5` in the dark theme: weaker than before. Accepted with the owner's choice of a light backdrop; a per-icon luminance check is out of scope.
- The grid tiles keep bare favicons.
- Under forced colors there is no backdrop (browser override); a black glyph stays hard to see in forced colors dark, as before.
- A white or light glyph on a transparent background is weaker on the light backdrop in the dark theme: computed 1.13:1 (checked) and 1.09:1 (unchecked), against about 16:1 on the bare panel before (15.99 computed). One class of invisible icons replaces the other, by the owner's choice.
- While the run 32 default-icon check is pending (`[data-icon-check="pending"]`, `visibility: hidden`) the `img` and its backdrop are hidden together, a failing image is replaced by the letter while hidden, and the light square first shows after the verdict `done` (probe: no frame with the square on a failed load; the pending state ends at about 1.5 s with a slow sentinel). A skipped check was not observed on a reachable path: the wizard builds all eight rows before any verdict exists, so every `img` is `pending` first (run 35). Other low-contrast glyphs (grey, tinted) also get weaker against `#eef1f5`, not only white.
- A busy unchecked row (`opacity` 0.62 on the surface, 0.4 on the icon) measures 2.35:1: the row is inactive, the threshold does not apply.
- **Probe of run 35 on real favicons** (69 icons: the eight starters and 61 popular domains, Google's favicon proxy at 32 px, not Chrome's `_favicon`; `pipeline/reports/favicon-backdrop-probe.md` in quiet-tab-notes). A "plate" below is the icon's own opaque background (a disc or rounded square covering most of the box), not our `--icon-backdrop`. Own dark plate 9 of 69 (X among the starters), own light plate 14 of 69, own coloured plate 28 of 69, glyph on transparent readable on both 14 of 69, dark glyph on transparent 1 (NYTimes, helped by the backdrop), light glyph on transparent 1 (Walmart, hurt), 2 one pixel off square (32×31, content square), no genuinely non-square icon, no white glyph without a plate.
- **Accepted after the probe** (backlog 90 closed as accepted, owner decision of 2026-10-14: no per-icon backdrop, because a luminance rule would change 2 of 69 icons): a dark plate stays close to the panel (1.31:1 at full strength, about 1.15:1 in an unchecked row for a pure black plate at `opacity` 0.4 over `rgb(29,34,41)`) and almost vanishes there; a light plate merges with the backdrop (1.1:1 on average) while its glyph stays readable.

## Non-goals

- Changing the grid tile icons, the letter chip, the unchecked opacity values, hover, busy, pills.
- Sampling the favicon luminance to choose a backdrop.
- Backlog 84 and 86.

## Process

UI pipeline in compact form (one task group: no checkpoint, the final design review covers it); full E2E; `permissions.md` untouched.
