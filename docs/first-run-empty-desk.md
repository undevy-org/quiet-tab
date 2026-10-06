# First run: an empty desk under the city modal

## Status

`draft`

Decision: **do it**. Owner request 2026-10-06 (local session): on the first run, while the city modal is open there must be no tiles under it; Settings, Add and the "Set a city" hint appear only after the modal closes. Owner answers to the UX questions (2026-10-06): the tiles appear with a soft fade (about 200 ms), instantly with reduced motion.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-06 | "First run (onboarding): while the city window is open there must be no tiles below it; Settings, Add and the hint appear only after the window closes." | `confirmed`, by rule | The boot path renders the grid first and opens the first-run modal after it (`src/newtab.js`, bootstrap: `renderFavorites()` → `startWeather()` → `isDismissed()` → `maybeAutoShowCityPrompt`); the modal backdrop is translucent, so the hint, Settings, Add (and any links) show through it. `dg-15` pins it: "the grid is rendered behind it (links, Set a city hint, Settings, Add) and inert". `docs/architecture.md` § City modal: "After the first grid render, once per page load". |

## Current behaviour (`main` at `b6dfdb7`)

Fresh install, 1280×800: the grid renders the hint tile at (0,0), Settings at (6,0), Add at (7,0) (the other metric cells stay reserved and empty); a few milliseconds later, after the local read of the dismissal flag, `#city-modal` is inserted over it. The tiles stay visible through the backdrop for as long as the modal is open. `#favorites` is `inert` while the modal is open.

## Default decisions (owner can override)

1. **The veil.** While the first-run modal is open (`cityModalMode(weatherUi) === "first-run"`), every tile of the grid is hidden: `#favorites` carries `data-veiled="true"` and is `visibility: hidden`, so no tile is painted, hit-testable, focusable or in the accessibility tree. The tiles stay in the DOM (the render path, the weather updates and the resize re-render work as before, and they keep `inert`). This covers every tile on the grid: links, the hint, weather tiles, Settings, Add. The page background stays; there is no empty grid outline (the grid has no visible box). `#desktop-status` and `#desktop-live` are siblings of `#favorites` in `body` (`src/newtab.html`), not tiles: the veil does not touch them, so a page status (the only one possible at that moment is the ensure-failure message) stays visible and announced as today. Invariant: **the veil is on if and only if a first-run modal is open.** A change-mode modal (from the hint tile or the weather edit dialog) never veils the grid (unchanged behaviour).
2. **No flash on load.** On a load where the first-run modal opens, no tile is ever painted before the modal: the decision is taken before the first render. Today the dismissal flag is read after the first render "so it never delays the grid"; now, when every other input of `shouldAutoShowCityPrompt` already allows the modal (location read and unset, a metric enabled, weather available, grid not locked), the flag is read **before** the first render, and the grid renders veiled with the modal opened in the same task. When any other input already rules the modal out (a city is set, all metrics hidden, the grid is locked, weather is unavailable, the location read failed), the flag is not read before the render and the grid appears exactly as today. Cost: one `chrome.storage.local` read (a few ms) before the first paint, only on loads that may show the modal (no city set and not yet dismissed or the flag not yet known). A flag read that fails keeps the rule's fail-closed answer: no modal, the grid renders unveiled.
3. **Fail open.** If the modal cannot open after the veil was decided (`showCityModal` returns false or throws), the veil is removed in the same task and the grid is shown at once (no fade). The page never shows an empty desk without a modal.
4. **Reveal.** When the first-run modal closes by any route (Not now, Escape, a backdrop click after the 300 ms guard, or a successful Save), the veil is removed and the whole desk fades in once: `#favorites` gets `data-reveal="true"` for one opacity animation 0 → 1, 200 ms, `ease-out`; the attribute is removed on `animationend` (and by a 400 ms fallback timer, so it never sticks). The fade is on the persistent `#favorites` element, so a re-render during the fade (a weather result arriving, a resize) neither restarts nor cancels it. With `prefers-reduced-motion: reduce` there is no animation: the tiles appear at once. What appears is what the render path shows at that moment: after Not now / Escape / backdrop the hint, Settings, Add and any links; after Save the weather tiles (loading or with data), Settings, Add and any links. Tiles are interactive from the first frame of the fade (opacity does not block input).
5. **Focus.** Unchanged rules, now with visible targets: a first-run modal that had focus returns it to the Settings tile, which is already unveiled when focus lands (the veil is removed before focus is restored); a modal that never had focus leaves focus where it was (`body`). The focus ring is visible during the fade (it fades with the tile, ≤ 200 ms).
6. **Save failure, busy.** While a city request runs and after it fails, the modal stays open and the desk stays veiled. Nothing else changes in the modal (copy, layout, Tab trap, busy rules, flag writes).
7. **Nothing else changes.** No new text, control, colour, token or storage field. The flag semantics, the once-per-load rule and the change-mode modal stay as they are.

## Scope

- `src/newtab.js`: the boot order (decision 2: an early pure check of the inputs other than the flag, then the flag read, then the first render with the veil, then the modal); `showCityModal` / `hideCityModal` set and clear the veil for the first-run mode only; the reveal (decision 4) and the fail-open path (decision 3); `maybeAutoShowCityPrompt` keeps its rule. `src/cityPrompt.js`: optionally a pure helper for "every input except the flag allows the modal" so the early check is unit-tested (same inputs and fail-closed semantics as `shouldAutoShowCityPrompt`).
- `src/newtab.css`: `.desktop[data-veiled="true"] { visibility: hidden; }`, the `data-reveal` opacity keyframes (200 ms, `ease-out`), and `animation: none` for it under `prefers-reduced-motion: reduce`.
- Tests: `test/cityPrompt.test.js` (the early check, if added); `test/newtabSource.test.js`: the pin at `:563` ("the flag is read after the first render") encodes the old order and is replaced by a pin of the new order (flag read before the first render on the first-run path), never only deleted; new pins for the veil attribute set/cleared only in first-run mode, the reveal attribute and the reduced-motion rule.
- E2E: new `dg-56-first-run-empty-desk.mjs` (AS-FE-01..10). Existing scenarios to update: `dg-15-city-first-run.mjs` (the check "the grid is rendered behind it … visible" becomes "the tiles are in the DOM, veiled and not visible"; the AS-FU-01 plus-glyph count is taken after Not now, when Add is visible), and any other check that the full E2E shows relying on tiles being visible under the first-run modal (candidates by grep: `13-city-modal.mjs` AS-1 at `:622` counts tiles in the DOM and should stay green; `14-modal-upgrade.mjs`, `15-city-modal-layout.mjs`, `dg-45`, `dg-47..53` use the first-run modal only as the dialog under test). Each change is named in the run record.
- Docs: `docs/architecture.md` § City modal ("First-run rule": "After the first grid render" → the new order; "Background": the veil and the reveal); `CHANGELOG.md` `[Unreleased]` one line; private `agent-config/CLAUDE.md` (the city modal paragraph: veil while the first-run modal is open, flag read before the first render on that path).

## Process

This changes what the user sees, so it follows the full UI-phase cycle: this spec, a spec review and the spec gate, a plan in `quiet-tab-notes/superpowers/plans/`, E2E-first implementation, a checkpoint and the final design review (`design-review/PROTOCOL.md`), independent verification, merge.

## Non-goals

- Changing the first-run modal itself (copy, layout, buttons, focus, Tab trap, busy rules) or the dismissal flag.
- Veiling the grid under the change-mode modal or under desktop dialogs.
- Any animation of individual tiles (stagger, scale, slide) or of the modal.
- The position of the tiles on the grid (run 15, `docs/centered-grid.md`).
- A first-run screen for users who hid every metric (no modal, unchanged).

## Accepted exceptions

- **One extra local read before the first paint** on loads that may show the modal (decision 2). Measured in AS-FE-08; on a load with a city set nothing changes.
- **Existing users without a city who never dismissed the modal** (e.g. a profile that never saw it) also get an empty desk while it is open, links included: the modal is the onboarding step, and the desk comes back the moment it closes.

## Acceptance scenarios

Common setup unless stated: unpacked extension in the E2E harness at 1280×800 with `autoPrompt: true` (the first-run modal allowed); fresh seed per part (`clearAll`, `syncSet`, reload); "fresh install" = no widgets keys (the boot creates the defaults: four metrics, Settings, Add); "the desk is veiled" = `#favorites[data-veiled="true"]`, computed `visibility: hidden` on `#favorites`, and every `#favorites .desktop-grid > [data-widget-id]` returns `false` from `checkVisibility({ visibilityProperty: true })` and is not the result of `document.elementFromPoint` at its centre.

### AS-FE-01 Fresh install: the modal opens over an empty desk
- Given: fresh install, no city, no flag.
- When: a new tab opens.
- Then: `#city-modal` with the title "Show weather on your new tab?" is shown; the desk is veiled; the tiles `weather:hint`, `chrome:settings`, `chrome:add` exist in the DOM; `#favorites` is `inert`; focus did not move (`body`). A screenshot shows the modal over the plain page background with no tile, outline or glyph around it.
- Verified by: E2E `dg-56` (group 1); `dg-15` (updated).

### AS-FE-02 No tile is ever painted before the modal
- Given: fresh install; an init script records, on every animation frame from navigation until `#city-modal` exists, whether any `[data-widget-id]` is visible (`checkVisibility({ visibilityProperty: true })`).
- When: a new tab opens (repeated 5 times, fresh seed each time).
- Then: in every run no frame shows a visible tile before the modal; the first frame with tiles in the DOM already has `data-veiled="true"`.
- Verified by: E2E `dg-56` (group 2).

### AS-FE-03 Not now reveals the hint, Settings and Add with a fade
- Given: AS-FE-01.
- When: Not now is clicked.
- Then: the modal is removed; `data-veiled` is gone; `#favorites` has `data-reveal="true"` with a running opacity animation of 200 ms (`getAnimations()` on `#favorites`: one animation, duration 200, easing `ease-out`), opacity rises from < 0.5 at the first frame to 1; within 400 ms `data-reveal` is removed and `#favorites` opacity is 1. Visible tiles: the hint at (0,0), Settings, Add (exactly one tile with the plus glyph, Add, AS-FU-01); `#favorites` is not `inert`; the flag is written once; focus stays on `body` (the modal never had focus).
- Verified by: E2E `dg-56` (group 3).

### AS-FE-04 Escape and the backdrop reveal the desk; focus goes to Settings
- Given: AS-FE-01. (a) Tab moves focus into the modal (city field), then Escape. (b) The backdrop is clicked 500 ms after the modal opened.
- When: the modal closes.
- Then: in both, the desk is unveiled and fades in as in AS-FE-03; the flag is written once. (a) focus is on `chrome:settings`, which is visible (`checkVisibility` true) at the moment focus lands and shows the focus ring. (b) focus stays on `body`. A backdrop click in the first 300 ms is still ignored (the modal stays, the desk stays veiled).
- Verified by: E2E `dg-56` (group 4); `dg-15` (Escape part).

### AS-FE-05 Save reveals the weather tiles
- Given: AS-FE-01; the Open-Meteo endpoints are routed to a fixture (city "Tbilisi" resolves, forecast answers after 300 ms).
- When: "Tbilisi" is typed and Save pressed.
- Then: while the request runs the modal stays (busy) and the desk stays veiled; on success the modal closes, the desk fades in (AS-FE-03 timings) with the four weather tiles (loading or with data), Settings and Add, and no hint tile; no flag is written; the city is stored. A weather result arriving during the fade does not restart it (one animation from start to end).
- Verified by: E2E `dg-56` (group 5).

### AS-FE-06 A failed Save keeps the desk veiled
- Given: AS-FE-01; geocoding is routed to fail (network error).
- When: Save is pressed with "Tbilisi".
- Then: the modal stays with the existing error text; the desk stays veiled; then Not now reveals it as in AS-FE-03.
- Verified by: E2E `dg-56` (group 6).

### AS-FE-07 Loads without the first-run modal are unchanged
- Given: (a) a city is set; (b) no city and the flag is `true`; (c) no city, all four metrics hidden; (d) no city, the flag read is made to fail (init script makes `chrome.storage.local.get` reject for the flag key).
- When: a new tab opens.
- Then: no modal; `#favorites` never carries `data-veiled` or `data-reveal`; the tiles are visible on the first frame after the first render, as today (no fade on load).
- Verified by: E2E `dg-56` (group 7).

### AS-FE-08 The extra read costs at most one local read
- Given: (a) a fresh install; (b) a city is set.
- When: a new tab opens; an init script records the time of the first `#favorites .desktop-grid` insertion and counts `chrome.storage.local.get` calls before it.
- Then: (a) exactly one more `chrome.storage.local.get` before the first render than on `main` (the flag); (b) the same number as on `main`. Times are recorded in the run record, not asserted.
- Verified by: E2E `dg-56` (group 8); `test/newtabSource.test.js` (order pin).

### AS-FE-09 The change-mode modal never veils
- Given: no city, the flag `true` (no first-run modal); the hint tile visible.
- When: the hint tile is clicked (change mode), then Cancel.
- Then: while the modal is open the tiles stay visible (`checkVisibility` true) and `#favorites` has no `data-veiled`; after Cancel there is no `data-reveal` (no fade) and focus returns to the hint tile.
- Verified by: E2E `dg-56` (group 9).

### AS-FE-10 Reduced motion, narrow and low windows, resize
- Given: (a) `reducedMotion: "reduce"`, fresh install; (b) 320×600 and 500×800, fresh install; (c) fresh install at 1280×800, the window resized to 800×600 while the modal is open.
- When: the modal opens, then Not now.
- Then: (a) the desk is veiled while open; after Not now `#favorites` has no running animation and opacity 1 on the first frame. (b) the desk is veiled while open (no tile visible at any width); after Not now the tiles appear and nothing overflows horizontally (`scrollWidth === clientWidth`). (c) after the resize the desk is still veiled (the re-render keeps the veil); after Not now the tiles appear at the new width.
- Verified by: E2E `dg-56` (group 10).

## Review focus

- **Scenarios and states:** the veil invariant (on iff a first-run modal is open) on every open and close path, including a failed open (decision 3), Save success and failure, the busy state, a resize and a re-render while veiled or fading; the boot order (no flash, AS-FE-02) and that loads without the modal are unchanged (AS-FE-07).
- **Visual and layout:** the modal over the plain background at 1280, 500 and 320 px and at 600 px high; the fade (200 ms, ease-out, once, not per tile); nothing else moves when the desk appears.
- **Accessibility and copy:** hidden tiles are out of the accessibility tree and not focusable while veiled; focus lands on a visible Settings tile after Escape; reduced motion removes the fade; no new strings.
