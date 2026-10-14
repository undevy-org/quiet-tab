# Onboarding starter rows: a quiet outline around the favicon in the dark theme

## Status

`draft` — revision 1 (2026-10-14). Run №36 (`favicon-outline`). A follow-up of run 35 (`docs/favicon-backdrop.md`, backlog 91 and 92) and run 34 (`docs/starter-rows-icon-chip.md`).

**Data compatibility: not required** (no storage change; no-users policy, `agent-config/CLAUDE.md`).

Related: `docs/starter-rows-icon-chip.md`, `docs/favicon-backdrop.md`, `src/design-tokens.css`, `src/surfaces.css`.

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-14 | Owner, after run 35: "make an outline for the dark plates" (a favicon with its own opaque dark plate, 1.31:1 on the dark panel, almost vanishes in a row). | `confirmed` | § Decision 1 |
| 2026-10-14 | Owner scope answers: not on the grid tiles; the same outline for every favicon (no per-icon logic); not visible in an unchecked row; not in the light theme; do backlog 91 and 92 in the same run; the outline must stay quiet and must not compete with the icon. | `confirmed` | § Decisions 1–4, § Non-goals |

## Probe result (real Chromium favicons, `pipeline/reports/favicon-outline-probe.md` in quiet-tab-notes)

67 of 69 domains (35 through the extension's own `_favicon`, 32 through the icon the page declares, scaled to 32 px; the owner's profile was not read):

- Own opaque plate: 47 (dark 8: X (a starter), Twitter, TikTok, Medium, eBay, Vercel, Perplexity, Uber; light 10; coloured 29). A black plate is 1.31:1 against the dark panel `rgb(29,34,41)`.
- Glyph on transparent: 20 (dark glyph, helped by the run 34 backdrop: 3, among them the starters ChatGPT and GitHub; light glyph, hurt: 2, WhatsApp and Walmart; readable either way: 15).
- Correction to run 35 (proxy data): "none of the eight starters is helped by the backdrop" was an artefact of Google's proxy icons (a white disc for ChatGPT). With the real icons the backdrop is what makes ChatGPT and GitHub readable in the dark theme, so "a backdrop for every favicon" stands; a luminance rule would still only change 2 of 67.
- Rim (backlog 91): the light backdrop shows as a wedge in the corner of the 4px-radius box where a plate's own corners are rounder. Plates: radius 0–10.4 px (median 5.7); wedge > 1 px for 23 of 47 plates (round icons), at most 2.6 px. Dark plates: 2 of 8 have a wedge (eBay 1.8 px, Vercel 2.4 px); the others have a radius ≤ 3.6 px and none.

## Current behaviour (`main`, `dafd39a`)

- `img.onboarding-wizard__starter-icon` is 22×22, `border-radius: 4px`, `background: var(--icon-backdrop)` (`transparent` light, `#eef1f5` dark); an unchecked row greys it and fades it to `opacity: 0.4`.
- A favicon with its own dark plate (`rgb(0,0,0)` for X) has no edge against the panel (1.31:1 at full strength, about 1.15:1 unchecked) and reads as a hole with a glyph.

## Decisions

1. **A quiet outline (the owner's request).** A new token `--icon-outline` in `src/design-tokens.css`: `transparent` in the light theme, `#3d4652` in the dark theme. `img.onboarding-wizard__starter-icon` gets `box-shadow: 0 0 0 1px var(--icon-outline)`: a 1 px ring OUTSIDE the 22×22 box that follows its 4px radius, so the icon pixels, the box size, the row layout and the tab order do not change. `#3d4652` was chosen from four candidates on real icons (probe report): 1.67:1 against the panel and 2.20:1 against a black plate, so the shape of a black plate reads and a coloured or white icon hardly notices it; the stronger candidates (`#545e6c` 2.43:1, `--color-border-control` 3.28:1) frame every icon and compete with it. The same ring for every favicon: no luminance or plate detection.
2. **Not visible in an unchecked row (the owner's request).** The existing unchecked `img` rule (the one with `opacity: 0.4`) also sets `box-shadow: none`. A busy row (surface `opacity` 0.62) fades the ring with the row; hover and focus are unchanged.
3. **Not in the light theme, not on the grid, not on the letter chip.** The light token is `transparent` (the ring is invisible; the rule itself is theme-independent). The grid tiles (`.favorite-tile`, `.favorite-icon`) and the letter chip (`.onboarding-wizard__starter-icon--letter`) get nothing. Forced colors: the browser drops `box-shadow` there; no rule is added inside `@media (forced-colors: active)` (checked by a source pin and measured in E2E).
4. **Backlog 91 and 92 closed with data.** 92: the probe above (real `_favicon`, real page icons). 91: the wedge is the backdrop doing its job where an icon is transparent (a rounded plate has transparent corners); at most 2.6 px, on 2 of 8 dark plates (eBay, Vercel). Not fixed in the product: a larger box radius (6 px: wedge 1.5 px, 8 px: 0.7 px) would round the corners of every icon (X, Amazon, Medium) and still leave a thin wedge; the outline follows the box, so the wedge sits inside the ring. Recorded as an accepted exception with the numbers; the owner can ask for radius 6 later (screenshots `r6c1`, `r8c1` in the run report).
5. **Docs corrected.** `docs/favicon-backdrop.md` (probe table: "the backdrop helps 1, none of the starters") and `docs/starter-rows-icon-chip.md` § Accepted exceptions get a pointer to the real-icon numbers; the run 35 statement about starters is marked as an artefact of the proxy.
6. **Unchanged.** Backdrop colours, hover, busy, opacity, grayscale, the letter chip, DOM, names, tab order, storage, `src/newtab.js`, `CHANGELOG.md` gets one `[Unreleased]` line (visible change).

## Scope

- `src/design-tokens.css` (token, both themes), `src/surfaces.css` (ring on the favicon rule, `box-shadow: none` in the unchecked `img` rule), `docs/design-system.md` (a row for `--icon-outline`), `CHANGELOG.md`.
- `test/borderContrast.test.js` (the two ratios as units), `test/newtabSource.test.js` (pins), `docs/favicon-backdrop.md`, `docs/starter-rows-icon-chip.md`, this spec (`implemented`).
- `.private/e2e/scenarios/dg-77-favicon-outline.mjs` (new). `dg-73`, `dg-75`, `dg-76` must stay green (`dg-76` reads the favicon `img` computed styles but not `box-shadow`).

## Acceptance scenarios

Common setup: harness 1280×800, dark theme unless stated, wizard step 2, eight starters; `_favicon` answered with a PNG per row (the `dg-76` black-square generator; a white 22×22 square for a light plate; a failed row for the letter); the ring pixel is read in a screenshot clip 1 px outside the box (x = −1 from the box's left edge, y = 11) with a tolerance of ±3 per channel.

### AS-FBO-01 A black plate gets a visible but quiet outline (checked row, dark theme)
- Given: a checked favicon row whose PNG is a fully opaque black square.
- When: reading the favicon `img` and the pixels around it.
- Then: computed `box-shadow` is `rgb(61, 70, 82) 0px 0px 0px 1px`; the ring pixel is `rgb(61, 70, 82)` (±3); ring against the black plate pixel is ≥ 2.0:1 (computed 2.20) and ring against the panel is between 1.5:1 and 2.0:1 (computed 1.67), so it defines the plate without framing it; the box rect, the row rect and the label position equal the values on `origin/main` (box-shadow takes no space).
- Verified by: E2E `dg-77`; unit ratios in `test/borderContrast.test.js`.

### AS-FBO-02 The outline is not visible in an unchecked row
- Given: the same icon in an unchecked row.
- When: reading the `img`.
- Then: computed `box-shadow` is `none`; the pixel 1 px outside the box equals the panel colour (±3); checking the row brings the ring back and unchecking removes it again (toggle, no residue); a busy checked row shows the ring faded with the row (the surface `opacity` 0.62 blends it with the panel: pixel between the panel and the ring colour).
- Verified by: E2E `dg-77`.

### AS-FBO-03 Light theme, forced colors, letter chip, grid
- Given: light theme; forced colors (light and dark); a letter-chip row; the desk behind the wizard after Finish.
- When: reading the favicon `img` of a checked row, the letter chip, and a grid tile icon.
- Then: light theme: the pixel outside the box equals the panel (the token is transparent), so no ring is visible; forced colors: computed `box-shadow` is `none` (measured; the browser removes it); the letter chip has `box-shadow: none`; a grid `.favorite-icon` has `box-shadow: none`; no rule inside `@media (forced-colors: active)` sets a `box-shadow` (source pin).
- Verified by: E2E `dg-77`; `newtabSource` pins.

### AS-FBO-04 Nothing else changes; every state keeps working
- Given: both themes, forced colors; checked, unchecked, hover, focus, busy rows; 500 px and 320 px windows and the 600 px high window.
- When: running `dg-73`, `dg-75`, `dg-76`, and reading `getBoundingClientRect` of the favicon `img` and of the row at 1280, 500 and 320 px.
- Then: all three scenarios stay green with the check lists equal to the recorded baseline (a one-time before/after name comparison, as in run 35); the `img` and row rects equal `origin/main`; no horizontal overflow at 320 and 500 px; the ring is not clipped by the row (the 10 px side padding holds it).
- Verified by: E2E `dg-73`, `dg-75`, `dg-76`, `dg-77`.

### AS-FBO-05 Source pins
- Then: `--icon-outline` is `transparent` in the light `:root` and `#3d4652` in the dark media block (raw token slices); exactly one `box-shadow` rule sets the ring, on `img.onboarding-wizard__starter-icon` with `0 0 0 1px var(--icon-outline)`; the unchecked `img` rule sets `box-shadow: none`; no `box-shadow` for the letter chip or the grid icons; none inside `@media (hover: hover)` or `@media (forced-colors: active)`; no `transition`. Each pin is proven by mutation.
- Verified by: `test/newtabSource.test.js`, `test/borderContrast.test.js`.

## Paint-only

A box-shadow ring of 1 px and a token: no geometry, text, DOM, tab order or animation changes at any width; `prefers-reduced-motion` is untouched; the row layout and `dg-73` geometry checks stay green.

## Review focus

- Is the ring quiet enough? Next to the white ChatGPT square, the coloured Spotify disc and the black X plate in checked rows: does it frame the icons (too loud) or does it vanish where it should help (the black plate)? (AS-FBO-01)
- The unchecked row: no ring at all, the row still reads "off" and the black plate still almost vanishes there (accepted, owner choice).
- Wedges: do the light corner wedges of eBay and Vercel (dark rounded plates) look worse next to a ring than without it? (backlog 91, accepted with data)
- Is the correction to run 35 stated honestly (ChatGPT and GitHub need the backdrop)?

## Accepted exceptions

- The ring is decorative (the label names the row, the `img` has `alt=""`): 1.67:1 against the panel is below the 3:1 of WCAG 1.4.11, on purpose (owner: quiet, must not compete with the icon).
- A black plate in an unchecked row still almost vanishes (1.15:1): the owner asked for no outline there.
- The backdrop wedge in the corners of rounded dark plates (eBay, Vercel: 1.8 and 2.4 px) and the light discs on the square backdrop (Spotify, Reddit, Google: 23 of 47 plates have a wedge above 1 px) stay; a larger box radius is not applied.
- A light plate merges with the backdrop (1.1:1 on average), a white or light glyph on transparent (WhatsApp, Walmart, 2 of 67) is weaker on it: unchanged from runs 34–35.
- The probe is headless Chromium without a browsing history, 32 of 67 icons come from the page's declared icon, not from `_favicon`; stackoverflow.com and booking.com were not obtained. Real profiles can differ.

## Non-goals

- Grid tiles, the letter chip, the light theme, a per-icon (luminance, plate) outline, a changed box radius, a stronger ring, a changed unchecked look.
- Backlog 84 and 86; the default-icon check logic.

## Process

UI pipeline in the compact form of runs 34–35: one task group, no checkpoint (the final design review covers it); full E2E; `permissions.md` untouched; backlog 91 and 92 are struck through in the merge cleanup.
