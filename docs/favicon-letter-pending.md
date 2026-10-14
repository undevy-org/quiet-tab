# Favicon letter: hidden from assistive technology, and a neutral chip while the icon is checked

## Status

`implemented` — revision 5 (2026-10-14: status, grid-tolerance and wording corrections after the spec gate). Run №37 (`favicon-letter-pending`). A follow-up of run 32 (`docs/favicon-globe-fallback.md`, backlog 84 and 86), kept out of runs 33–36 as "run 32 logic". Backlog 84 and 86 were reproduced live before this spec (§ Probe result).

**Data compatibility: not required** (no storage change; no-users policy, `agent-config/CLAUDE.md`).

Related: `docs/favicon-globe-fallback.md` (decisions 2 and 4 stay, except where § Decisions says otherwise), `docs/favicon-backdrop.md`, `docs/favicon-outline.md`, `docs/onboarding-starter-rows.md`, `src/newtab.js` (`createFavoriteLetterNode`, `attachDefaultFaviconCheck`, `createOnboardingStarterIcon`), `src/newtab.css`, `src/surfaces.css`.

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-13 | Backlog 84 (design review of run 32, L3-01): the replacement letter is not hidden from assistive technology; the tree gives `text: C ChatGPT` in a wizard row and `button "Open Site0": S` for a tile. | `confirmed` (reproduced) | § Probe result, § Decision 2 |
| 2026-10-13 | Backlog 86 (checkpoint of run 32, L2-01): while the `_favicon` sentinel is pending (up to 2 s) a 1×1 tile is empty; then fail open shows the globe; tiles created after the timeout show the globe until reload. | `confirmed` (reproduced, second half is accepted) | § Probe result, § Decision 1, § Accepted exceptions |
| 2026-10-14 | Owner, UX question "what does the user see while the check runs": a neutral chip (the same rounded square as the letter, without a glyph), not an empty box and not the letter. | `confirmed` (owner) | § Decision 1 |

## Probe result (live Chromium, throw-away profile, no history; `scratch/probe-favicon-letter-pending/probe.mjs` in quiet-tab-notes)

- Backlog 86, normal case: the tile is `pending` for one frame (first pending frame at 41 ms, last at 41 ms, letter at 58 ms; requestAnimationFrame samples): an empty box for about one frame, then the letter. With the sentinel held open: `pending` from 42 ms to 2042 ms, the tile is an empty box for 2 s (the globe appearing afterwards is the fail open of run 32, `dg-74` AS-FDF-06a, not measured here).
- Mechanism (`scratch/probe-favicon-letter-pending/mech.mjs`, screenshot of the 28×28 box with the sentinel held, pixels read in Python): `visibility: hidden` paints nothing (box = tile colour). A pending `img` with `visibility: visible`, a fill and radius **and `object-position: 100px 0`** (a length larger than the biggest box, 40 px; the replaced content is clipped to the box) paints the fill only: no globe pixel (the globe's grey `(154,160,166)` is absent), `complete` true, `naturalWidth` 32, so `load` still fires and the check still runs. Candidates A `object-position: 300% 0` (a percent shifts nothing when the content fills the box), B `content: ""` + `clip-path` and E `content: url(data:…)` leave the globe painted (166 globe-grey pixels in the inner area) and are ruled out; C `100px 0` and D (C + `object-fit: none`) leave 0 globe pixels. Run in the browser's default (light) scheme. Light theme: chip `(229,232,236)` on tile `(226,230,234)`, about 3 levels: the chip is nearly invisible in the light theme, like the letter's own fill.
- Backlog 84: tile accessibility tree `button "Open Site 1": S`; wizard row `checkbox "Add ChatGPT to your grid" [checked]` and `text: C ChatGPT`; the letter node has no `aria-hidden`. In both places the name is already carried by another node (the tile's `aria-label`; the row's visible label and the checkbox `aria-label`), so the letter only adds noise.

## Current behaviour (`main`, `4fa8792`)

- `[data-icon-check="pending"]` is `visibility: hidden` (`src/newtab.css`): the `img` keeps its box and paints nothing (grid icon 28×28 in a 1×1 tile, 32 px in 1×2 and 40 px in 2×2 through the `.favorite-letter` size rules; wizard row icon 22×22).
- The letter nodes are `span.favorite-letter` (grid, size by tile, radius 7 px, fill `rgb(255 255 255 / 12%)`) and `span.onboarding-wizard__starter-icon--letter` (row, 22 px, radius 4 px, fill `var(--soft-fill)`). Neither is `aria-hidden`.

## Decisions (owner can override)

1. **A neutral chip while the check is pending (owner, 2026-10-14).** While an icon `img` has `data-icon-check="pending"` its box shows a chip: the size and radius of the letter node it will become (grid: the tile's letter size, radius 7 px; wizard row: 22 px, radius 4 px) and the letter's fill (grid: `rgb(255 255 255 / 12%)`; row: `var(--soft-fill)`), with no glyph, no `--icon-backdrop`, no `--icon-outline`. **The chip follows every rule that styles the row's letter**, so that chip → letter changes only the glyph: in an unchecked row `opacity: 0.6` and the grey filter of the letter (not the `img`'s 0.4), the letter's hover fill (`--soft-fill-strong`). Busy (`opacity` on the row surface) is inherited by the chip with no rule of its own; the letter has no forced-colors rule, so the chip behaves like it (its fill is dropped by the browser). **Specificity:** the row's `img` rules (`img.onboarding-wizard__starter-icon`, specificity 0,1,1, with the backdrop and ring; the unchecked `img` rule with `opacity: 0.4` and `box-shadow: none`, 0,5,2) outrank a bare `[data-icon-check="pending"]` rule (0,1,0) whatever the order, so the chip is three rules, each with a selector at least as specific as the rule it overrides: (1) base `img.onboarding-wizard__starter-icon[data-icon-check="pending"]` (`background: var(--soft-fill)`, `box-shadow: none`, the push-out), (2) unchecked `…:not(:checked) + …-surface img.…[data-icon-check="pending"]` (`opacity: 0.6`), (3) hover in `@media (hover: hover)` (`background: var(--soft-fill-strong)`; the letter's hover rule does not match an `img`, so this rule is new and must outrank rule (1)); the grid has the one rule `.favorite-icon[data-icon-check="pending"]`. The globe's pixels are never painted during the check (run 32 decision 4 stays). On verdict `default` the chip becomes the letter; on `real` the image replaces the chip (a wizard row then shows the image on its backdrop and outline, as today); on fail open the image replaces the chip. The tile's size and layout do not change. No transition and no animation. **Mechanism (proven by the probe, § Probe result):** the pending `img` is no longer `visibility: hidden` (no `visibility` declaration at all, so it inherits and stays hidden under the first-run veil) and gets the chip's fill and radius, and its content is pushed out of its box with `object-position: <length larger than the biggest box (40 px)>` (replaced content is clipped to the box), instead of `visibility: hidden`; `opacity` cannot be used (it would hide the fill too); percent positions, `content` replacement and `clip-path` do not hide the globe. The plan's Task 1 re-measures it in the real rules (grid sizes 28/32/40, row 22, both themes, `loading="lazy"` still loads, `complete`/`naturalWidth` unchanged, no broken-image mark) The mechanism is fixed (the probe ruled out the alternatives); the observable contract is the AS below.
2. **The letter is hidden from assistive technology.** Both letter nodes get `aria-hidden="true"` where they are created (`createFavoriteLetterNode`, the wizard fallback). Names do not change: tiles `Open <label>` / `Edit <label>`, rows `Add <label> to your grid` and the visible row label. The pending `img` already has `alt=""`; the chip is that `img` and adds nothing to the tree. The letter is not focusable, so keyboard order and focus are unaffected.
3. **Not changed.** Run 32 decision 2 (one 2 s timeout, fail open, no `pending` for later tiles), the verdict cache, the detection (`src/defaultFavicon.js`), letter colours and styles, the letter's glyph, custom icons, icon mode control, the starter table, Finish, the backdrop and outline of runs 35–36, storage, permissions, `docs/privacy.md`. No new user-facing string.

## Scope

- `.private/e2e/scenarios/dg-74-…mjs` router: an `autoReleaseMs` option for the gate (lesson run 32 (3); `dg-79` may carry its own copy instead); `src/newtab.css` (pending rule of the grid icon), `src/surfaces.css` (pending rule of the wizard icon), `src/newtab.js` (two `aria-hidden` sites), `CHANGELOG.md` `[Unreleased]`, `docs/favicon-globe-fallback.md` (decision 4: the pending state is now a chip; `## Status` note), `docs/onboarding-starter-rows.md` only if it describes the pending state.
- Pins and scenarios that assert the old pending state (`visibility: hidden`) and are rewritten with it: `test/newtabSource.test.js` pin "pending-rule" (~1895–1903: exactly one `data-icon-check` rule with body `visibility: hidden`; replaced by pins of all `[data-icon-check="pending"]` rules, by component selector); `dg-78` AS-FBO-05 (`held.visibility === "hidden"`, no ring pixels; becomes "pending box is the chip, no ring"); the frame recorder of `dg-74` (`painted` is `shown && complete && naturalWidth > 0`; it excludes `[data-icon-check="pending"]` from `painted`, and the "no globe" guarantee moves to the pixel checks of AS-FLP-01/02); `dg-74` AS-FDF-05, 10, 11. `dg-73`, `dg-75`, `dg-76` only wait for `pending` to end (`waitForFunction`) and are checked, not rewritten (the stale comment at `dg-76:6` is updated). Docs that state "pending = `visibility: hidden`": `docs/favicon-globe-fallback.md` decision 4, `docs/favicon-outline.md` (~line 82), `docs/favicon-backdrop.md` (~line 39); `docs/starter-rows-polish.md` (~line 25) is checked.
- Tests: `test/newtabSource.test.js` (pins by component selector over ALL rules with the component prefix, mutation-proven after the implementation commit), a new E2E `dg-79-favicon-letter-pending.mjs`.

## Acceptance scenarios

Common setup: the E2E harness profile has no history, so every `_favicon` answer is the grey globe. The sentinel is held or delayed with the `dg-74` router (`gate`/`hang` modes). "Icon box" is the 28/32/40 px grid icon (by tile size) or the 22×22 row icon rect.

### AS-FLP-01 Grid tile: chip while pending
- Given: dark colour scheme; favicon-mode links in a 1×1, a 1×2, a 2×1 and a 2×2 tile; the sentinel held on a gate that the scenario releases at the latest `GATE_BUDGET_MS` (1500 ms, inside the 2 s timeout; lesson run 32 (3)) after its first hit; the pixel read happens before the release.
- When: the new tab opens and the check is pending.
- Then: `[data-icon-check="pending"]` exists; computed `background-color` of the pending `img` is the letter's fill with alpha > 0 and `border-radius` equals the letter's; in a screenshot of the icon box every pixel of the inner area (inset 4 px from the box edge, so the rounded corners are excluded) equals the pixel at the box centre within ±5 levels per channel (uniform fill: no globe, no glyph; the tile has its own gradient of 2–4 levels, measured, the globe is about 100 levels away), and that colour differs from the tile colour sampled 3 px outside the box by at least 8 levels in one channel; after the release the node is `.favorite-letter` with the glyph, the same rect, and the same fill (computed `background-color` equal). Computed style is also read in the light scheme (fill and radius equal to the letter's; no pixel difference asserted, § Accepted exceptions).
- Red on old code (premise, run before the implementation): the old pending `img` has `visibility: hidden` and no fill, so the difference-from-tile, fill and push-out assertions fail (an empty box is uniform on the old code too: the uniformity assertion is a guard that turns red by the mutation below); a mutation that keeps the chip rule but drops `object-position` makes the globe's grey show and fails the uniformity assertion.
- Verified by: E2E `dg-79`; `newtabSource` pins.

### AS-FLP-02 Wizard row: chip while pending, checked and unchecked, light and dark
- Given: wizard step 2, the sentinel held (gate released at the latest `GATE_BUDGET_MS` after its first hit), once with `prefers-color-scheme: light` and once with `dark`; the default checked state (3 rows checked, 5 unchecked, `onboardingStarters.js`).
- When: step 2 is shown.
- Then: every row icon is pending and shows the chip: 22×22, radius 4 px, fill `--soft-fill` computed in that scheme, no `--icon-backdrop`, computed `box-shadow: none`, and the pixel 1 px outside the box equals the row surface (no ring, as in `dg-78` AS-FBO-05); after `scrollIntoView` of the row (the list scrolls; scrolling does not change the result), a glyph-free sample (the mean of four points 3 px inside the box corners, never the centre, which lies on the glyph) of a pending chip equals, within ±2 levels per channel, the same sample of the letter that replaces it after the release, **separately for a checked and an unchecked row** (the unchecked chip carries the letter's `opacity: 0.6`, not the `img`'s 0.4), and for a hovered row (the hover fill of the letter). After release all 8 rows are `.onboarding-wizard__starter-icon--letter` at the same rect; a row whose `_favicon` is a routed real PNG shows the `img` with its backdrop and outline (as in `dg-76`/`dg-78`).
- Red on old code: as AS-FLP-01 (the old pending icon paints nothing).
- Verified by: E2E `dg-79`; `newtabSource` pin.

### AS-FLP-03 Hung sentinel: never an empty box
- Given: the sentinel never answers (hang), grid tile and wizard rows, a frame recorder (`requestAnimationFrame`, started with the document) that records for each icon box its frame state.
- When: the new tab opens and `DEFAULT_FAVICON_TIMEOUT_MS` (2000) plus `HANG_GUARD_MS` (2500) pass.
- Then: for every icon box inside the first screen that is `pending` in the first frame in which it exists (not a tile built after the timeout; tiles outside the window keep `loading="lazy"` and stay pending without a `load`, § Accepted exceptions), the per-frame predicate "the box is non-empty" is true in every frame up to the end of the check: a pending `img` with a fill alpha > 0, or a letter, or a loaded `img` with computed `visibility` not hidden; the last pending frame is no later than the timeout plus `HANG_GUARD_MS`; after the timeout the `img` is visible (fail open); nothing else changes; no page error. A tile built after the timeout has no pending state at all (run 32).
- Red on old code: the old pending frames fail the predicate (no fill), so the scenario is red before the implementation.
- Verified by: E2E `dg-79` (the recorder records fill alpha and `visibility`, which the `dg-74` recorder does not).

### AS-FLP-03a Slow but successful sentinel (under the timeout)
- Given: the sentinel answers with the real globe after about 1200 ms (`delay` mode of the router), grid tile and wizard rows.
- When: the new tab opens.
- Then: chip until the answer, then the letter (no frame without a non-empty box); no globe pixel in samples taken at 300 ms and 800 ms from the first sentinel hit and the pending `img`'s computed `object-position` has a first component that is a length in px not smaller than the biggest box (40) in every frame; nothing changes after the letter.
- Verified by: E2E `dg-79`.

### AS-FLP-03b Slow sentinel, later than the timeout
- Given: the sentinel answers with the real globe after 3000 ms (`LATE_SENTINEL_MS` of `dg-74`).
- When: the new tab opens and 4.5 s pass.
- Then: chip until 2 s, then the `img` (fail open, run 32 AS-FDF-06b); the late answer changes nothing (no letter appears, no node is replaced); no empty frame; no page error.
- Verified by: E2E `dg-79`.

### AS-FLP-04 Grid letter is not in the accessibility tree
- Given: default-icon links of sizes 1×1, 1×2, 2×1 and 2×2, normal mode and edit mode.
- When: the settled tree of each tile is read (`ariaSnapshot`).
- Then: the tile is `button "Open <label>"` (`Edit <label>` in edit mode) with no child text equal to the letter; the letter node has `aria-hidden="true"`; the 2×1/2×2 visible label text is still in the tree; tab order is unchanged (the tile is the focus target).
- Verified by: E2E `dg-79`; `newtabSource` pin.

### AS-FLP-05 Wizard row letter is not in the accessibility tree
- Given: wizard step 2, no history (all 8 rows are letters).
- When: the tree of each row is read.
- Then: the tree of each row is the literal expected string per row, e.g. `checkbox "Add ChatGPT to your grid" [checked]` plus `text: ChatGPT` (the observed `C ChatGPT` loses the letter; whole strings, not a pattern on the first character); the 8 letter nodes have `aria-hidden="true"`; the checkbox is still the only focusable element of the row.
- Verified by: E2E `dg-79`; `newtabSource` pin.

### AS-FLP-06 Real and custom icons are untouched
- Given: a link whose `_favicon` is routed to a real PNG, a custom-icon link, a letter-only link; a wizard row with a routed real PNG.
- When: the new tab opens and settles.
- Then: the real icon is the `img` (never a chip after its verdict), the custom icon and the letter-only link are unchanged (the letter-only link's letter is also `aria-hidden`); `dg-76` and `dg-78` stay green.
- Verified by: E2E `dg-79` plus the existing scenarios.

### AS-FLP-07 Narrow window, forced colors, reduced motion
- Given: windows of 500 and 320 px, `forced-colors: active`, `prefers-reduced-motion: reduce`.
- When: the sentinel is held and then released.
- Then: the chip never overflows the tile or the row; under forced colors AS-FLP-03's "non-empty" predicate and the pixel checks do not apply (the browser drops the fill, § Accepted exceptions): computed styles are checked instead (`object-position` still pushes the content out, so the globe is not painted; the rect is kept); no transition or animation property on the chip rules.
- Verified by: E2E `dg-79`.

### AS-FLP-08 Rules are scoped and mutation-proven
- Given: the CSS and JS source.
- When: the pins run.
- Then: ALL rules whose selector contains `[data-icon-check="pending"]` are listed with their exact selectors and bodies (the grid chip rule, the row chip rule and the letter-parity rules of decision 1), including "no `transition`/`animation` in them" and "no `visibility: hidden`"; each chip rule's specificity is higher than the rule it overrides (rule (1) over the base `img` rule, rule (2) over the unchecked `img` rule, rule (3) over rule (1); order alone does not win) and is pinned through the full selectors; `aria-hidden` on both letter creation sites is pinned; each pin fails when its rule/line is removed after the implementation commit (mutation check recorded in the report).
- Verified by: `test/newtabSource.test.js`.

## Review focus

- No frame in which an icon box is empty or shows the globe (AS-FLP-01..03); the chip → letter step must not change colour or rect.
- The chip must not read as a loading spinner or a disabled control (it is a quiet fill, no motion).
- Accessibility tree after the change (AS-FLP-04, 05): the name is not lost, nothing but the letter is removed.
- The sweep of the run 32 scenarios that assert `visibility: hidden` for pending.
- Chip → letter parity in the wizard row in every state (checked, unchecked, hover, busy) and both themes, and the three specificity rules of Decision 1 (a bare rule loses to the row's `img` rules whatever the order).
- The chip under the first-run veil (it must stay hidden).

## Accepted exceptions

- Under `forced-colors: active` the chip (a fill) is dropped by the browser, like the letter's own fill: the box is empty for the check, as today. Not worth a border: the check lasts one frame in the normal case.
- With a hung sentinel the chip is replaced by the globe after 2 s (fail open, owner-approved in run 32). Tiles created after the timeout have no pending state and show the globe until the tab is reloaded (second half of backlog 86): re-checking later would bring back `pending` after the timeout, which run 32 forbids on purpose.
- In the light theme the grid chip is the letter's own fill (12% white) on a light tile: measured about 3 levels of 255 against the tile (`(229,232,236)` on `(226,230,234)`), so it is nearly invisible there, exactly like the letter's fill. The chip's job in the light theme is "no globe, no hole"; the letter's fill is a Non-goal. The pixel difference is asserted in the dark scheme only.
- Tiles outside the window keep `loading="lazy"`: their icon stays `pending` (and shows the chip) without a `load` until it is scrolled near the window (measured: 144 of 200 links at 500×800); the user cannot see them, and no scenario may count `pending == 0` on a long grid.
- Under `forced-colors: active` a hung sentinel leaves the box empty for up to 2 s (the chip's fill is dropped, as the letter's is); accepted, as today.
- The chip is one colour in every state (not themed by the site colour); on a very light custom tile accent it is low-contrast, which is fine for a placeholder that lasts about one frame.

## Non-goals

- Changing detection, the timeout, the verdict cache or the fail-open rule; a retry of a failed sentinel.
- Changing the letter's style, glyph or colour; the backdrop or outline of runs 35–36.
- Announcing the loading state to assistive technology (a one-frame state; the pending `img` has `alt=""`).
- Anything in the weather tiles, the Add menu or dialogs.

## Process

Full UI pipeline (`quiet-tab-pipeline`); design checkpoint on the grid and the wizard rows in both themes.
