# Onboarding starter rows: light backdrop under favicons in the dark theme, CSS tidy-up

## Status

`draft` — revision 1 (2026-10-14). Run №34 (`starter-rows-icon-chip`). A follow-up of run 33 (`docs/starter-rows-polish.md`, backlog 87 and 88).

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

1. **Light backdrop under the favicon (backlog 87).** A new token `--icon-backdrop` in `src/design-tokens.css`: `transparent` in the light theme, `#eef1f5` (the light `--color-fill-soft`) in the dark theme (inside the existing `@media (prefers-color-scheme: dark)` block). `img.onboarding-wizard__starter-icon` gets `background: var(--icon-backdrop)` in every row (checked and unchecked, so the two states look alike). The letter chip is unchanged. The backdrop is part of the `img`, so an unchecked row fades it with the icon (`opacity: 0.4`) and the busy surface fades it with the row (`opacity: var(--control-disabled-opacity)`). Under `forced-colors: active` the browser replaces the backdrop; nothing is added there. Light theme: nothing changes (transparent). Run 32's default-icon check (`[data-icon-check]`, `visibility: hidden` while pending, the letter swap) is untouched. Measured target: an opaque black favicon pixel on its backdrop is ≥ 3:1 in the dark theme in an unchecked row (composite `over(black, backdrop, 0.4)` against `over(backdrop, --panel, 0.4)`; the plan probe measures the real pixels) and ≥ 10:1 in a checked row; the grid tiles are out of scope.
2. **CSS tidy-up (backlog 88), behaviour-neutral.** The two unchecked icon rules share one `filter: grayscale(1)` declaration through `:is(img.onboarding-wizard__starter-icon, .onboarding-wizard__starter-icon--letter)` and keep one `opacity` rule each (0.4 and 0.6); the hover-chip comment says an unchecked letter is already at 0.6; the busy comment says the `opacity` sits on the surface. The computed styles of every row state (rest, hover, focus, busy, forced colors, both themes) stay byte-identical to run 33, apart from decision 1.
3. **Unchanged.** Everything else of `docs/starter-rows-polish.md` (hover fill, busy values, pills, the unchecked surface colour), the DOM, sizes, tab order, names, Finish, storage, `newtab.js`.

## Scope

- `src/design-tokens.css` (token), `src/surfaces.css` (backdrop rule, merged filter rule, comments).
- `test/newtabSource.test.js` (pins: token in both themes, `img` background rule, merged filter rule keeps the pin of run 33 true), `test/borderContrast.test.js` (unit: black glyph on `#eef1f5` backdrop in an unchecked row ≥ 3:1; each proven by mutation).
- `.private/e2e/scenarios/dg-76-starter-rows-icon-chip.mjs` (next free number; `dg-75` stays unchanged, it must stay green).
- `docs/starter-rows-polish.md` (decision 2: the favicon now sits on a backdrop in the dark theme; the "no opacity can fix it" note), `docs/onboarding-starter-rows.md` only if it describes the bare favicon, `CHANGELOG.md` `[Unreleased]`, this spec (`implemented`).

## Acceptance scenarios

Common setup: harness **1280×800**, wizard step 2, eight starters; `_favicon` answered with a solid black 32×32 PNG for the favicon rows (the worst case) and failed for one row (letter); tokens resolved through probe spans.

### AS-ICB-01 Dark theme: the favicon sits on a light backdrop
- Given: dark theme, a favicon row checked and the same row unchecked.
- When: reading computed styles of `img.onboarding-wizard__starter-icon`.
- Then: `background-color` equals the resolved `--icon-backdrop` (`rgb(238, 241, 245)`); the black glyph pixel against the backdrop is ≥ 10:1 in the checked row; in the unchecked row (icon `opacity` 0.4, `grayscale(1)`) the composite glyph/backdrop contrast is ≥ 3:1 (computed, cross-checked by a pixel sample of a screenshot clip).
- Verified by: E2E `dg-76`; unit in `test/borderContrast.test.js`.

### AS-ICB-02 Light theme and forced colors are unchanged
- Given: light theme; forced colors (light and dark).
- When: reading computed styles of the favicon `img`.
- Then: light theme: `background-color` is transparent (`rgba(0, 0, 0, 0)`); forced colors: the backdrop is not painted (the computed background is the forced Canvas or transparent, and no `forced-colors` rule sets one).
- Verified by: E2E `dg-76`; `newtabSource` pin.

### AS-ICB-03 Letter chip, busy and hover are unchanged
- Given: dark theme.
- When: reading the letter icon, a hovered favicon row, and a busy row (held write, `failStorageSetAfter` key `quietTabWidgetsMeta`, 9000 ms).
- Then: the letter chip stays `--soft-fill` (hover: `--soft-fill-strong`); a hovered favicon row keeps the backdrop and the hover fill; a busy row keeps surface `opacity` 0.62 with the backdrop faded by it; `dg-75` and `dg-73` stay green unchanged.
- Verified by: E2E `dg-76`, `dg-75`, `dg-73` (full run).

### AS-ICB-04 CSS tidy-up changes no computed style
- Given: both themes and forced colors.
- When: comparing the computed `filter`, `opacity`, `background-color`, `cursor` of surface, icon (favicon and letter) and label in rest, checked, unchecked, hover, focus and busy states against run 33.
- Then: identical, except the favicon `background-color` of decision 1 in the dark theme; the unchecked `img` and letter still carry `grayscale(1)` with `opacity` 0.4 and 0.6.
- Verified by: E2E `dg-75` (unchanged and green), `newtabSource` pins.

## Review focus

- Does the light chip look right in the dark panel (a bright square next to the muted label), checked and unchecked? Is it too loud in a checked row? (AS-ICB-01)
- A favicon with its own transparent background and a light glyph (white on transparent) on the light chip: unreadable? (the case the chip creates; the owner accepted the trade-off, the lens reports how bad it is)
- Busy and hover look unchanged (AS-ICB-03).

## Accepted exceptions

- A light favicon with a transparent background (a white glyph) is now white on `#eef1f5` in the dark theme: weaker than before. Accepted with the owner's choice of a light backdrop; a per-icon luminance check is out of scope.
- The grid tiles keep bare favicons.
- Under forced colors there is no backdrop (browser override).

## Non-goals

- Changing the grid tile icons, the letter chip, the unchecked opacity values, hover, busy, pills.
- Sampling the favicon luminance to choose a backdrop.
- Backlog 84 and 86.

## Process

UI pipeline in compact form (one task group: no checkpoint, the final design review covers it); full E2E; `permissions.md` untouched.
