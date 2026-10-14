# Light theme: a visible fill for the link letter and the pending chip

## Status

`draft` — run №38 (`light-letter-fill`). A follow-up of run 37 (`docs/favicon-letter-pending.md`, § Accepted exceptions: "in the light theme the grid chip is nearly invisible").

**Data compatibility: not required** (no storage change; no-users policy, `agent-config/CLAUDE.md`).

Related: `docs/favicon-letter-pending.md`, `docs/favicon-globe-fallback.md`, `src/design-tokens.css`, `src/newtab.css`.

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-15 | Owner, after run 37, offered the open item "in the light theme the chip is almost invisible, like the letter itself (about 3 levels of 255)": "Yes, do it." | `confirmed` (owner) | § Decision 1 |

## Probe result (live Chromium, light scheme, run 37 measurements)

The grid letter `.favorite-letter` and the pending chip (`.favorite-icon[data-icon-check="pending"]`) are filled with `rgb(255 255 255 / 12%)` in both themes. On a light tile that is `(229,232,236)` on `(226,230,234)`: a difference of about 3 levels of 255, so in the light theme a link without an icon shows its letter on a tile that looks the same colour around it. In the dark theme the same fill is 25–27 levels away from the tile. The wizard row letter and chip use `--soft-fill` (`#eef1f5` in light), which is visible on the white panel (17 levels) and is not part of this run.

## Current behaviour (`main`, `f7fd5c5`)

- `src/newtab.css`: `.favorite-letter { background: rgb(255 255 255 / 12%); … }` and `.favorite-icon[data-icon-check="pending"] { background: rgb(255 255 255 / 12%); … }`, one value for both schemes.
- `test/newtabSource.test.js` PLP pin 3 compares the chip fill with the letter fill as text.

## Decisions (owner can override)

1. **One new token for the grid letter and chip fill (owner, 2026-10-15).** `--letter-fill` in `src/design-tokens.css`: `rgb(0 0 0 / 6%)` in the light `:root`, `rgb(255 255 255 / 12%)` in the dark media block (the dark value is the one used today, unchanged). `.favorite-letter` and `.favorite-icon[data-icon-check="pending"]` take `background: var(--letter-fill)`; no other literal fill remains on them. Expected light difference to the tile: about 14 levels (6% of about 230), against about 3 today. Chip and letter keep the same fill, so chip → letter still changes only the glyph.
2. **Not changed.** The dark theme (computed values and pixels), the wizard row letter and chip (`--soft-fill`), the letter's glyph, colour, size and radius, the pending mechanism, aria, forced colors (the browser drops the fill there as before), the accent gradient of the tile, storage, permissions, strings.

## Scope

- `src/design-tokens.css` (token, both themes), `src/newtab.css` (two rules use it), `CHANGELOG.md` `[Unreleased]`, `docs/favicon-letter-pending.md` (Accepted exceptions: the light-theme line is superseded; Decision 1 fill value), tests: `test/newtabSource.test.js` (PLP pin 3 and a token pin), E2E `dg-80-light-letter-fill.mjs`; the pixel checks of `dg-79` that assume the 12% white fill in the light scheme are checked and adjusted.

## Acceptance scenarios

Common setup: the E2E harness profile has no history (every `_favicon` answer is the grey globe); the sentinel is held with the `dg-79`/`dg-74` router (`gate`) to read the chip, and answered normally to read the letter.

### AS-LLF-01 Light theme: the chip and the letter are visible on the tile
- Given: light scheme, favicon-mode links in a 1×1, a 1×2 and a 2×2 tile, sentinel held (gate released within the 2 s budget).
- When: the new tab opens and the check is pending, then the sentinel answers.
- Then: computed `background-color` of the pending `img` and of the later `.favorite-letter` is `rgba(0, 0, 0, 0.06)`; the inner area of the box (inset 4 px) is uniform within ±5 levels per channel and differs from the tile colour sampled 3 px outside the box by at least 8 levels in one channel; the chip sample equals the letter sample after the release within ±2 (glyph-free sample: the mean of four points 3 px inside the corners); rect unchanged.
- Red on old code: the old fill gives a difference of about 3 levels, so the "at least 8 levels" assertion fails.
- Verified by: E2E `dg-80`; `newtabSource` pins.

### AS-LLF-02 Light theme: the letter stays legible
- Given: light scheme, a letter link with the default accent and with accents `#ffffff`, `#e11d48`, `#f5d90a`.
- When: the tile is settled.
- Then: the contrast ratio of the letter glyph colour (computed `color`) against the letter fill composited on the tile colour (read from the screenshot, 3 px inside the box corner) is at least 4.5:1 in each case (the glyph is `#111318`, so this holds by a wide margin; the assertion guards a future colour change).
- Verified by: E2E `dg-80`.

### AS-LLF-03 Dark theme is unchanged
- Given: dark scheme, the same tiles.
- When: the check is pending and after the answer.
- Then: computed `background-color` is `rgba(255, 255, 255, 0.12)`; the chip and letter samples equal the values measured in run 37 (`(56,60,66)` for a 1×1 chip on the default tile, ±2); the difference to the tile is at least 25 levels in one channel.
- Verified by: E2E `dg-80` (and `dg-79`, unchanged).

### AS-LLF-04 Forced colors and reduced motion
- Given: `forced-colors: active` (light and dark) and `prefers-reduced-motion: reduce`.
- When: the letter and the chip are shown.
- Then: the letter glyph is visible and the chip keeps its rect and its pushed-out content (computed `object-position` first component ≥ 40 px); no `transition` or `animation` on either rule; no horizontal overflow at 500 and 320 px.
- Verified by: E2E `dg-80` (computed styles only under forced colors, as `dg-79`).

### AS-LLF-05 The fill lives in one token
- Given: the CSS source.
- When: the pins run.
- Then: `--letter-fill` is declared exactly once in the light `:root` as `rgb(0 0 0 / 6%)` and exactly once in the dark media block as `rgb(255 255 255 / 12%)`; the rules `.favorite-letter` and `.favorite-icon[data-icon-check="pending"]` set `background: var(--letter-fill)` and no other rule with the `.favorite-letter` selector sets a background; the wizard rules still use `--soft-fill`; each pin fails when the token value, either rule's `var()` use, or a theme declaration is broken after the implementation commit (mutation check).
- Verified by: `test/newtabSource.test.js`.

## Review focus

- The light tile in all four accents: the letter must not look like a hole or a stain (6% black on a gradient accent tile).
- No change in the dark theme, and chip → letter parity in both.
- That no other place uses the 12% white fill or `.favorite-letter` (grep over `src/`).

## Accepted exceptions

- Under `forced-colors: active` the fill is dropped by the browser, as before.
- A custom very dark tile accent in the light theme is not a case: the tile background in the light theme is a pale accent gradient (6–18%).

## Non-goals

- Changing the dark theme, the wizard row, the glyph, size, radius or shape of the letter, or the pending mechanism.
- Theming the letter by the site colour.

## Process

Full UI pipeline (`quiet-tab-pipeline`); compact: one task group, the final gate covers it.
