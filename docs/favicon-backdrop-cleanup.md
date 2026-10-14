# Onboarding starter rows: favicon backdrop only after load, probe numbers, CSS comment

## Status

`draft` — revision 1 (2026-10-14). Run №35 (`favicon-backdrop`), branch A of its kickoff (the real-favicon probe decided: no luminance-based backdrop). A follow-up of run 34 (`docs/starter-rows-icon-chip.md`, backlog 89 and 90).

**Data compatibility: not required** (no storage change; no-users policy, `agent-config/CLAUDE.md`).

Related: `docs/starter-rows-icon-chip.md`, `docs/favicon-globe-fallback.md`, `src/surfaces.css`, `src/newtab.js` (`createOnboardingStarterIcon`).

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-14 | Run 35 kickoff: how to choose the favicon backdrop (backlog 89, 90). Probe on 69 real favicons first. | `confirmed` | § Probe result |
| 2026-10-14 | Owner, after the probe: "accept as exceptions and do the backlog 89 cleanup" (option A of the kickoff, recommended); no outline, no luminance backdrop. | `confirmed` | § Decisions 1–4 |

## Probe result (numbers, `pipeline/reports/favicon-backdrop-probe.md` in quiet-tab-notes)

69 real favicons (the 8 starters + 61 popular domains), Google s2 proxy at `sz=32` (not Chrome's `_favicon`: a limit of the probe), decoded in Chromium and measured with the run 34 formulas against `#eef1f5` and `rgb(29,34,41)`:

| Class | Count | Share | Effect of the light backdrop |
|-------|-------|-------|------------------------------|
| Own opaque plate, dark (X, TikTok, Medium, Uber, Vercel, Perplexity, Booking, eBay, Twitter) | 9 | 13 % | none (the plate covers the backdrop); 1.31:1 against the panel |
| Own plate, light (ChatGPT, GitHub, Google G, Wikipedia, Apple, Notion, Anthropic…) | 14 | 20 % | the plate merges with the backdrop (1.11:1 on average); the glyph inside stays readable |
| Own plate, coloured (YouTube, Spotify, Reddit, Amazon…) | 28 | 41 % | none |
| Glyph on transparent, readable on both | 14 | 20 % | none |
| Dark glyph on transparent (NYTimes) | 1 | 1.4 % | the backdrop helps (1.17:1 → 16.5:1) |
| Light glyph on transparent (Walmart, yellow, 1.43:1 on the backdrop) | 1 | 1.4 % | the backdrop hurts |
| Genuinely non-square (aspect beyond 1.25) | 0 | 0 % | (Slack and Cloudflare are 32×31, one pixel) |

A luminance-based backdrop would change 2 of 69 icons and none of the eight starters, so it is not built. A white glyph without a plate (the case of the run 34 exception) was not observed.

## Current behaviour (`main`, `5591120`)

- `img.onboarding-wizard__starter-icon { background: var(--icon-backdrop) }` paints the backdrop as soon as the `img` is in the DOM. `createOnboardingStarterIcon` sets `icon.src` before the node is inserted, so the `img` has a `src` the whole time (an `:not([src])` selector, as backlog 89 proposed, would never match). While the image is not decoded yet the empty box shows a light square in the dark theme. When the default-icon check is pending (`[data-icon-check="pending"]`, `visibility: hidden`) the square is hidden with the image; a row whose check is skipped (cached verdict `real`, or the checker failed) shows the empty square until the image decodes.
- The comment above the rule says "Not in the hover or forced-colors blocks" and does not say why.

## Decisions

1. **Backdrop only after load (backlog 89 б, replaces `:not([src])`).** `createOnboardingStarterIcon` adds a one-shot `load` listener BEFORE it sets `src` that sets `icon.dataset.iconReady = ""` (an attribute, no value). The CSS rule becomes `img.onboarding-wizard__starter-icon[data-icon-ready] { background: var(--icon-backdrop); }` (still exactly one backdrop rule for the favicon `img`, still outside `@media (hover: hover)` and `@media (forced-colors: active)`). The listener is added in every path (also when the check is pending; the check keeps its own `load` listener). An `img` that fails to load never gets the attribute and is replaced by the letter as before. No attribute is set on the letter chip.
2. **Comment (backlog 89 а).** The comment above the rule says: the backdrop is not repeated in the hover block because the hover fill sits on the row surface and the icon keeps its own backdrop, and not in `forced-colors: active` because the browser replaces author backgrounds there (Canvas), so a dark backdrop would not be kept.
3. **Probe numbers become accepted exceptions (backlog 90 closed).** `docs/starter-rows-icon-chip.md` § Accepted exceptions gets the probe table (compact) and states that dark plates and the light-plate merge are accepted and that no per-icon backdrop is built; its sentence about "the empty light square until its image decodes" is replaced by "the backdrop appears with the image (run 35)".
4. **E2E helpers (backlog 89 в), not a product change.** The helpers shared by `dg-75` and `dg-76` (colour maths, `nextFrames`, `park`, `waitSoft`, `hoverRow`, `focusRowByKeyboard`, `toStep2`, and `withDesk`, `tokens`, `rowState` where the two files really agree) move into `.private/e2e/lib/starterRows.mjs`; the scenarios import them. Self-check: the check names and counts of `dg-73`, `dg-75`, `dg-76` are identical before and after (recorded once), all three green, and a deliberate break of one helper turns a named check red.
5. **Unchanged.** Backdrop colours and tokens, hover, busy, opacity, grayscale, the letter chip, the grid tiles (`.favorite-icon`), the DOM and tab order, the names, storage, the default-icon check (`src/defaultFavicon.js`).

## Scope

- `src/newtab.js` (`createOnboardingStarterIcon`: the load listener), `src/surfaces.css` (selector and comment), `test/newtabSource.test.js` (pins), `CHANGELOG.md` (`[Unreleased]`), `docs/starter-rows-icon-chip.md` (§ Accepted exceptions, status unchanged `implemented`), this spec.
- `.private/e2e/scenarios/dg-77-favicon-backdrop-cleanup.mjs` (new), `dg-76` (waits for `[data-icon-ready]` before reading the backdrop), `.private/e2e/lib/starterRows.mjs` (new), `dg-75`/`dg-76` (imports).

## Acceptance scenarios

Common setup: harness 1280×800, dark theme unless stated, wizard step 2, eight starters; `_favicon` answered with a PNG (black 16×16 on transparent 32×32, the `dg-76` generator) except where a scenario holds or fails it; the favicon box is 22×22, the backdrop pixel is read at (3, 3) from the box's top-left corner (inside the 4px radius), the glyph pixel at (11, 11), from a screenshot clip, tolerance ±3 per channel.

### AS-FBC-01 The backdrop appears with the image, not before
- Given: dark theme; wizard step 2 opened a second time (Back, Continue) so the default-icon verdicts are cached and the check is skipped; the `_favicon` route is held (about 1500 ms) with caching off.
- When: reading the favicon `img` while the request is held, then after it is released.
- Then: while held, the `img` has no `data-icon-ready`, its computed `background-color` is transparent and the pixel at (3, 3) equals the row surface colour, not the backdrop; after the release `data-icon-ready` is present, `background-color` is `rgb(238, 241, 245)` and the pixel at (3, 3) is the backdrop within the tolerance. In a first visit (check pending) the `img` stays `visibility: hidden` until the verdict, then shows with the backdrop, and no frame shows the light square on a failed load (the letter replaces the `img`).
- Verified by: E2E `dg-77`.

### AS-FBC-02 Failure and the letter chip are unchanged
- Given: dark theme; one starter's `_favicon` fails.
- When: the failed `img` is replaced by the letter chip.
- Then: the chip is `--soft-fill` (as in run 34), carries no `data-icon-ready`, and no light square was visible at any frame between the first paint of the row and the swap (sampled each animation frame).
- Verified by: E2E `dg-77`; `dg-76` stays green.

### AS-FBC-03 Light theme and forced colors unchanged
- Given: light theme; forced colors (light and dark).
- When: reading the loaded favicon `img`.
- Then: light: `background-color` transparent; forced colors: as in run 34 (`dg-76` AS-ICB-02 values); no rule inside `@media (forced-colors: active)` sets a background on the favicon `img` (pin unchanged).
- Verified by: E2E `dg-76` (green), `newtabSource` pins.

### AS-FBC-04 Source pins
- Then: exactly one backdrop rule for the favicon `img`, its selector requires `[data-icon-ready]`, none in `@media (hover: hover)` or `@media (forced-colors: active)`; the comment above it names hover and forced colors; `createOnboardingStarterIcon` registers the `load` listener before `icon.src` is assigned.
- Verified by: `test/newtabSource.test.js`, each pin proven by mutation.

### AS-FBC-05 E2E helper extraction changes no check
- Given: `dg-73`, `dg-75`, `dg-76` run before the extraction (on `origin/main`) and after.
- Then: the lists of check names and the counts are identical and all are green; breaking one shared helper makes a named check red.
- Verified by: the recorded before/after lists in the plan task and a mutation run.

## Paint-only

A `data-*` attribute set once per favicon `img` and a selector change: no geometry, text, tab order or animation changes at any width (500, 320, the 600 px high window), so keyboard behaviour and `prefers-reduced-motion` are untouched; `dg-73` geometry checks stay green.

## Review focus

- Is any frame left where the favicon shows no backdrop although it is loaded (the attribute set late, a cached image)? Does a fast cached load still get its backdrop in the first painted frame? (AS-FBC-01)
- Is the row quieter or jumpier while the image loads (a transparent box, then a light square pops in)? Is the pop-in worse than the old empty square?
- Dark plates (X, 1.31:1 on the panel) and light plates (ChatGPT merging with the backdrop) in checked and unchecked rows: the accepted exceptions below; the lens reports how bad they look, it does not reopen the decision.

## Accepted exceptions

- No per-icon backdrop: the probe shows a luminance rule would change 2 of 69 real icons (owner decision 2026-10-14, option A).
- A dark opaque plate (13 % of probed icons, among the starters X) stays close to the panel (1.31:1) and almost vanishes in an unchecked row; backlog 90 is closed as accepted (data of the probe).
- A light plate (20 %) merges with the light backdrop (1.1:1 on average); the glyph inside is still readable.
- Every exception of `docs/starter-rows-icon-chip.md` stays, except the one about the empty light square until decode (fixed here).
- The probe used Google's favicon proxy, not Chrome's `_favicon`; real icons of a profile can differ.

## Non-goals

- A luminance- or plate-based backdrop, an outline or ring for dark plates, changes to the unchecked look (owner declined these on 2026-10-14).
- Grid tiles (`.favorite-tile`), backlog 84 and 86, the default-icon check logic.

## Process

UI pipeline in the compact form of run 34: one task group, no checkpoint (the final design review covers it); full E2E; `permissions.md` untouched.
