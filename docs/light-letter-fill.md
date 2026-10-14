# Light theme: a visible fill for the link letter and the pending chip

## Status

`implemented` — revision 3 (2026-10-15: status, measured numbers and forced-colors behaviour corrected after implementation). Run №38 (`light-letter-fill`). A follow-up of run 37 (`docs/favicon-letter-pending.md`, § Accepted exceptions: "in the light theme the grid chip is nearly invisible").

**Data compatibility: not required** (no storage change; no-users policy, `agent-config/CLAUDE.md`).

Related: `docs/favicon-letter-pending.md`, `docs/favicon-globe-fallback.md`, `src/design-tokens.css`, `src/newtab.css`.

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-15 | Owner, after run 37, offered the open item "in the light theme the chip is almost invisible, like the letter itself (about 3 levels of 255)": "Yes, do it." | `confirmed` (owner) | § Decision 1 |

## Probe result (live Chromium, light scheme, run 37 measurements)

The grid letter `.favorite-letter` and the pending chip (`.favorite-icon[data-icon-check="pending"]`) are filled with `rgb(255 255 255 / 12%)` in both themes. On a light tile that is `(229,232,236)` on `(226,230,234)` at the centre of the box (about 3 levels of 255; the corner-mean sampling of run 38 measured 3–7 on `main` over all sizes), so in the light theme a link without an icon shows its letter on a tile that looks the same colour around it. In the dark theme the same fill is 25–27 levels away from the tile. The wizard row letter and chip use `--soft-fill` (`#eef1f5` in light), which is visible on the white panel (17 levels) and is not part of this run.

## Current behaviour (`main`, `f7fd5c5`)

- `src/newtab.css`: `.favorite-letter { background: rgb(255 255 255 / 12%); … }` and `.favorite-icon[data-icon-check="pending"] { background: rgb(255 255 255 / 12%); … }`, one value for both schemes.
- `test/newtabSource.test.js` PLP pin 3 compares the chip fill with the letter fill as text.

## Decisions (owner can override)

1. **One new token for the grid letter and chip fill (owner, 2026-10-15).** `--letter-fill` in `src/design-tokens.css`: `rgb(0 0 0 / 6%)` in the light `:root`, `rgb(255 255 255 / 12%)` in the dark media block (the dark value is the one used today, unchanged). `.favorite-letter` and `.favorite-icon[data-icon-check="pending"]` take `background: var(--letter-fill)`; no other literal fill remains on them. Expected light difference to the tile: 12–16 levels in the corner-mean sampling (6% of about 230), against 3–7 on `main`. Chip and letter keep the same fill, so chip → letter still changes only the glyph.
2. **Not changed.** The dark theme (computed values and pixels), the wizard row letter and chip (`--soft-fill`), the letter's glyph, colour, size and radius, the pending mechanism, aria, forced colors (the browser drops the fill there as before), the accent gradient of the tile, storage, permissions, strings.

## Scope

- `src/design-tokens.css` (token, both themes), `src/newtab.css` (two rules use it), `CHANGELOG.md` `[Unreleased]`, `docs/favicon-letter-pending.md` (the lines that state the 12% fill or the nearly invisible light chip are marked superseded), `docs/design-system.md` (token row), tests (no new control, no new user-facing string, the first-run veil is unaffected: the chip inherits `visibility: hidden` as in run 37): `test/newtabSource.test.js` (LLF pins 1–4; PLP pin 3 of run 37 was checked and passes unchanged), E2E `dg-80-light-letter-fill.mjs`; `dg-79` reads no pixels in the light scheme and has no 12% literal (it compares chip and letter fills with each other), so it needs no change beyond the stale comment at `dg-79:51` ("12% white"), which is updated; `docs/design-system.md` (token table: `--letter-fill`, light `rgb(0 0 0 / 6%)`, dark `rgb(255 255 255 / 12%)`); `docs/favicon-letter-pending.md` lines that state the 12% fill or the nearly invisible light chip (Current behaviour, Decision 1, Accepted exceptions).

## Acceptance scenarios

Common setup: the E2E harness profile has no history (every `_favicon` answer is the grey globe); the sentinel is held with the `dg-79`/`dg-74` router (`gate`) to read the chip, and answered normally to read the letter.

### AS-LLF-01 Light theme: the chip and the letter are visible on the tile
- Given: light scheme, favicon-mode links in a 1×1, a 1×2 and a 2×2 tile, sentinel held (gate released within the 2 s budget).
- When: the new tab opens and the check is pending, then the sentinel answers.
- Then: computed `background-color` of the pending `img` and of the later `.favorite-letter` is `rgba(0, 0, 0, 0.06)`; the inner area of the box (inset 4 px) is uniform within ±5 levels per channel and differs from the tile colour sampled 3 px outside the box by at least 8 levels in one channel (the scenario asserts 11, measured 12–16 on the implementation and 3–7 on `main`); the chip sample equals the letter sample after the release within ±2 (glyph-free sample: the mean of four points 3 px inside the corners); rect unchanged.
- Red on old code: the old fill gives a difference of about 3 levels, so the "at least 8 levels" assertion fails.
- Verified by: E2E `dg-80`; `newtabSource` pins.

### AS-LLF-02 Light theme: the letter stays legible
- Given: light scheme, a letter link with the default accent and with accents `#ffffff`, `#e11d48`, `#f5d90a`.
- When: the tile is settled.
- Then: the contrast ratio of the letter glyph colour (computed `color`) against the glyph-free sample inside the box (the mean of four points 3 px inside the corners, as in AS-LLF-01; that sample already contains the fill composited on the tile, so the fill is not applied again) is at least 4.5:1 in each case (measured 12.4–14.3:1); the visibility difference of at least 8 levels also holds for the accents `#ffffff`, `#e11d48` and `#f5d90a`; the uniformity tolerance is ±5 for the default and white tiles and ±7 for the saturated accents (the tile gradient shows through, measured spread 5); the accents are the normalised ones (`normalizeAccentLightness` in `src/newtab.js` lightens a very dark accent), the contrast is read from the screenshot, not computed from the raw accent (the glyph is `#111318`, so this holds by a wide margin; the assertion guards a future colour change).
- Verified by: E2E `dg-80`.

### AS-LLF-03 Dark theme is unchanged
- Given: dark scheme, the same tiles.
- When: the check is pending and after the answer.
- Then: computed `background-color` is `rgba(255, 255, 255, 0.12)`; the chip and letter samples equal the values measured on `main` with the same corner-mean sampling (`(57,61,66)` for a 1×1 default tile, `(57,61,67)` for 1×2 and 2×2, `(59,62,68)` for 2×1; ±2); the difference to the tile is at least 20 levels in one channel (measured 25–27 in run 37, `reports/favicon-letter-pending-probe.md`; the margin covers the tile gradient).
- Green on old code by design: a regression guard for the dark theme.
- Verified by: E2E `dg-80` (and `dg-79`, unchanged).

### AS-LLF-04 Forced colors and reduced motion
- Given: `forced-colors: active` (light and dark) and `prefers-reduced-motion: reduce`.
- When: the letter and the chip are shown.
- Then: under forced colors the browser substitutes the system `Canvas` colour for the RGB of the fill and keeps the author's alpha (measured on `main`: light `rgba(255, 255, 255, 0.12)`, dark `rgba(0, 0, 0, 0.12)`), so the computed value is `rgba(255, 255, 255, 0.06)` in light and `rgba(0, 0, 0, 0.12)` in dark after this run; the letter glyph is visible and the chip keeps its rect and its pushed-out content (computed `object-position` first component ≥ 40 px); no `transition` or `animation` on either rule; no horizontal overflow at 500 and 320 px.
- Green on old code by design for the motion, forced-colors and geometry parts (the fill does not change geometry); the pins of run 37 already cover `transition`/`animation`.
- Verified by: E2E `dg-80` (computed styles only under forced colors, as `dg-79`).

### AS-LLF-05 The fill lives in one token
- Given: the CSS source.
- When: the pins run.
- Then: `--letter-fill` is declared exactly once in the light `:root` as `rgb(0 0 0 / 6%)` and exactly once in the dark media block as `rgb(255 255 255 / 12%)`; the rules `.favorite-letter` and `.favorite-icon[data-icon-check="pending"]` set `background: var(--letter-fill)` and no other rule with the `.favorite-letter` selector sets a background; the wizard rules still use `--soft-fill`; each pin fails when the token value, either rule's `var()` use, or a theme declaration is broken after the implementation commit (mutation check).
- Verified by: `test/newtabSource.test.js`.

## Review focus

- The light tile in all four accents: the letter must not look like a hole or a stain (6% black on a gradient accent tile).
- No change in the dark theme, and chip → letter parity in both.
- That no other place uses the 12% white fill or `.favorite-letter` (checked in review: the fill is only at `src/newtab.css` lines 370 and 379; `.favorite-letter` only in `newtab.css`, `newtab.js:303` and E2E).

## Accepted exceptions

- Under `forced-colors: active` the browser replaces the RGB of the fill by `Canvas` and keeps the author's alpha, as before (the earlier wording "the fill is dropped" is superseded by this measurement).
- A custom very dark tile accent in the light theme is not a case: `normalizeAccentLightness` lightens it and the tile background is a gradient from 18% to 6% of the accent.
- Hover, focus and edit mode of the tile do not touch the letter fill (checked in `src/newtab.css`).

## Non-goals

- Changing the dark theme, the wizard row, the glyph, size, radius or shape of the letter, or the pending mechanism.
- Theming the letter by the site colour.

## Process

Full UI pipeline (`quiet-tab-pipeline`); compact: one task group, the final gate covers it.
