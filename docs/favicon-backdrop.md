# Onboarding starter rows: favicon backdrop comment, probe numbers, shared E2E helpers

## Status

`implemented` — revision 4 (2026-10-14, after spec review rounds 1–3). Run №35 (`favicon-backdrop`), branch A of its kickoff (the real-favicon probe decided: no luminance-based backdrop). A follow-up of run 34 (`docs/starter-rows-icon-chip.md`, backlog 89 and 90).

**Data compatibility: not required** (no storage change; no-users policy, `agent-config/CLAUDE.md`).

Related: `docs/starter-rows-icon-chip.md`, `docs/favicon-globe-fallback.md`, `src/surfaces.css`.

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-14 | Run 35 kickoff: how to choose the favicon backdrop (backlog 89, 90). Probe on 69 real favicons first. | `confirmed` | § Probe result |
| 2026-10-14 | Owner, after the probe: "accept as exceptions and do the backlog 89 cleanup" (option A of the kickoff, recommended); no outline, no luminance backdrop. | `confirmed` | § Decisions 1–3 |
| 2026-10-14 | Spec review round 1: backlog 89 (б) (a light square before the image loads) is not reproducible: step 2 is built once with the wizard and only hidden/shown on Back/Continue (`src/newtab.js:1570-1590`, `:1463-1470`), `icon.src` is set before insertion so `:not([src])` never matches, and a pending row is `visibility: hidden` until its verdict. Closed as not reproducible, no product change. | `confirmed` | § Decision 2 |

## Probe result (numbers, `pipeline/reports/favicon-backdrop-probe.md` in quiet-tab-notes)

69 real favicons (the 8 starters + 61 popular domains), Google s2 proxy at `sz=32` (not Chrome's `_favicon`: a limit of the probe), decoded in Chromium and measured with the run 34 formulas against `#eef1f5` and `rgb(29,34,41)`:

| Class | Count | Share | Effect of the light backdrop |
|-------|-------|-------|------------------------------|
| Own opaque plate, dark (X, TikTok, Medium, Uber, Vercel, Perplexity, Booking, eBay, Twitter) | 9 | 13 % | none (the plate covers the backdrop); up to 1.31:1 against the panel (a pure black plate) |
| Own plate, light (ChatGPT, GitHub, Google G, Wikipedia, Apple, Notion, Anthropic…) | 14 | 20 % | the plate merges with the backdrop (1.1:1 on average); the glyph inside stays readable |
| Own plate, coloured (YouTube, Spotify, Reddit, Amazon…) | 28 | 41 % | none |
| Glyph on transparent, readable on both | 14 | 20 % | none |
| Dark glyph on transparent (NYTimes) | 1 | 1.4 % | the backdrop helps (1.17:1 → 16.5:1) |
| Light glyph on transparent (Walmart, yellow, 1.43:1 on the backdrop) | 1 | 1.4 % | the backdrop hurts |
| Genuinely non-square (aspect beyond 1.25) | 0 | 0 % | — |
| One pixel off square (Slack, Cloudflare, 32×31), content square | 2 | 2.9 % | none; counted by the probe script as "non-square" because of the 1 px |

A luminance-based backdrop would change 2 of 69 icons and none of the eight starters, so it is not built (proxy data; with real Chromium icons the backdrop is what makes the starters ChatGPT and GitHub readable, see `docs/favicon-outline.md`). A white glyph without a plate (the case of the run 34 exception) was not observed.

## Current behaviour (`main`, `5591120`)

- `img.onboarding-wizard__starter-icon { background: var(--icon-backdrop) }` (`src/surfaces.css:275-278`); the comment above says "Not in the hover or forced-colors blocks" and does not say why.
- Step 2 and its eight `img` nodes are built once with the wizard; the `img` has `src` before insertion; with the default-icon check pending the image is the pending chip (no backdrop, no ring) until its verdict (`[data-icon-check="pending"]`, `src/surfaces.css`; run 37, before it was `visibility: hidden`). Back/Continue only toggles `hidden`/`inert` on the step. So the "empty light square until decode" of run 34 § Accepted exceptions was never observed on a reachable path.

## Decisions

1. **Comment (backlog 89 а).** The comment above the backdrop rule says: the backdrop is not repeated in the hover block because the hover fill is painted on the row surface and the icon keeps its own backdrop; and not in `@media (forced-colors: active)` because in forced colors the dark-theme backdrop becomes Canvas (`rgb(0, 0, 0)` in `dg-76`; the light theme computes the same as without the backdrop) and `forced-color-adjust` stays at its default, so nothing keeps it. A source pin reads the RAW CSS text (the helpers strip comments), captures the comment block that is followed, after whitespace only, by the rule `img.onboarding-wizard__starter-icon {` (`/\/\*((?:(?!\*\/)[\s\S])*)\*\/\s*img\.onboarding-wizard__starter-icon\s*\{/`) and requires the reasons, not only the words: `/hover[\s\S]*surface/i` and `/forced-colors[\s\S]*Canvas/i` (the current comment already has the words `hover` and `forced-colors`, so the pin is RED on `main` until the text is rewritten). No computed style changes.
2. **Backlog 89 (б) closed as not reproducible** (see the intake log). Reasons: the only `showOnboardingWizard` call is `src/newtab.js:1446`, guarded by `onboardingWizardShownThisLoad` (`:1437`); the wizard is built before the first grid render, so no verdict exists yet, `checker.failed` is false and all eight `img` get `pending`; without `faviconBaseUrl` a letter is created instead of an `img` (`:1518`). No `data-icon-ready`, no `:not([src])`. `docs/starter-rows-icon-chip.md` § Accepted exceptions: the sentence about "the empty light square until its image decodes" is replaced by "not observed on a reachable path (run 35)".
3. **Probe numbers become accepted exceptions (backlog 90 closed).** `docs/starter-rows-icon-chip.md` § Accepted exceptions gets the probe table (compact, the same numbers as above) and states that dark plates and the light-plate merge are accepted and that no per-icon backdrop is built; the "every row" wording of its Decision 1 gets a pointer to this spec.
4. **E2E helpers (backlog 89 в), not a product change.** From `dg-75` and `dg-76` the helpers that are verbatim equal move into `.private/e2e/lib/starterRows.mjs`: `rgbOf`, `alphaOf`, `transparent`, `lumRGB`, `ratioRGB`, `setChecked`, `noErrors`, `safe`, `nextFrames`, `park`, `waitSoft`, `waitFill`. `setChecked` and `waitFill` read `BOXES` (built from `STEP2` from `WIZARD`) and `HOVER_PAINT_WAIT_MS`, whose values are equal in both files: the lib file exports `STEP2`, `BOXES` and `HOVER_PAINT_WAIT_MS`; both scenarios import `BOXES` and `HOVER_PAINT_WAIT_MS` and drop their local `STEP2`/`BOXES`/`HOVER_PAINT_WAIT_MS` definitions (`STEP2` is only used to build `BOXES`; the signatures and the checks do not change). Everything else that differs stays local: `over`, `rowState`, `tokens`, `hoverRow`, `unhover`, `focusRowByKeyboard`, `toStep2`, `withDesk`, `routeFavicons`. `dg-73` has its own copies of some helpers; it is not touched, it only takes part in the before/after self-check. (Review round 1 table: the helpers with different signatures or bodies are not merged; merging `rowState`/`withDesk` would change the checks.) Self-check: the check names and counts of `dg-73`, `dg-75`, `dg-76` are identical before and after (recorded once on `origin/main`), all three green, and a deliberate break of one shared helper turns a named check red.
5. **Unchanged.** Backdrop colours and tokens, hover, busy, opacity, grayscale, the letter chip, the grid tiles, the DOM, tab order, names, storage, `src/newtab.js`, the default-icon check, `CHANGELOG.md` (no behaviour change; a comment and docs only).

## Scope

- `src/surfaces.css` (the comment), `test/newtabSource.test.js` (the comment pin), `docs/starter-rows-icon-chip.md` (§ Accepted exceptions, Decision 1 pointer; status stays `implemented`), this spec (`implemented`).
- `.private/e2e/lib/starterRows.mjs` (new), `dg-75`, `dg-76` (imports); `dg-73` unchanged.

## Acceptance scenarios

Common setup where an E2E applies: harness 1280×800, wizard step 2, eight starters, the `dg-76` route (a PNG for `chatgpt.com`, others failed).

### AS-FBC-01 Nothing computed changes
- Given: both themes and forced colors; checked, unchecked, hover, focus and busy rows.
- When: running `dg-73`, `dg-75`, `dg-76` on the branch.
- Then: all green, with the check names and counts recorded on `origin/main` (the `src/` change is a CSS comment, no computed style differs).
- Verified by: E2E `dg-73`, `dg-75`, `dg-76`.

### AS-FBC-02 The comment explains the missing hover and forced-colors backdrop
- Then: the comment block directly above `img.onboarding-wizard__starter-icon { background: var(--icon-backdrop) }` matches the pin of Decision 1 (reasons about the hover surface and the forced-colors Canvas; the pin is red on `main`, green after the rewrite); there is still exactly one backdrop rule for the favicon `img`, none inside `@media (hover: hover)` or `@media (forced-colors: active)` (the existing ICB pins 2 and 3 stay green).
- Verified by: `test/newtabSource.test.js` (new pin: red on `main` before the comment is rewritten, and mutation: removing the Canvas or the surface reason turns it red).

### AS-FBC-03 E2E helper extraction changes no check
- Given: `dg-73`, `dg-75`, `dg-76` run on `origin/main` (before) and on the branch (after).
- Then: the lists of check names and the counts are identical and all green; breaking one shared helper (for example `ratioRGB`) makes a named check red.
- Verified by: the recorded before/after lists in the plan task and the mutation run.

### AS-FBC-04 Accepted exceptions are written down
- Then: `docs/starter-rows-icon-chip.md` § Accepted exceptions contains the probe table numbers (9/14/28/14/1/1 of 69 and 2 one-pixel-off), says backlog 90 is closed as accepted and the "empty square" sentence is replaced.
- Verified by: design review only (a text change, read by the reviewer).

## Paint-only

A comment and test/doc changes: no geometry, text, DOM, tab order or animation changes at any width.

## Review focus

- Do the two accepted-exception classes look as bad as the numbers say? Dark plates (X, 1.31:1 on the panel; nearly vanishes in an unchecked row) and light plates (ChatGPT merging with the backdrop, 1.1:1) in checked and unchecked rows: the lens reports, it does not reopen the decision.
- Is the new comment true: hover fill really on the surface only; forced colors really replace the backdrop (`dg-76` AS-ICB-02 values)?

## Accepted exceptions

- No per-icon backdrop: the probe shows a luminance rule would change 2 of 69 real icons (owner decision 2026-10-14, option A).
- A dark opaque plate (13 % of probed icons, among the starters X) stays close to the panel (up to 1.31:1 for a pure black plate) and almost vanishes in an unchecked row; in a checked row the run 36 ring outlines it; backlog 90 is closed as accepted.
- A light plate (20 %) merges with the light backdrop (1.1:1 on average); the glyph inside stays readable.
- Every exception of `docs/starter-rows-icon-chip.md` stays.
- The probe used Google's favicon proxy, not Chrome's `_favicon`; real icons of a profile can differ.

## Non-goals

- A luminance- or plate-based backdrop, an outline or ring for dark plates (declined in run 35, decided later in run 36, `docs/favicon-outline.md`: a quiet ring in checked rows only), changes to the unchecked look (owner declined these on 2026-10-14); a backdrop appearing only after load (not reproducible); a fade-in (`SRP pin 1` forbids `transition` on the starter rules).
- Grid tiles (`.favorite-tile`), backlog 84 and 86, the default-icon check logic.

## Process

UI pipeline in the compact form of run 34 (the `src/` hash changes, so a final design review is required): one task group, no checkpoint; full E2E; `permissions.md` untouched; backlog 89 and 90 are struck through in the merge cleanup.
