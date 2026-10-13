# Favicon default icon: show the letter, not Chrome's grey globe

## Status

`draft` — revision 1 (2026-10-13). Run №32 (`favicon-globe-fallback`). Found while checking the onboarding starter rows (run 26): the owner saw that many favicons never load, also for the starter sites offered in onboarding.

**Data compatibility: not required** (no storage change).

Related: `src/favoriteIcon.js`, `src/newtab.js` (`createFavoriteIconNode`, `createOnboardingStarterIcon`, `resolveAutoBackgroundColor`), `docs/onboarding-starter-rows.md`, `docs/privacy.md` (favicons only through the Manifest V3 `_favicon` endpoint), `src/favoriteColor.js`.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-13 | Not all favicons load, even for the starter sites offered in onboarding; some do, some do not. "Investigate." | `confirmed` | § Evidence |
| 2026-10-13 | Replace the grey globe with the letter on the coloured tile. Apply everywhere. | `confirmed` (owner) | § Decisions 1, 2 |

## Evidence (measured 2026-10-13, E2E harness Chromium, fresh profile, network on)

`chrome-extension://<id>/_favicon/?pageUrl=<url>&size=32` reads only Chrome's own favicon cache (pages the profile has visited) and never fetches from the network. For a page Chrome has no icon for, it answers **HTTP 200 with a default grey globe** (601 bytes, 32×32, one fixed image) — the same image for all 8 starter sites and for a non-existent host. Because the answer is a success, `<img>`'s `error` event never fires, so the existing letter fallback never runs. After the profile had visited a site, YouTube, GitHub, Spotify and Reddit returned their real icons; ChatGPT and Amazon stayed the globe (cause not established), X failed to load in headless, Gmail redirects to `accounts.google.com` and the icon is stored under that page. Once any page of a host is cached, other paths of that host resolve (GitHub `/explore`).

Consequences today: a new user sees globes for most links (grid tiles and onboarding rows), and the auto accent colour (`resolveAutoBackgroundColor`) is sampled from the globe instead of falling back to the domain colour.

## Default decisions (owner can override)

1. **Default icon detection (pixel comparison).** A module `src/defaultFavicon.js` (pure logic plus one small browser adapter) decides whether a loaded favicon image is Chrome's default icon. It loads ONE sentinel through the same endpoint, `…/_favicon/?pageUrl=https%3A%2F%2Fquiet-tab-no-favicon.invalid%2F&size=32`, once per page load (a shared promise, lazily on the first check), draws it and each candidate on a 32×32 canvas and compares the RGBA bytes for **exact equality**. Equal → the candidate is the default icon. Same extension origin, so canvas reads are allowed (as the existing auto-accent sampling). The sentinel is requested at the same size and in the same page (same colour scheme) as the candidates.
2. **Fail open.** If the sentinel cannot be loaded or drawn, nothing is classified as default (today's behaviour: the globe stays). A candidate that cannot be drawn is not classified.
3. **Where.** Everywhere a `_favicon` image is shown or sampled:
   - grid link tiles (`createFavoriteIconNode`, `iconMode: "favicon"`): default → the existing letter node (`.favorite-letter`, `data-icon-source="letter"`) on the tile's accent colour;
   - onboarding step 2 rows (`createOnboardingStarterIcon`): default → `.onboarding-wizard__starter-icon--letter`;
   - auto accent (`resolveAutoBackgroundColor`): default → `fallbackColorForDomain(item.domain)` instead of the colour sampled from the globe.
   Custom icons (`iconMode: "custom"`) are not touched.
4. **No globe flash.** While the check is pending the image is not painted (`visibility: hidden`, attribute `data-icon-check="pending"`), then it is shown (check passed) or replaced by the letter. The tile's size and layout do not change during the check. If the check never finishes (sentinel never resolves within 2 s) the image is shown as it is (fail open).
5. **Re-evaluated each render.** Nothing is persisted: when Chrome later caches the real icon (the user visits the site), the next render shows it. A tile whose accent was stored from the domain fallback is not recomputed by this change.
6. **Letter and colour.** Reuse the existing letter node and styles unchanged; no new visual rule except the pending state of decision 4.
7. **Unchanged.** Manifest permissions (no new host access, no new permission), `docs/privacy.md` (still only `_favicon`), storage, the starter table, Finish, icon mode control, custom icons.

## Scope

- `src/defaultFavicon.js` (new, pure comparison + adapter), `src/newtab.js` (three call sites), `src/newtab.css` and `src/surfaces.css` (pending state only).
- Tests: `test/defaultFavicon.test.js` (pure comparison on synthetic RGBA), `test/newtabSource.test.js` (pins of the three call sites).
- E2E: a new `dg-74-favicon-default-fallback.mjs`; sweep of the scenarios that look at tile icons.
- `docs/architecture.md` (icon paragraph), `docs/privacy.md` (one line: the default-icon check is local), `CHANGELOG.md` `[Unreleased]`.

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
- Given: Add link `https://example.com/` with Auto colour, no history.
- When: the link is saved.
- Then: the stored `backgroundColor` equals `fallbackColorForDomain("example.com")`; with a real (coloured) icon routed the stored colour is the sampled one.
- Verified by: E2E `dg-74`; unit test of the decision in `test/defaultFavicon.test.js`.

### AS-FDF-05 No flash of the globe
- Given: no history; a recorder samples every animation frame of the tile icon from first paint.
- When: the new tab opens.
- Then: no frame shows a visible `img.favorite-icon` whose source is the default icon (`visibility: hidden` or already replaced).
- Verified by: E2E `dg-74`.

### AS-FDF-06 Fail open
- Given: the sentinel request is aborted by the harness route.
- When: the new tab opens with the tiles of AS-FDF-01.
- Then: tiles show the `img` (today's behaviour) after at most 2 s; no page error.
- Verified by: E2E `dg-74`.

### AS-FDF-07 Custom icons and letter mode untouched
- Given: a link with `iconMode: "custom"` (routed image) and a link with a letter-only model.
- When: the new tab opens.
- Then: the custom image is shown; no sentinel-based decision touches it (the sentinel is requested once, only for favicon-mode images).
- Verified by: E2E `dg-74`; `newtabSource` pin.

### AS-FDF-08 Sentinel cost and resize
- Given: 40 favicon links.
- When: the new tab opens, then the window is resized.
- Then: the sentinel is requested exactly once per page load (counted at the route); a resize does not re-request it.
- Verified by: E2E `dg-74`.

### AS-FDF-09 Pure comparison
- Given: RGBA arrays of equal and unequal 32×32 images, an empty array, a different length.
- When: `isDefaultFaviconPixels(candidate, sentinel)` runs.
- Then: `true` only for byte-equal arrays of equal non-zero length; `false` otherwise; a missing sentinel → `false`.
- Verified by: unit `test/defaultFavicon.test.js`.

## Review focus

- No flash of the globe and no layout shift from the pending state (AS-FDF-05).
- Fail open when anything about the check goes wrong (AS-FDF-06); never a missing icon without a letter.
- The auto-accent path and the two icon paths use the same decision (AS-FDF-04).
- Cost with 200 links: one sentinel, comparisons only after each image `load`.

## Accepted exceptions

- Exact pixel equality can in theory misclassify a real icon that is byte-identical to the globe; accepted (the globe is Chrome's own artwork).
- A tile whose accent was stored before this change keeps its stored colour.

## Non-goals

- Fetching favicons from the network, bundling brand icons, or any new permission.
- Explaining why ChatGPT and Amazon stay the globe after a visit in headless Chromium.
- Changing letter styles, accent colours or the Icon control.

## Process

Full UI pipeline (`quiet-tab-pipeline`); design checkpoint on the grid and onboarding rows with and without history.
