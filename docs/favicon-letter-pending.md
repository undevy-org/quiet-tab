# Favicon letter: hidden from assistive technology, and a neutral chip while the icon is checked

## Status

`draft` — run №37 (`favicon-letter-pending`). A follow-up of run 32 (`docs/favicon-globe-fallback.md`, backlog 84 and 86), kept out of runs 33–36 as "run 32 logic". Backlog 84 and 86 were reproduced live before this spec (§ Probe result).

**Data compatibility: not required** (no storage change; no-users policy, `agent-config/CLAUDE.md`).

Related: `docs/favicon-globe-fallback.md` (decisions 2 and 4 stay, except where § Decisions says otherwise), `docs/favicon-backdrop.md`, `docs/favicon-outline.md`, `docs/onboarding-starter-rows.md`, `src/newtab.js` (`createFavoriteLetterNode`, `attachDefaultFaviconCheck`, `createOnboardingStarterIcon`), `src/newtab.css`, `src/surfaces.css`.

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-13 | Backlog 84 (design review of run 32, L3-01): the replacement letter is not hidden from assistive technology; the tree gives `text: C ChatGPT` in a wizard row and `button "Open Site0": S` for a tile. | `confirmed` (reproduced) | § Probe result, § Decision 2 |
| 2026-10-13 | Backlog 86 (checkpoint of run 32, L2-01): while the `_favicon` sentinel is pending (up to 2 s) a 1×1 tile is empty; then fail open shows the globe; tiles created after the timeout show the globe until reload. | `confirmed` (reproduced, second half is accepted) | § Probe result, § Decision 1, § Accepted exceptions |
| 2026-10-14 | Owner, UX question "what does the user see while the check runs": a neutral chip (the same rounded square as the letter, without a glyph), not an empty box and not the letter. | `confirmed` (owner) | § Decision 1 |

## Probe result (live Chromium, throw-away profile, no history; `scratch/probe-favicon-letter-pending/probe.mjs` in quiet-tab-notes)

- Backlog 86, normal case: the tile is `pending` for one frame (first pending frame at 41 ms, last at 41 ms, letter at 58 ms): an empty box for about one frame, then the letter. With the sentinel held open: `pending` from 42 ms to 2042 ms, then the globe image appears (fail open): the tile is an empty box for 2 s.
- Backlog 84: tile accessibility tree `button "Open Site 1": S`; wizard row `checkbox "Add ChatGPT to your grid" [checked]` and `text: C ChatGPT`; the letter node has no `aria-hidden`. In both places the name is already carried by another node (the tile's `aria-label`; the row's visible label and the checkbox `aria-label`), so the letter only adds noise.

## Current behaviour (`main`, `4fa8792`)

- `[data-icon-check="pending"]` is `visibility: hidden` (`src/newtab.css`): the `img` keeps its box and paints nothing (grid tile icon 28×28; wizard row icon 22×22).
- The letter nodes are `span.favorite-letter` (grid, 28 px, radius 7 px, fill `rgb(255 255 255 / 12%)`) and `span.onboarding-wizard__starter-icon--letter` (row, 22 px, radius 4 px, fill `var(--soft-fill)`). Neither is `aria-hidden`.

## Decisions (owner can override)

1. **A neutral chip while the check is pending (owner, 2026-10-14).** While an icon `img` has `data-icon-check="pending"` its box shows a chip: the same size, radius and fill as the letter node of that surface (grid: 28 px, radius 7 px, `rgb(255 255 255 / 12%)`; wizard row: 22 px, radius 4 px, `var(--soft-fill)`), with no glyph, no `--icon-backdrop`, no `--icon-outline`. The globe's pixels are never painted during the check (run 32 decision 4 stays). On verdict `default` the chip becomes the letter (the fill is the same, only the glyph appears, no colour jump); on `real` the image replaces the chip (a wizard row then shows the image on its backdrop and outline, as today); on fail open (decision 2 of run 32) the image replaces the chip. The tile's size and layout do not change. No transition and no animation (nothing to switch off for reduced motion). The mechanism that keeps the globe unpainted while the chip is painted is the plan's choice (live probe, `visibility: hidden` alone cannot paint a fill); the observable contract is AS-FLP-01..03.
2. **The letter is hidden from assistive technology.** Both letter nodes get `aria-hidden="true"` where they are created (`createFavoriteLetterNode`, the wizard fallback). Names do not change: tiles `Open <label>` / `Edit <label>`, rows `Add <label> to your grid` and the visible row label. The pending `img` already has `alt=""`; the chip is that `img` and adds nothing to the tree. The letter is not focusable, so keyboard order and focus are unaffected.
3. **Not changed.** Run 32 decision 2 (one 2 s timeout, fail open, no `pending` for later tiles), the verdict cache, the detection (`src/defaultFavicon.js`), letter colours and styles, the letter's glyph, custom icons, icon mode control, the starter table, Finish, the backdrop and outline of runs 35–36, storage, permissions, `docs/privacy.md`. No new user-facing string.

## Scope

- `src/newtab.css` (pending rule of the grid icon), `src/surfaces.css` (pending rule of the wizard icon), `src/newtab.js` (two `aria-hidden` sites), `CHANGELOG.md` `[Unreleased]`, `docs/favicon-globe-fallback.md` (decision 4: the pending state is now a chip; `## Status` note), `docs/onboarding-starter-rows.md` only if it describes the pending state.
- Tests: `test/newtabSource.test.js` (pins by component selector, mutation-proven after the implementation commit), a new E2E `dg-79-favicon-letter-pending.mjs`; sweep of the scenarios that read icon nodes or the frame recorder of `dg-74` (AS-FDF-05, 10, 11 assert `visibility` of the pending image) and `dg-73`, `dg-75`, `dg-76`, `dg-78`.

## Acceptance scenarios

Common setup: the E2E harness profile has no history, so every `_favicon` answer is the grey globe. The sentinel is held or delayed with the `dg-74` router (`gate`/`hang` modes). "Icon box" is the 28×28 grid icon or 22×22 row icon rect.

### AS-FLP-01 Grid tile: chip while pending
- Given: a favicon-mode link in a 1×1 tile (also 1×2, 2×1, 2×2), the sentinel held on a gate.
- When: the new tab opens and the check is pending.
- Then: `[data-icon-check="pending"]` exists; a screenshot of the icon box shows no globe pixel (no pixel of the grey globe image) and its centre is the chip fill composited on the tile (not the plain tile colour: the chip differs from the tile background); the box rect equals the rect of the letter that replaces it after the gate opens; after release the node is `.favorite-letter` with the glyph and the same rect.
- Verified by: E2E `dg-79`; `newtabSource` pin.

### AS-FLP-02 Wizard row: chip while pending, light and dark
- Given: wizard step 2, the sentinel held, once with `prefers-color-scheme: light` and once with `dark`.
- When: step 2 is shown.
- Then: every row icon is pending and shows the chip (22×22, radius 4 px, fill `--soft-fill` computed in that scheme); no globe pixel; no `--icon-backdrop` and no outline ring on the chip. After release all 8 rows are `.onboarding-wizard__starter-icon--letter` at the same rect; a row whose `_favicon` is a routed real PNG shows the `img` with its backdrop and outline (as in `dg-76`/`dg-78`).
- Verified by: E2E `dg-79`; `newtabSource` pin.

### AS-FLP-03 Hung sentinel: never an empty box
- Given: the sentinel never answers (hang), grid tile and wizard rows.
- When: the new tab opens and 2 s plus a named guard pass.
- Then: a frame recorder over the whole period finds, for each icon box, no frame in which it is empty (every frame is the chip, then after the timeout the `img`); the chip lasts until the timeout and no longer; after the timeout the `img` is visible (fail open, run 32 decision 2) and nothing else changes; no page error.
- Verified by: E2E `dg-79`.

### AS-FLP-04 Grid letter is not in the accessibility tree
- Given: default-icon links of sizes 1×1, 1×2, 2×1 and 2×2, normal mode and edit mode.
- When: the settled tree of each tile is read (`ariaSnapshot`).
- Then: the tile is `button "Open <label>"` (`Edit <label>` in edit mode) with no child text equal to the letter; the letter node has `aria-hidden="true"`; the 2×1/2×2 visible label text is still in the tree; tab order is unchanged (the tile is the focus target).
- Verified by: E2E `dg-79`; `newtabSource` pin.

### AS-FLP-05 Wizard row letter is not in the accessibility tree
- Given: wizard step 2, no history (all 8 rows are letters).
- When: the tree of each row is read.
- Then: the row is `checkbox "Add <label> to your grid"` plus `text: <label>` and no letter text (`C ChatGPT` becomes `ChatGPT`); the 8 letter nodes have `aria-hidden="true"`; the checkbox is still the only focusable element of the row.
- Verified by: E2E `dg-79`; `newtabSource` pin.

### AS-FLP-06 Real and custom icons are untouched
- Given: a link whose `_favicon` is routed to a real PNG, a custom-icon link, a letter-only link; a wizard row with a routed real PNG.
- When: the new tab opens and settles.
- Then: the real icon is the `img` (never a chip after its verdict), the custom icon and the letter-only link are unchanged (the letter-only link's letter is also `aria-hidden`); `dg-76` and `dg-78` stay green.
- Verified by: E2E `dg-79` plus the existing scenarios.

### AS-FLP-07 Narrow window, forced colors, reduced motion
- Given: windows of 500 and 320 px, `forced-colors: active`, `prefers-reduced-motion: reduce`.
- When: the sentinel is held and then released.
- Then: the chip never overflows the tile or the row; under forced colors the chip is allowed to be invisible (same as the letter's fill, § Accepted exceptions) but the box keeps its rect and the globe is still never painted; no transition or animation property on the chip rules.
- Verified by: E2E `dg-79`.

### AS-FLP-08 Rules are scoped and mutation-proven
- Given: the CSS and JS source.
- When: the pins run.
- Then: the chip rules are pinned by the component selector (`.favorite-icon[data-icon-check="pending"]`, `img.onboarding-wizard__starter-icon[data-icon-check="pending"]`), including "no `transition`/`animation` in them"; `aria-hidden` on both letter creation sites is pinned; each pin fails when its rule/line is removed after the implementation commit (mutation check recorded in the report).
- Verified by: `test/newtabSource.test.js`.

## Review focus

- No frame in which an icon box is empty or shows the globe (AS-FLP-01..03); the chip → letter step must not change colour or rect.
- The chip must not read as a loading spinner or a disabled control (it is a quiet fill, no motion).
- Accessibility tree after the change (AS-FLP-04, 05): the name is not lost, nothing but the letter is removed.
- The sweep of the run 32 scenarios that assert `visibility: hidden` for pending.

## Accepted exceptions

- Under `forced-colors: active` the chip (a fill) is dropped by the browser, like the letter's own fill: the box is empty for the check, as today. Not worth a border: the check lasts one frame in the normal case.
- With a hung sentinel the chip is replaced by the globe after 2 s (fail open, owner-approved in run 32). Tiles created after the timeout have no pending state and show the globe until the tab is reloaded (second half of backlog 86): re-checking later would bring back `pending` after the timeout, which run 32 forbids on purpose.
- The chip is the same colour in every state (not themed by the site colour); on a very light custom tile accent it is low-contrast, which is fine for a placeholder that lasts about one frame.

## Non-goals

- Changing detection, the timeout, the verdict cache or the fail-open rule; a retry of a failed sentinel.
- Changing the letter's style, glyph or colour; the backdrop or outline of runs 35–36.
- Announcing the loading state to assistive technology (a one-frame state; the pending `img` has `alt=""`).
- Anything in the weather tiles, the Add menu or dialogs.

## Process

Full UI pipeline (`quiet-tab-pipeline`); design checkpoint on the grid and the wizard rows in both themes.
