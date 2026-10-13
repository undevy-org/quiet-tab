# Favicon default icon: show the letter, not Chrome's grey globe

## Status

`implemented` — run №32 (`favicon-globe-fallback`); revision 3 (2026-10-13) aligns the text with the implementation and the live probe (`.private/pipeline/reports/favicon-globe-fallback-probe.md`). Found while checking the onboarding starter rows (run 26): the owner saw that many favicons never load, also for the starter sites offered in onboarding.

**Data compatibility: not required** (no storage change).

Related: `src/defaultFavicon.js`, `src/favoriteIcon.js`, `src/newtab.js` (`createFavoriteIconNode`, `createOnboardingStarterIcon`, `resolveAutoBackgroundColor`), `docs/onboarding-starter-rows.md`, `docs/privacy.md` (favicons only through the Manifest V3 `_favicon` endpoint), `src/favoriteColor.js`.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-13 | Not all favicons load, even for the starter sites offered in onboarding; some do, some do not. "Investigate." | `confirmed` | § Evidence |
| 2026-10-13 | Replace the grey globe with the letter on the coloured tile. Apply everywhere. | `confirmed` (owner) | § Default decisions 3, 4 |

## Evidence (measured 2026-10-13, E2E harness Chromium, fresh profile, network on)

`chrome-extension://<id>/_favicon/?pageUrl=<url>&size=32` reads only Chrome's own favicon cache (pages the profile has visited) and never fetches from the network. For a page Chrome has no icon for, it answers **HTTP 200 with a default grey globe** (601 bytes, 32×32, one fixed image) — the same image for all 8 starter sites and for a non-existent host. Because the answer is a success, `<img>`'s `error` event never fires, so the existing letter fallback never runs. After the profile had visited a site, YouTube, GitHub, Spotify and Reddit returned their real icons; ChatGPT and Amazon stayed the globe (cause not established), X failed to load in headless, Gmail redirects to `accounts.google.com` and the icon is stored under that page. Once any page of a host is cached, other paths of that host resolve (GitHub `/explore`).

Probe facts (same harness; report `.private/pipeline/reports/favicon-globe-fallback-probe.md`): the globe is one fixed image (SHA-256 identical for the 8 starters, a non-existent host and the sentinel), identical in the light and dark colour scheme and at device pixel ratio 1 and 2 (`size=32` always returns 32×32), so the sentinel comparison holds in all of them. The canvas read of the tile `<img>` without `crossOrigin` is allowed. `pickDominantColorFromPixels` treats the grey globe as an uninformative neutral and returns `null`, so the previous `resolveAutoBackgroundColor` already falls back to `fallbackColorForDomain` for the real globe.

Consequences before this change: a new user sees globes for most links (grid tiles and onboarding rows). The auto accent for the real (neutral) globe already comes out as the domain colour; the shared default check matters for a default icon that is not neutral, for a timing difference (a late or hung sentinel), and for one decision on all three paths.

## Default decisions (owner can override)

1. **Default icon detection (pixel comparison).** A module `src/defaultFavicon.js` (pure logic plus one small browser adapter) decides whether a loaded favicon image is Chrome's default icon. It loads ONE sentinel through the same endpoint, built with `getFaviconUrl({ baseUrl, pageUrl: "https://quiet-tab-no-favicon.invalid/", size: FAVICON_SIZE })` (the onboarding rows use the same helper and the shared constant instead of their hand-written URL), once per page load (a shared promise, requested lazily on the FIRST `check()` call, which is the first candidate `load` or the accent code; zero favicon candidates → zero sentinel requests). The sentinel and each candidate are drawn on one reused canvas with `willReadFrequently: true` and compared as RGBA bytes for **exact equality**; the image sizes (`naturalWidth` × `naturalHeight`) are compared first and unequal sizes are never default. The sentinel's bytes are read once and kept as a `Uint8ClampedArray`. The candidate is read from the `<img>` already in the DOM after its `load` (no second request), or, for the auto accent, from the image the accent code already loads (decision 3). Same extension origin, so canvas reads are allowed (as the existing auto-accent sampling); confirmed by the live probe (§ Evidence) for the tile `<img>` (no `crossOrigin`) and for responses served with `context.route(... fulfill ...)`. The sentinel is requested at the same size and in the same page (same colour scheme) as the candidates. For the auto accent the sentinel and the candidate are compared at their natural size (natural sizes first, then bytes), not on a 32×32 redraw.
2. **Fail open.** If the sentinel cannot be loaded or drawn, nothing is classified as default (today's behaviour: the globe stays). A candidate that cannot be drawn (a thrown canvas read) is not classified: its pending state is lifted and the image is shown. **One timeout, 2 s (`DEFAULT_FAVICON_TIMEOUT_MS`), starts at the first `check()` call, which is when the sentinel is requested.** If the sentinel has not resolved by then it is treated as failed for the whole page load: every waiting image is shown as it is and a late sentinel answer is ignored (no retroactive replacement). After that fail open no later tile (drop, edit toggle, resize) gets `pending`: it is built as a plain image and costs no new wait. A candidate whose `load` arrives before the sentinel waits for it no longer than that same timeout. A candidate that never loads keeps today's behaviour (no icon until `load`/`error`); `error` always replaces the node with the letter, also from the pending state.
3. **Where.** Everywhere a `_favicon` image is shown or sampled:
   - grid link tiles (`createFavoriteIconNode`, `iconMode: "favicon"`): default → the existing letter node (`.favorite-letter`, `data-icon-source="letter"`) on the tile's accent colour;
   - onboarding step 2 rows (`createOnboardingStarterIcon`): default → `.onboarding-wizard__starter-icon--letter`;
   - auto accent (`resolveAutoBackgroundColor`): the accent code loads the image once, asks the checker (`classifyImage`, same verdict cache and same size rule: natural sizes first, then bytes at natural size) and reuses that image for sampling (no second load); default → `fallbackColorForDomain(item.domain)` instead of the colour sampled from the default icon. The accent waits for the sentinel no longer than the same 2 s timeout; on fail open the colour is sampled as today.
   Custom icons (`iconMode: "custom"`) are not touched.
4. **No globe flash, no layout shift.** While the check is pending the image is not painted (`visibility: hidden` through `[data-icon-check="pending"]`, set BEFORE the node is inserted into the DOM), then it is shown (check passed, attribute `data-icon-check="done"`) or replaced by the letter. `data-icon-check` is `pending` while waiting and `done` after a `real`, an unclassified or a failed-candidate decision; a node built from a known `real` verdict or after the checker failed (fail open, decision 2) carries no `data-icon-check` (absent is a final state). The tile's size and layout do not change during the check. A decision that arrives for a node that is no longer connected (`isConnected` false) does nothing.
5. **Verdict cache, re-evaluated per page load.** Verdicts live in memory for the life of the page only: `Map<faviconUrl, "default" | "real">`. A re-render (edit mode on/off, drop, resize across a column boundary, `refreshAutoAccent`) builds a tile with a known verdict at once: `real` → the image without a pending state, `default` → the letter directly; only a URL without a verdict starts as pending. Nothing is persisted. When Chrome later caches the real icon (the user visits the site) the tile shows it after a reload of the tab, not before.
6. **Letter and colour.** Reuse the existing letter node and styles unchanged; no new visual rule except the pending state of decision 4 (one rule in `src/newtab.css`).
7. **Unchanged.** Manifest permissions (no new host access, no new permission), `docs/privacy.md` (keeps its claim: still only `_favicon`; one clarifying line is added), storage, the starter table, Finish, icon mode control, custom icons. **No new user-facing strings** (no new text, label or accessible name); the letter tile keeps its existing name (`Open <label>` / `Edit <label>`).

## Scope

- `src/defaultFavicon.js` (new, pure comparison + adapter + verdict cache), `src/newtab.js` (three call sites; uses the existing `getFaviconUrl` and `FAVICON_SIZE` of `src/favoriteIcon.js`), `src/newtab.css` (pending state only).
- Tests: `test/defaultFavicon.test.js` (pure comparison and verdict cache on synthetic RGBA), `test/newtabSource.test.js` (pins of the three call sites).
- E2E: a new `dg-74-favicon-default-fallback.mjs`; sweep of the scenarios that look at tile icons, named: `dg-61` (selector `.favorite-icon, .favorite-letter`), `dg-64` (same selector, blocked route), `dg-65`, `dg-70` (blocked route), `dg-73` (AS-OSR-09 expects an `IMG` in the first row). Rule: a scenario that needs a real icon routes `/_favicon/` for that page to a synthetic PNG; a scenario that only needs "an icon node" accepts `img` or letter.
- `docs/architecture.md` (a row for `src/defaultFavicon.js` in the module table and one sentence next to the icon description), `docs/privacy.md` (one line: the default-icon check is local), `CHANGELOG.md` `[Unreleased]`, and the "Other modules" line of the agent `CLAUDE.md` (in the notes repo, `agent-config/`).

## Acceptance scenarios

Common setup: the E2E harness profile has no browsing history, so every `_favicon` answer is the default globe (the measured baseline). Tests that need a "real icon" route `/_favicon/` to a synthetic PNG with `context.route`.

### AS-FDF-01 Default icon becomes the letter on a grid tile
- Given: a favicon-mode link `github.com` in the grid, harness profile with no history.
- When: the new tab opens.
- Then: the tile shows `.favorite-letter` (`G`) with `data-icon-source="letter"`; no `img.favorite-icon` remains; the tile rect is unchanged between first paint and the final state.
- Verified by: E2E `dg-74`; `newtabSource` pin.

### AS-FDF-02 A real favicon is kept
- Given: `/_favicon/` for `github.com` routed to a synthetic 32×32 PNG that differs from the globe; the sentinel URL answers the real globe.
- When: the new tab opens.
- Then: the tile keeps `img.favorite-icon` with `data-icon-source="favicon"` and its image is visible (not `visibility: hidden`).
- Verified by: E2E `dg-74`.

### AS-FDF-03 Onboarding rows
- Given: wizard step 2, no history.
- When: step 2 is shown.
- Then: all 8 rows show `.onboarding-wizard__starter-icon--letter` (22×22) and no row shows the globe; with `/_favicon/` routed to a real PNG for `youtube.com` only, that row keeps the `img` and the other seven show letters.
- Verified by: E2E `dg-74` (extends the AS-OSR-09 route of `dg-73`).

### AS-FDF-04 Auto accent does not sample the globe
- Given: Add link `https://example.com/` with Auto colour, no history, in three groups:
  (a) the default case: a synthetic non-neutral default (one saturated PNG `#e11d48` served for both the sentinel page and `example.com`), because the real grey globe samples to `null` and gives the domain colour even without this change;
  (b) the real-icon case: `/_favicon/` routed for that page to a solid saturated PNG different from the sentinel;
  (c) the sentinel held open.
- When: the link is saved.
- Then: with the default icon the stored `backgroundColor` equals `fallbackColorForDomain("example.com")` (not the sampled red); with the routed solid icon the stored colour is exactly the sampled one; with the sentinel held open the accent is sampled as today and settles within 2 s plus a named settle window.
- Verified by: E2E `dg-74` (group 04a/b/c); unit test of the decision in `test/defaultFavicon.test.js`.

### AS-FDF-05 No flash of the globe
- Given: no history; a recorder installed with `context.addInitScript` samples every `requestAnimationFrame` from the start of the document and records, per frame, whether a grid or onboarding-row `img` icon has computed `visibility` other than `hidden` and a non-zero size.
- When: the new tab opens.
- Then: zero such frames. Against a vacuous pass: the harness holds the sentinel answer on a gate and releases it as soon as the recorder has seen a pending frame (within `PENDING_WAIT_MS`, 1200 ms, well before the 2 s timeout), and the recording must contain at least one frame with `[data-icon-check="pending"]` and at least one frame with `.favorite-letter`. The same check for the onboarding rows (step 2).
- Verified by: E2E `dg-74`.

### AS-FDF-06 Fail open
- Given: the sentinel request is aborted by the harness route.
- When: the new tab opens with the tiles of AS-FDF-01.
- Then: tiles show the `img` (today's behaviour) at once after the abort (no `pending` left; `data-icon-check` is `done` or absent); no page error.
- Verified by: E2E `dg-74`.

### AS-FDF-06a Sentinel never answers (hang)
- Given: the sentinel route never answers (held open), the tiles of AS-FDF-01.
- When: the new tab opens.
- Then: no `pending` remains after `DEFAULT_FAVICON_TIMEOUT_MS` (2 s) plus the guard `HANG_GUARD_MS` (2500 ms); the tiles show the `img` (computed `visibility` not `hidden`, non-zero rect); no page error. The page does not wait for the held request. A tile built after the timeout (edit-mode toggle) never has `pending` in any frame.
- Verified by: E2E `dg-74`.

### AS-FDF-06b Sentinel answers late but successfully
- Given: the sentinel route answers with the real globe after about 3 s (longer than the 2 s timeout), the tiles of AS-FDF-01.
- When: the new tab opens and 4 s pass.
- Then: at 2 s the tiles show the `img` (fail open); after the late answer nothing changes: no `.favorite-letter` appears, no node is replaced, no page error.
- Verified by: E2E `dg-74`.

### AS-FDF-07 Custom icons and letter mode untouched
- Given: (a) the grid holds only a `custom` link (routed image) and a letter-only link; (b) the same plus one favicon-mode link.
- When: the new tab opens.
- Then: the custom image is shown and no sentinel-based decision touches it; in (a) the sentinel is requested 0 times, in (b) exactly once.
- Verified by: E2E `dg-74`; `newtabSource` pin.

### AS-FDF-08 Sentinel cost and resize
- Given: 200 favicon links (the cap) in the grid; requests are counted at the route by `pageUrl` containing `quiet-tab-no-favicon.invalid`.
- When: the new tab opens, then the window is resized across a column boundary (1280 → 700 px) so the tiles are rebuilt (the scenario proves it with a marker on a tile node that is gone afterwards).
- Then: exactly one sentinel request after opening and still one after the resize; no `pending` tile after the resize (verdict cache); the same holds for the onboarding step 2 plus the grid on one page: after Finish (the wizard writes the starters, so the grid has favicon tiles) the 8 rows and the grid have caused exactly one request.
- Verified by: E2E `dg-74`.

### AS-FDF-09 Pure comparison
- Given: RGBA arrays of equal and unequal 32×32 images, an empty array, a different length.
- When: `isDefaultFaviconPixels(candidate, sentinel)` runs.
- Then: `true` only for byte-equal arrays of equal non-zero length; `false` otherwise; a missing sentinel → `false`. The verdict cache returns the stored verdict for a URL and nothing for an unknown URL.
- Verified by: unit `test/defaultFavicon.test.js`.

### AS-FDF-10 Re-render does not blink
- Given: a favicon link with a real icon (routed PNG) and one with the default icon, the frame recorder of AS-FDF-05.
- When: edit mode is turned on and off, a tile is dropped on a free cell, and the window is resized across a column boundary.
- Then: after the first render no frame shows `[data-icon-check="pending"]` on a tile whose verdict is known; the real icon is visible in every frame (computed `visibility` not `hidden` and a non-zero rect) and the default one is already the letter.
- Verified by: E2E `dg-74`.

### AS-FDF-11 Sizes, narrow window, keyboard
- Given: default-icon links of sizes 1×1, 1×2, 2×1 and 2×2, windows of 1280, 500 and 320 px, reduced motion on.
- When: the new tab opens with the sentinel held back by a gate; in edit mode a tile is focused with Tab, then the gate is released so its icon is replaced while focused.
- Then: the letter has the size the tile size gives it today (the `.favorite-letter` rules by `data-w`/`data-h`), nothing overflows the tile; keyboard focus on the tile stays (the tile is the focused element, not the icon); no motion is added by the replacement.
- Verified by: E2E `dg-74`.

## Review focus

- No flash of the globe and no layout shift from the pending state (AS-FDF-05).
- Fail open when anything about the check goes wrong (AS-FDF-06); never a missing icon without a letter.
- The auto-accent path and the two icon paths use the same decision (AS-FDF-04).
- Cost with 200 links: one sentinel, comparisons only after each image `load`.
- A re-render must not blink a known icon (AS-FDF-10); a late or hung sentinel must not change tiles afterwards (AS-FDF-06a/06b).

## Accepted exceptions

- Exact pixel equality can in theory misclassify a real icon that is byte-identical to the globe; accepted (the globe is Chrome's own artwork).
- A tile whose accent was stored before this change keeps its stored colour.
- A change of the OS colour scheme or of the page zoom (device pixel ratio) after the sentinel was read can leave a globe that no longer equals the sentinel; the tile then keeps the globe (fail open) until the tab is reloaded. The probe found the globe identical in light and dark and at device pixel ratio 1 and 2, so this is a guard for an unmeasured case.

## Non-goals

- Fetching favicons from the network, bundling brand icons, or any new permission.
- Explaining why ChatGPT and Amazon stay the globe after a visit in headless Chromium.
- Changing letter styles, accent colours or the Icon control.

## Process

Full UI pipeline (`quiet-tab-pipeline`); design checkpoint on the grid and onboarding rows with and without history.
