# First run: an empty desk under the city modal

## Status

`implemented`

Decision: **do it**. Owner request 2026-10-06 (local session): on the first run, while the city modal is open there must be no tiles under it; Settings, Add and the "Set a city" hint appear only after the modal closes. Owner answers to the UX questions (2026-10-06): the tiles appear with a soft fade (about 200 ms), instantly with reduced motion; users who already have links (e.g. a second computer where the links arrived through sync and no city is set) also get the empty desk while the modal is open ("Да, пустой стол всегда").

Terms: **the desk** is `#favorites` (`main.desktop`, the grid of tiles and nothing else). **Veiled** is the state defined in decision 1.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-06 | "First run (onboarding): while the city window is open there must be no tiles below it; Settings, Add and the hint appear only after the window closes." | `confirmed`, by rule | The boot path renders the grid first and opens the first-run modal after it (`src/newtab.js` bootstrap: `renderFavorites()` → `void startWeather()` → `isDismissed()` → `maybeAutoShowCityPrompt`); the modal backdrop is translucent (`--surface-backdrop`, 50 % black), so the hint, Settings, Add and any links show through it. `dg-15` pins it: "the grid is rendered behind it (links, Set a city hint, Settings, Add) and inert". `docs/architecture.md` § City modal: "After the first grid render, once per page load". |

## Current behaviour (`main` at `b6dfdb7`)

Fresh install, 1280×800: the grid renders the hint tile in the temperature cell, Settings and Add (the other metric cells stay reserved and empty); after one `chrome.storage.local` read of the dismissal flag (a few ms), `#city-modal` is inserted over it. The tiles stay visible through the backdrop for as long as the modal is open; `#favorites` is `inert`. A mouse click on Not now focuses the button, so on close focus goes to the Settings tile (D14 of the onboarding-modal spec: focus returns to Settings if it was ever inside the modal); a backdrop click leaves focus on `body`.

## Default decisions (owner can override)

1. **The veil.** While a first-run modal is open the desk is veiled: `#favorites` carries `data-veiled="true"`; CSS gives it `visibility: hidden` and `height: 100vh; overflow: hidden` (so a tall desk does not leave an empty, scrollable page under the modal). No tile is painted, hit-testable, focusable or in the accessibility tree; the tiles stay in the DOM (render, weather updates and the resize re-render work as before) and `#favorites` keeps `inert`. This covers every tile: links, the hint, weather tiles, Settings, Add. The page background stays; the grid has no visible box, so nothing of it shows. `#desktop-status` and `#desktop-live` are siblings of `#favorites` in `body` (`src/newtab.html`), not tiles: the veil does not touch them (the only status possible at that moment, the ensure-failure message, stays visible and announced as today).
2. **One owner of the veil.** Only `showCityModal` sets the veil, and only for `mode === "first-run"`: as the first statement after the modal was inserted successfully (right after `cityModalRoot = root`, before `place()`, `hideTooltip()`, `closeAddMenu()` and `inert`), so a modal in the DOM is never left unveiled. Only `hideCityModal` clears it, unconditionally (a no-op after a change-mode modal, and correct even if a throw in `place()` left `weatherUi` without the first-run mode), **before** focus is restored (otherwise `applyPendingFocus` would try to focus a hidden Settings tile, fail and drop the pending focus). There is no other path: the modal opens only through `showCityModal` and closes only through `hideCityModal`. Invariant by construction: **the desk is veiled if and only if a first-run modal is open.** A change-mode modal (from the hint tile or the weather edit dialog) never veils (unchanged behaviour). Save failure and the busy state keep the modal open, so they keep the veil.
3. **The decision is taken once, before the first render.** New boot order after `widgetsState` and the city have been read: (a) a pure early check of every input of `shouldAutoShowCityPrompt` except the flag (location read and unset, at least one metric `enabled`, weather available, grid not locked); (b) only if it passes, the flag is read, capped at **250 ms** (`Promise.race` with a timer; on timeout the flag counts as unknown, fail closed, and the late result is ignored); (c) `shouldAutoShowCityPrompt` with live state; (d) if it allows, `showCityModal("first-run", null)`; (e) the first `renderFavorites()`, then the ensure-failure status, then `void startWeather()`, in today's order (`src/newtab.js:2194-2196`). Steps (a)–(d) run inside one `try/catch`: an exception before the modal is inserted means no modal and no veil (an exception after the insertion leaves an open, veiled modal that closes normally), and step (e) runs in every case, so the page always renders its tiles (veiled only when a modal is actually open). The post-render flag read and the post-render prompt call are removed: one decision point per load. The once-per-load rule (`cityModalShownThisLoad`) and every guard of `showCityModal` stay. A `resize` before the first render (the window between `getState` and step (e), which exists today and is now up to 250 ms longer) does not render: the resize handler skips while nothing has been rendered yet (`renderedColumns === 0`), so no tile can appear before the decision. This is pinned in `test/newtabSource.test.js` (the resize handler returns while `renderedColumns === 0`) and checked by AS-FE-02 (b).
   *Cost, accepted:* every load with no city set, a metric enabled, weather available and the grid unlocked waits for one `chrome.storage.local` read (a few ms, at most 250 ms) before the first paint. This includes users who already dismissed the modal and see the hint tile on every tab (the flag can only be known by reading it). Loads with a city set, all metrics hidden, a locked grid or a failed location read do not read the flag at all (today they read it after the render): they paint as fast as today or faster.
4. **Reveal.** When a first-run modal closes by any route (Not now, Escape, a backdrop click after the 300 ms guard, or a successful Save), the veil is removed and, unless `prefersReducedMotion()` is true, `#favorites` gets `data-reveal="true"` for one CSS animation `desk-reveal`: opacity 0 → 1, 200 ms, `ease-out`. The attribute is removed on `animationend` with `event.target === favoritesRoot && event.animationName === "desk-reveal"` (child animations bubble and must not end it), with a 400 ms fallback timer so it never sticks. The animation lives on the persistent `#favorites` element: a re-render during the fade (`replaceChildren` of the grid: entering edit mode, a resize, a weather update) neither restarts nor cancels it. With reduced motion JS never sets `data-reveal` (CSS also has `animation: none` for it under `prefers-reduced-motion: reduce` as a safety net): the tiles appear at once. What appears is what the render path shows at that moment: after Not now / Escape / backdrop, the hint, Settings, Add and any links; after Save, the weather tiles, Settings, Add and any links. Tiles are interactive from the first frame (opacity does not block input).
5. **Focus.** Unchanged rules: a first-run modal that had focus at any time (including a mouse click on Not now or Save) returns it to the Settings tile; one that never had focus (closed by a backdrop click without prior focus) leaves focus where it was (`body`). Because the veil is cleared first, Settings is visible when focus lands; its focus ring fades in with the desk (≤ 200 ms).
6. **Nothing else changes.** No new text, control, colour, token or storage field. The modal itself (copy, layout, Tab trap, busy rules, suggestions, Escape order), the flag semantics and the change-mode modal stay as they are. The motion (200 ms, `ease-out`) is a literal in `newtab.css` like the jiggle; `docs/design-system.md` gets one line describing it.

## Scope

- `src/cityPrompt.js`: a pure helper for step 3(a), e.g. `firstRunPromptPossible(input)` (the inputs of `shouldAutoShowCityPrompt` without `flagRead`/`dismissed`, the same fail-closed semantics: anything unknown means false), unit-tested.
- `src/newtab.js`: the boot order of decision 3 (one decision point; the post-render read and the post-render call of `maybeAutoShowCityPrompt` go; the function may be folded into the new step or kept as its body); the 250 ms cap; the veil in `showCityModal` / `hideCityModal` (decision 2; the line `} else if (favoritesRoot) favoritesRoot.inert = false;` keeps its exact form, pinned at `test/newtabSource.test.js:824`); the reveal (decision 4).
- `src/newtab.css`: `.desktop[data-veiled="true"] { visibility: hidden; height: 100vh; overflow: hidden; }`, `@keyframes desk-reveal` and `.desktop[data-reveal="true"] { animation: desk-reveal 200ms ease-out; }`, and `animation: none` for it under `prefers-reduced-motion: reduce`.
- Unit tests: `test/cityPrompt.test.js` (the early check). `test/newtabSource.test.js`, describe "newtab first-run city prompt source" (`:546-605`): the pins of the old order and shape are **replaced, never only deleted**: `:553-564` (one call `maybeAutoShowCityPrompt({ flagRead, dismissed });`, "render, then weather, then the prompt", "the flag is read after the first render"), `:566-571` (`let flagRead = false;`, `catch { flagRead = false; }`, `dismissed = await …isDismissed(); flagRead = true;` in the bootstrap), `:580-593` (the body of `maybeAutoShowCityPrompt` with live state; the five live-state parts must still be pinned wherever the rule is fed), `:598-605` (one `showCityModal("first-run"` call, no `focus()` on that path: both stay); outside that block also `:575` (the exact `import { feedbackReserve, shouldAutoShowCityPrompt } from "./cityPrompt.js";`, which gains the new helper) and `:466-473` (the slice `function maybeAutoShowCityPrompt(` … `const items` must contain `cityModalShownThisLoad`; if the function is folded into the new step, the once-per-load guard is pinned where it now lives). New pins: decision 3 order (early check, capped flag read, modal, then the first render, then `startWeather`; no `isDismissed` after the render), the 250 ms cap, the veil set only in first-run mode after insertion and cleared before `applyPendingFocus`, the reveal guarded by `prefersReducedMotion()`, the `animationend` filter (target and name).
- Resize handler: returns while `renderedColumns === 0` (decision 3); new pin in `test/newtabSource.test.js`.
- E2E harness: `openNewTab` (`.private/e2e/lib/harness.mjs:100`) and the local `newTab()` helpers of `13-city-modal.mjs:561-566` and `14-modal-upgrade.mjs:23-28` wait for a **visible** `#favorites` (`waitForSelector` default); under the veil `#favorites` is `visibility: hidden`, so they would time out. They wait with `{ state: "attached" }` instead (the tiles are asserted by each scenario anyway); the same for any other wait on a visible `#favorites` in the 13 `autoPrompt: true` scenarios.
- E2E: new `dg-56-first-run-empty-desk.mjs` (AS-FE-01..12). Existing scenarios: `dg-15-city-first-run.mjs` (the check "the grid is rendered behind it … visible" at `:62-71` becomes "the tiles are in the DOM, veiled and not visible"; its `getBoundingClientRect` check passes under `visibility: hidden` too, so it must be replaced, not kept; the AS-FU-01 plus-glyph count moves after Not now). `13-city-modal.mjs` AS-20 (`:853-872`) and M-1 (`:873-889`) delay the flag read by 1500 ms and click the hint tile: with the 250 ms cap the desk renders unveiled after 250 ms with no modal, so the hint is clickable before 1500 ms and both are expected to stay green with their meaning (a late flag result opens nothing); if the full E2E shows otherwise they are adapted and named in the run record. `13` AS-1 (`:622`, tiles counted in the DOM) and `14-modal-upgrade` AS-8a (`failStorageInit` on the flag: tiles and hint, no modal) stay green. The other `autoPrompt: true` scenarios (`14`, `15`, `dg-14`, `dg-45`, `dg-47..53`) use the modal as the dialog under test. The full E2E decides; any other change is named in the run record.
- Docs: `docs/architecture.md` § City modal ("First-run rule": the new order and the 250 ms cap; its "at least one weather tile is shown" becomes "at least one weather tile is enabled", which is what the code checks; "Background": the veil and the reveal); `docs/design-system.md` one motion line (reveal: opacity 0 → 1, 200 ms ease-out, none with reduced motion); `CHANGELOG.md` `[Unreleased]` one line; private `agent-config/CLAUDE.md` (city modal paragraph: the veil while the first-run modal is open, the flag read before the first render with the 250 ms cap).

## Process

This changes what the user sees, so it follows the full UI-phase cycle: this spec, a spec review and the spec gate, a plan in `quiet-tab-notes/superpowers/plans/`, E2E-first implementation, a checkpoint and the final design review (`design-review/PROTOCOL.md`), independent verification, merge.

## Non-goals

- Changing the first-run modal itself (copy, layout, buttons, focus rules, Tab trap, busy rules, suggestions) or the dismissal flag.
- Veiling the desk under the change-mode modal or under desktop dialogs.
- Any animation of individual tiles (stagger, scale, slide) or of the modal.
- The position of the tiles on the grid (that is run 15, "centered grid", specified separately).
- A first-run screen for users who hid every metric (no modal, unchanged).

## Accepted exceptions

- **One capped local read before the first paint** on every load without a city where the modal is otherwise possible, including users who already dismissed it (decision 3). Measured in AS-FE-08.
- **A slow flag read (over 250 ms) skips the modal for that load:** the desk shows unveiled with the hint tile; the flag is not written, so the next tab can show the modal.
- **Users who already have links** get the empty desk while the first-run modal is open (owner's answer); the desk returns the moment the modal closes.

## Acceptance scenarios

Common setup unless stated: unpacked extension in the E2E harness at 1280×800 with `autoPrompt: true`; fresh seed per part (`clearAll`, `syncSet`, reload); "fresh install" = no widgets keys (the boot creates the defaults: four metrics, Settings, Add); "with links" = the `dg-15` seed (links `f0` 1×1 and `f1` 2×1 plus the default metrics and chrome tiles). Tiles are named by `data-widget-id`, never by cell. "**Veiled**" (the check) = `#favorites[data-veiled="true"]`, computed `visibility: hidden` on `#favorites`, and every `#favorites .desktop-grid > [data-widget-id]` returns `false` from `checkVisibility({ visibilityProperty: true })`. Event recorders on `#favorites` count only events with `event.target === #favorites` and `event.animationName === "desk-reveal"` (`animationstart`/`animationend` bubble from the tiles, e.g. `tile-jiggle` in edit mode). Page scroll is measured on `document.documentElement` (`scrollHeight`, `clientHeight`, `scrollWidth`, `clientWidth`). Focus is recorded by a `focusin` listener on `document` with the time and `data-widget-id`. Timed clicks are dispatched inside the page (`evaluate`), from the recorder's timestamps, not with `page.click`; every other click (Not now, Save, a tile) is a real pointer click (`page.click`), which also moves focus to the clicked button as a user's click does (an in-page `click()` does not). "Flag reads" = calls of `chrome.storage.local.get` whose keys include `quietTabWeatherPromptDismissed`, counted by an init script with the time of each call and the time of the first `.desktop-grid` insertion.

### AS-FE-01 The first-run modal opens over an empty desk
- Given: (a) fresh install; (b) with links; (c) 140 links (`f0..f139`) plus the defaults, no city, no flag; (d) v2 storage with the four metrics (enabled) and link `f0` but no chrome tiles, no city, no flag, and the ensure write failing (`failStorageInit` on a sync `set` of `quietTabWidget:chrome:settings`); a fresh install cannot be used here, because without a successful ensure it has no metrics and therefore no modal.
- When: a new tab opens.
- Then: `#city-modal` with the title "Show weather on your new tab?" is shown; the desk is veiled; every tile exists in the DOM (a: `weather:hint`, `chrome:settings`, `chrome:add`; b: plus `f0`, `f1`; c: 143 tiles); `#favorites` is `inert`; focus did not move (`body`); the page does not scroll (`scrollHeight === clientHeight`, also in c). (d) the modal opens over the veiled desk (tiles in the DOM: `weather:hint`, `f0`) and `#desktop-status` shows the ensure-failure text ("Couldn't add the weather and settings tiles - Chrome Sync may be full or unavailable. Free up sync space, then reload this tab to try again.") visibly (`checkVisibility` true) while the modal is open. A screenshot shows the modal over the plain page background with no tile, outline or glyph around it.
- Verified by: E2E `dg-56` (group 1); `dg-15` (updated, b).

### AS-FE-02 No tile is ever painted before the modal
- Given: fresh install; an init script with a `MutationObserver` on `document` records, in the callback of the first insertion of any `[data-widget-id]`, whether `#city-modal` exists, `#favorites` has `data-veiled="true"` and its computed `visibility`; a second recorder samples every animation frame until `#city-modal` exists and notes any visible tile.
- When: (a) a new tab opens (5 times, fresh seed each time); (b) the same with the flag read delayed by 200 ms (`delayStorageInit`, under the 250 ms cap) and the viewport resized from 1280×800 to 1000×800 100 ms after navigation, inside that window.
- Then: in every run, at the first tile insertion the modal is already in the DOM and the desk is veiled (`visibility: hidden`); no sampled frame shows a visible tile before the modal; in (b) the first tile insertion also happens with the modal already in the DOM (the resize did not render early). (On `main` the first check fails: the tiles are inserted before the modal.)
- Verified by: E2E `dg-56` (group 2).

### AS-FE-03 Not now reveals the desk with one fade
- Given: AS-FE-01 (a) and (b); a recorder of `animationstart`/`animationend` events on `#favorites` and of its opacity per animation frame, installed before the click.
- When: Not now is clicked.
- Then: the modal is removed; `data-veiled` is gone; `#favorites` has `data-reveal="true"` with computed `animation-name: desk-reveal`, `animation-duration: 0.2s`, `animation-timing-function: ease-out`, and `getAnimations()[0].effect.getKeyframes()` going from opacity 0 to 1; at `animationstart` the opacity is below 1, it never decreases, and it ends at 1; `data-reveal` is removed by `animationend` (between 150 and 400 ms after the click) and is absent within 800 ms. Exactly one `desk-reveal` `animationstart` on `#favorites`. Visible tiles: (a) `weather:hint`, `chrome:settings`, `chrome:add`; (b) plus `f0`, `f1`; exactly one tile shows the plus glyph and it is Add (AS-FU-01). `#favorites` is not `inert`; the flag is written once; focus is on `chrome:settings` (the click focused Not now, decision 5), and Settings is visible (`checkVisibility` true) at the moment focus lands.
- Verified by: E2E `dg-56` (group 3).

### AS-FE-04 Escape and the backdrop reveal the desk
- Given: AS-FE-01 (a). (a) Tab moves focus into the modal (city field), then Escape. (b) The backdrop is clicked through an in-page `click()` 500 ms after the modal was inserted (time from the recorder). (c) The same at 150 ms.
- When: as above.
- Then: (a) and (b): the desk is unveiled and fades in as in AS-FE-03; the flag is written once. (a) focus is on `chrome:settings`, visible at the moment focus lands, with its focus ring as `.chrome-tile:focus-visible` draws it today (`src/newtab.css:204-207`: computed `outline-style` solid, `outline-width` 3px, `outline-offset` 2px, `outline-color` not transparent; measured on the Settings tile after the reveal ends). (b) focus stays on `body`. (c) the click is ignored: the modal stays and the desk stays veiled.
- Verified by: E2E `dg-56` (group 4); `dg-15` (Escape part).

### AS-FE-05 Save reveals the weather tiles; a re-render does not restart the fade
- Given: AS-FE-01 (a); the Open-Meteo endpoints routed to a fixture (city "Tbilisi" resolves, forecast answers after 300 ms).
- When: "Tbilisi" is typed and Save pressed; 80 ms after the reveal starts (the recorder's `animationstart`), the Settings tile is clicked inside the page (`evaluate`, edit mode on, which re-renders the grid).
- Then: while the request runs the modal stays (busy) and the desk stays veiled; on success the modal closes and the desk fades in with the four weather tiles, Settings and Add and no hint tile; focus is on `chrome:settings` (the modal had focus); no flag is written; the city is stored. The click enters edit mode and the fade goes on: one `desk-reveal` `animationstart` on `#favorites` in total (the tiles' `tile-jiggle` starts are not counted), the same `Animation` object (`startTime` unchanged) before and after the click, opacity ends at 1, `data-reveal` removed by `animationend`.
- Verified by: E2E `dg-56` (group 5).

### AS-FE-06 A failed Save keeps the desk veiled
- Given: AS-FE-01 (a); geocoding routed to fail (network error).
- When: Save is pressed with "Tbilisi".
- Then: the modal stays with the existing error text "Can't reach the weather service. Check your connection and try again." (`src/weatherApi.js:11`); the desk stays veiled throughout; then Not now reveals it as in AS-FE-03.
- Verified by: E2E `dg-56` (group 6).

### AS-FE-07 Loads without the first-run modal are unchanged
- Given: (a) a city is set; (b) no city and the flag `true`; (c) no city, all four metrics hidden; (d) no city, the flag read rejects (`failStorageInit` on the flag key); (e) no city, the location read rejects (`failStorageInit` on `quietTabWeatherLocation`); (f) a meta with a version above ours (locked grid, `dg-14` seed); (g) a failed migration (`failStorageInit` on a sync write of the v1 → v2 step, `dg-13` seed: locked grid with the migration message).
- When: a new tab opens.
- Then: no modal; `#favorites` never carries `data-veiled` or `data-reveal` (recorded by an attribute observer from navigation); in (a)–(e) the tiles are visible in the first frame after the first render (no fade on load); (f) and (g) show the existing locked state. Flag reads: (a), (c), (e), (f), (g): 0 in total; (b), (d): exactly 1, before the first render.
- Verified by: E2E `dg-56` (group 7); `test/cityPrompt.test.js` (weather unavailable, every unknown input).

### AS-FE-08 The read before the first paint is capped
- Given: (a) fresh install; (b) a city set; (c) no city, the flag `true`; (d) fresh install with the flag read delayed by 1500 ms (`delayStorageInit`).
- When: a new tab opens.
- Then: flag reads before the first `.desktop-grid` insertion: (a) 1, (b) 0, (c) 1, (d) 1; after it: 0 in all. (d) the first `.desktop-grid` insertion happens between 250 and 600 ms after `DOMContentLoaded`, unveiled, with the hint tile visible and no modal; 2 s later there is still no modal and no `data-veiled` (the late result is ignored); no page error. The time from `DOMContentLoaded` to the first grid insertion is recorded for (a)–(c) in the run record, not asserted.
- Verified by: E2E `dg-56` (group 8); `test/newtabSource.test.js` (order and cap pins).

### AS-FE-09 The change-mode modal never veils
- Given: no city, the flag `true` (no first-run modal); the hint tile visible.
- When: the hint tile is clicked (change mode), then Cancel.
- Then: while the modal is open the tiles stay visible (`checkVisibility` true) and `#favorites` has no `data-veiled`; after Cancel there is no `data-reveal` (no fade) and focus returns to the hint tile.
- Verified by: E2E `dg-56` (group 9).

### AS-FE-10 Reduced motion
- Given: fresh install; `page.emulateMedia({ reducedMotion: "reduce" })` before the modal is closed (as in `dg-22`).
- When: Not now is clicked.
- Then: the desk was veiled while open; after Not now `data-reveal` never appears (attribute observer), `#favorites` has no running animation and its opacity is 1 on the first frame.
- Verified by: E2E `dg-56` (group 10).

### AS-FE-11 Narrow and low windows, resize while veiled
- Given: (a) 320×600 and 500×800, fresh install; (b) fresh install at 1280×800, the viewport resized to 800×600 while the modal is open.
- When: the modal opens, then Not now.
- Then: (a) the desk is veiled while open (no tile visible) and the page does not scroll; after Not now the tiles appear and nothing overflows horizontally (`scrollWidth === clientWidth`). (b) after the resize the desk is still veiled (the re-render keeps the attribute); after Not now the tiles appear at the new width.
- Verified by: E2E `dg-56` (group 11).

### AS-FE-12 Keyboard and accessibility while veiled
- Given: AS-FE-01 (b).
- When: Tab is pressed 8 times, then Shift+Tab 8 times; the accessibility tree is read with `page.locator("body").ariaSnapshot()` (Playwright 1.63 has no `page.accessibility`) while veiled and after Not now.
- Then: focus only ever lands inside `#city-modal` (field, its controls, Not now, Save), never on a tile; while veiled the ARIA snapshot contains none of the names "Settings", "Add link", "Set a city", "Open Site 0"; after Not now it contains them.
- Verified by: E2E `dg-56` (group 12).

## Review focus

- **Scenarios and states:** the veil invariant on every open and close path (decision 2), including Save success and failure, the busy state, a resize and a re-render while veiled or fading; the boot order and the 250 ms cap (no flash, AS-FE-02; loads without the modal, AS-FE-07; a slow flag, AS-FE-08 d); users with many links.
- **Visual and layout:** the modal over the plain background at 1280, 500 and 320 px and 600 px high; no scroll under the veil; the fade (200 ms, ease-out, once, on the whole desk); nothing moves when the desk appears.
- **Accessibility and copy:** tiles out of the accessibility tree and unreachable by Tab while veiled; focus lands on a visible Settings tile after Escape, Not now and Save; reduced motion removes the fade; no new strings.

## Changes after review

Round 1: design review `0-spec` (`.private/design-review/runs/2026-10-06-6ae10c3-spec-r1`, BLOCKED: Important 1, Minor 11 after the skeptic) and pipeline stage 1 (`.private/pipeline/reports/first-run-empty-desk-spec-review.md`, needs revision: Critical 1, Important 9, Minor 9). Reviewer defaults accepted; the owner answered I9 (veil also for users with links).

- **C1** (unbounded flag read, unconditional render): decision 3 (250 ms cap, `try/catch`, the first render in every case), AS-FE-08 (d), Accepted exceptions.
- **I1** (two decision points): decision 3 (one decision point, post-render read and call removed).
- **I2 / L0-05** (veil ownership, fail open): decision 2 (only `showCityModal`/`hideCityModal`, set after insertion, cleared before focus); the separate fail-open decision is gone, a failed open never veils.
- **I3** (`13` AS-20 and M-1): Scope (expected green with the cap, named).
- **I4** (AS-FE-02 green on `main`): AS-FE-02 (`MutationObserver` at the first tile insertion).
- **I5** (easing via `getAnimations`, thresholds): AS-FE-03 (computed style, keyframes, monotonic opacity, 150-400 / 800 ms).
- **I6 / L0-13** (`animationend` filter; re-render during the fade): decision 4, AS-FE-05 (deterministic re-render by entering edit mode).
- **I7 / L0-06** (reduced motion in JS): decision 4, AS-FE-10.
- **I8 / L0-02** (cost wording): decision 3 cost, AS-FE-07/08 counts per case.
- **I9 / L0-03** (users with links; large data): owner answer, AS-FE-01 (b, c), AS-FE-03 (b), AS-FE-12.
- **L0-01** (focus after a Not now click): Current behaviour, decision 5, AS-FE-03 (focus on Settings).
- **M1 / S0-01** (`elementFromPoint`): removed from the veiled check. **M2 / L0-10:** Scope lists every pin. **M3 / L0-04:** decision 1 (`height: 100vh; overflow: hidden`), AS-FE-01, AS-FE-11. **M4:** AS-FE-04 (in-page clicks at measured times). **M5:** tiles named by id. **M6:** AS-FE-04 (a) ring check. **M8:** Scope (architecture wording, design-system line). **L0-07:** AS-FE-07 (e, f), unit test for weather unavailable. **L0-08:** AS-FE-12. **L0-09:** AS-FE-05 (focus after Save). **L0-11:** Non-goals (no link to a file that does not exist yet). **S0-02:** AS-FE-05 (no weather-during-fade claim).
- Rejected by the skeptic, no change: L0-12 (terms now also defined at the top).

Round 2: design review `0-spec` (`.private/design-review/runs/2026-10-06-d9c1fd5-spec-r2`: Important 2, Minor 4 before the skeptic) and pipeline stage 3 (`.private/pipeline/reports/first-run-empty-desk-spec-review-2.md`, needs revision: N1-N2 plus Minor).

- **N1 / L0-05** (bubbling `animationstart`, timed click): Common setup (recorders filtered by target and name, in-page timed clicks, `focusin` recorder, scroll on `document.documentElement`), AS-FE-03, AS-FE-05.
- **N2 / L0-03** (`page.accessibility` absent): AS-FE-12 uses `ariaSnapshot()`.
- **L0-02** (harness waits for a visible `#favorites`): Scope, E2E harness line.
- **N3** (pins `:575`, `:466-473`): Scope. **N4** (veil set right after insertion): decision 2, decision 3 wording. **N5:** line references. **N6:** the plan is rewritten to this spec. **L0-04:** AS-FE-06 quotes the error. **L0-07:** AS-FE-07 (g).
- **S0-01** (order of the ensure status and `startWeather`): decision 3 (e) states today's order.
- L0-06 (rejected by the skeptic; the 300 ms backdrop guard now starts before the first render): no change; the guard protects the modal from a click that was aimed at the page before it appeared, and the page has no tiles to aim at on that load.

Round 3: design review `0-spec` (`.private/design-review/runs/2026-10-06-7a51c00-spec-r3`, BLOCKED: Important 1, Minor 4 after the skeptic) and pipeline stage 3 pass 3 (`.private/pipeline/reports/first-run-empty-desk-spec-review-3.md`, ready for spec gate, Minor N7). The round limit (3) is reached; the one Important was escalated to the owner.

- **L0-14** (the ring check did not match the tile's real ring): AS-FE-04 (a) checks the existing `.chrome-tile:focus-visible` ring (3 px solid, offset 2 px).
- **L0-15** (a resize before the first render): decision 3 (the resize handler skips until the first render).
- **L0-16 / N7** (unveil by mode): decision 2 (clear unconditionally).
- **L0-17** (pin line): Scope `:466-473`.
- **L0-18** (ensure failure while veiled): AS-FE-01 (d).

Round 4 (owner-approved narrow round, Kier 2026-10-06: run `.private/design-review/runs/2026-10-06-83f90d8-spec-r3`, created with `--round 3` because `init-run` caps the number): L0-14..L0-18 fixed. New: **L0-19** (AS-FE-01 d unreachable on a fresh install) → AS-FE-01 (d) uses the setup the reviewer ran on the real extension (v2 metrics and a link, no chrome tiles); **L0-20** (the resize rule untested) → Scope (pin), AS-FE-02 (b). **S0-01** (which click in AS-FE-03) → Common setup (real pointer clicks except timed ones).

