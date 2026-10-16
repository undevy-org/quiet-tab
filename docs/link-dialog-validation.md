# Link dialog: URL validation, length limits, field errors and a visible new tile

## Status

`implemented` — revision 5 (2026-10-16: implementation finding: AS-LDV-12 at 1280×300, see § Accepted exceptions); revision 4 (2026-10-16: spec review 1–3 and spec-gate rounds 1–2 applied: forced-colors outline, edit-mode rule, ring specificity, Add in edit mode; last-of-difference id, label fallback and 8 KB budget, ring as an outer box-shadow layer with its phase kept across re-renders, hidden icon row, AS fixes). Run №43 (`link-dialog-validation`), cluster "Диалог ссылки: проверка и ошибки" of the roadmap (R43). Backlog 31, 32, 33 and 34 were reproduced on `origin/main` (`75f1b11`) and are all fixed here.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). Links already stored with a space, a long URL or a long name are not re-checked on read.

Related: `docs/tile-size-followups.md` (the Add / Edit link dialog), `docs/centered-grid.md` (placement of a new tile), `docs/stale-tab-closeout.md` (`LinkGoneError`), `src/widgetsService.js` (`normalizeFavoriteUrl`, `normalizeNullableImageUrl`, `normalizeLabel`, `addFavorite`, `updateFavorite`), `src/newtab.js` (`createFavoriteForm`, `buildDialogContent`, `showDialogError`, `invalidFieldFor`, `runDesktopMutation`, `closeDesktopDialog`, the Add menu).

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-15 | Backlog 31: a new link below the first screen is not shown, only the live "Link added". Owner: smooth scroll to the new tile and a short highlight, only if it is off screen; without animation under reduced motion. | `confirmed` (owner, roadmap R43) | decision 4 |
| 2026-10-16 | Backlog 32: a URL of ~8 KB fails with the Chrome Sync "full" text. Owner: limit the link to 2000 characters, the name to 100, with a plain error. | `confirmed` (owner, 2026-10-16) | decision 2 |
| 2026-10-16 | Backlog 33: `not a url !!` is saved as a link. Owner: reject (spaces and junk in the address); hosts without a dot stay allowed. | `confirmed` (owner, 2026-10-16) | decision 1 |
| 2026-10-16 | Backlog 34: the field error is not tied to the field. Owner: for assistive technology only, nothing visible changes. | `confirmed` (owner, 2026-10-16) | decision 3 |

## Triage (live Chromium, `75f1b11`, throw-away profile; probe `scratch/run-43-triage/probe.mjs` in quiet-tab-notes)

All four reproduce.

- **33.** Add link, field `not a url !!`, Add: the dialog closes and the stored link is `https://not%20a%20url%20!!/` (the Chrome `URL` parser accepts the string; `normalizeFavoriteUrl` only checks the protocol).
- **32.** Add link with `https://example.com/` + 9000 `a`: the dialog stays open, the alert reads "Couldn't save this change to Chrome Sync — it may be full, offline, or temporarily unavailable. Try removing a few favorites or try again shortly." (the write exceeds the 8 KB per-key quota); the focus is on the Add button, not on the field. The field has no `maxlength`.
- **34.** After `ftp://x`: the alert reads "Only http and https URLs are supported" and the focus is on the Link field, but `aria-invalid` and `aria-describedby` are absent on the input and the alert has no id. The Add tile has `aria-haspopup="menu"` and `aria-expanded` while the Add menu is open, but no `aria-controls`.
- **31.** 1280×800, 190 links laid out so that every cell of the first screen (4 rows × 14) is taken: Add `https://newlink.example.org/`: the new tile is at `top` 1136, `scrollY` stays 0, the only feedback is the live region "Link added". With a free cell on the first screen the tile is placed there (`top` 16) and nothing is needed.

## Decisions

1. **A link must look like a web address (backlog 33).** `normalizeFavoriteUrl` (used by Add, Edit and the wizard starters) throws "Enter a valid URL" when, after the protocol is added and `new URL` parsed:
   - the trimmed input contains any whitespace (`/\s/`); or
   - the parsed `hostname` matches neither `/^\[[0-9a-f:.]+\]$/i` (an IPv6 literal, which `new URL` keeps in brackets) nor `/^[a-z0-9._-]+$/i` (an international host name is already punycode after parsing, so `пример.рф` passes).

   Everything the service accepted before and that is a real address keeps working: `example.com`, `localhost`, `localhost:3000/a`, `intranet/wiki` (no dot), `192.168.0.1`, `[::1]:8080`, `http://my_host.local`, `example.com/a%20b`, `example.com/path?q=a+b`. A space inside the path or the query (`example.com/a b`) is rejected too (the owner chose "reject", not "encode"): the person writes `%20`. Order of checks in `addFavorite`: the 200-links limit (as today), empty ("Enter a URL"), length (decision 2), whitespace and parse ("Enter a valid URL"), protocol ("Only http and https URLs are supported"), host. `addFavorites` (wizard starters) re-normalizes every stored link only to build its de-duplication key (`widgetsService.js:255`): that key uses a lenient `new URL(item.url).href` without the new checks, so an old stored link can never make a wizard write fail.
2. **Length limits with a plain message (backlog 32).** New constants in `favoritesShared.js`: `LINK_URL_MAX_LENGTH = 2000` and `LINK_LABEL_MAX_LENGTH = 100`; length is `String.length` of the trimmed value (UTF-16 units). The service rejects (the typed text first, which needs no parsing; the normalized `href` right after the parse):
   - a link whose trimmed text is longer than 2000, or whose normalized `href` is longer than 2000 (a path of non-ASCII letters is percent-encoded and grows): "That link is too long (up to 2000 characters)", field `url`;
   - a name longer than 100: "That name is too long (up to 100 characters)", field `label`;
   - a custom icon link longer than 2000 (text or normalized `href`): "That icon link is too long (up to 2000 characters)", field `customIconUrl`. It is the same class of input as the link, in the same dialog, and without a limit it hits the same 8 KB quota.

   Order of the other field checks: Link (all of decision 1 and the link length), then Name length, then Custom icon length, then the existing colour and icon-mode checks; the first failing one is shown. The Custom icon row is hidden unless the icon mode is Custom (`controls.css:54`) but its value is always submitted and stored, so the length check always runs; when it fails and the row is hidden, `showDialogError` checks the Custom radio (which shows the row) and then focuses the field.

   No `maxlength` attribute is set on the inputs: `maxlength` cuts a pasted text silently, so a wrong, shortened address could be saved; the error keeps the text and the person sees what to shorten. The stored item also holds `domain` (the host, at most 2000 characters because it is part of the checked link) and, when the Name is empty, a `label` equal to that domain: the fallback label is cut to 100 characters (`domain.slice(0, 100)`, in Add and in Edit with an empty Name, `widgetsService.js:98` and `:359`), and the 100-character limit applies to a name the person typed, so the Edit dialog (which shows the stored `label` in the Name field) never raises "name too long" for an untouched form. Budget of one stored link: 2000 (url) + 2000 (domain) + 2000 (custom icon) + 100 × up to 6 bytes (label, worst case with escapes) + about 500 bytes of fixed fields = about 7100 bytes, under the 8192-byte per-key quota; the existing Sync text remains for real quota, offline and write failures. Limits are checked on Add and on Edit; existing longer values are not touched by reading.
3. **The field error is tied to the field (backlog 34).** Validation errors thrown by the service carry a `field` property (`url`, `label`, `customIconUrl`, `backgroundColor`; set in `normalizeFavoriteUrl`, `normalizeNullableImageUrl`, the label check and the colour normalizer). `runDesktopMutation` passes `error.field` to `showDialogError(root, message, field)`, which focuses that input (the message regexes of `invalidFieldFor` stay as a fallback for errors without `field`; everything else focuses the submit button as today). While an error about a field is shown that input has `aria-invalid="true"` and `aria-describedby` pointing at the error slot, which gets a stable `id` (one per dialog). Both are removed in `runDesktopMutation` next to the clearing of the slot when the next submit starts, and with the dialog. An error that is not about a field (Sync write failure, the 200-links limit, a stale tab) sets neither attribute. The `role="alert"` of the slot, the visible text, the layout and colours do not change (owner: nothing visible). The Add tile gets `aria-controls="add-menu"` (the menu's existing id) while the menu is open and loses it when the menu closes; set both where `aria-expanded` is set: `createChromeTile` (the tile is rebuilt on every render) and `syncAddTileExpanded`.
4. **A new tile that is off screen is brought into view (backlog 31, owner).** After a successful Add link (the dialog's own submit, not edit, not the wizard, not the restore of a weather tile), once `closeDesktopDialog()` has run and the desk is rendered, if the new link's tile is not safely inside the window (its `getBoundingClientRect()` has `top < 6` or `bottom > clientHeight - 6`; 6 px is the `scroll-margin` of the tiles, so a tile 1–5 px from an edge counts as off screen and its ring would be cut; the jiggle transform of edit mode is part of the rect, accepted):
   - the page scrolls so the tile is centred as far as the page allows (`scrollIntoView({ block: "center", behavior: "smooth" })`; a tile in the last row stops at the page bottom, whose padding is `--grid-pad`, 8–16 px); with `prefers-reduced-motion: reduce` the behaviour is `auto` (instant). The scroll is requested after `closeDesktopDialog()` because that call focuses the Add tile (without `preventScroll`) and would otherwise pull a scrolled page back;
   - the tile gets `data-just-added="true"` for `ADDED_HIGHLIGHT_MS = 2000` ms: a 3 px ring just outside the tile box, colour `--focus-ring`, drawn as one extra `box-shadow` layer (`0 0 0 3px var(--focus-ring)`) appended to the tile's resting shadow (`.favorite-tile` already has `overflow: hidden`, `newtab.css:265`, which clips any pseudo-element or child that sticks out, so a pseudo-element ring is not used; `outline` is not used either, the tiles already use it for `:focus-visible` and the reduced-motion edit-mode dashes). The rule `.desktop-grid > [data-just-added]` runs `tile-added` (2000 ms, linear, `forwards`) whose keyframes keep the ring at full strength until 60 % and fade its colour to `transparent` at 100 %, each keyframe listing the resting shadow layers first and the ring layer last so the lists interpolate; the delay is a custom property `--added-delay` (negative milliseconds) set inline on the tile and applied to this animation only (`animation-delay` is a comma list aligned with `animation-name`, so in edit mode, where `tile-jiggle` runs on the same tile with its own `animation-delay`, both keep their timing). Under reduced motion `animation: none` and the ring layer is static at full strength for the same 2 s, then removed; under `forced-colors: active` the UA drops `box-shadow`, so the ring is instead `outline: 3px solid Highlight; outline-offset: 0` on `[data-just-added]` for the same 2 s (static; `outline` is not clipped by the tile's own `overflow`). The static reduced-motion rule re-lists the tile's resting shadow layers plus the ring layer and has specificity not lower than `.favorite-tile:hover:not(:disabled)` (`newtab.css:341`), so hover and `:focus-visible` shadows never erase it. In edit mode a separate rule `.desktop[data-edit="true"] .desktop-grid > [data-just-added]`, placed after and not weaker than the jiggle rule (`newtab.css:100`), sets `animation: tile-jiggle 0.28s ease-in-out infinite, tile-added 2000ms linear forwards; animation-delay: 0s, var(--added-delay)` and its `:nth-child(2n)` variant `-0.14s, var(--added-delay)` (otherwise the jiggle shorthand would replace the list and `tile-added` would not run); the reduced-motion edit-mode block (`animation: none`, dashed outline) shows the static ring layer. The ring does not change the tile's size or position and does not replace the edit-mode jiggle or dashed outline;
   - if the tile is safely inside the window nothing happens (no scroll, no ring); the live region "Link added" is unchanged.

   The new link is the **last** favorite of the set difference between the stored result and the state before (a new item is always appended; if another tab added a link in between, the earlier one is not ours). The highlight lives in module state `{ id, startedAt }`: every render that creates that tile sets the attribute and `--added-delay` of `-(now - startedAt)` ms so a re-render (the auto-accent refresh re-renders the desk, `refreshAutoAccent`) continues the fade instead of restarting it; the attribute is removed on `animationend` (only when `event.animationName === "tile-added"`, not the jiggle) with a timer at `ADDED_HIGHLIGHT_MS` as the fallback (reduced motion: the timer only). The state is cleared by the same timer and a render applies the attribute only while `now - startedAt < ADDED_HIGHLIGHT_MS`, so a late render never brings a static ring back. The scroll is requested once. If the id is missing from the final state nothing is scrolled. Focus returns to the Add tile (unchanged); the scroll does not move focus.

## Scope

- `src/widgetsService.js` (decisions 1–3 validation and `field`), `src/favoritesShared.js` (constants), `src/newtab.js` (`showDialogError` / `invalidFieldFor` / `runDesktopMutation` field attributes, the Add menu `aria-controls`, the new-tile scroll and highlight in the add-link submit handler), `src/newtab.css` (the ring and its keyframes, reduced motion, forced colours), `CHANGELOG.md` `[Unreleased]`, `agent-config/CLAUDE.md` (one sentence: link limits and `field` errors).
- Tests: `test/widgetsService.test.js` (every rule of decisions 1 and 2, each accepted and rejected input above, the order of checks, `error.field`), `test/newtabSource.test.js` (pins: the constants are exported and used by the service, `aria-invalid` / `aria-describedby` / `aria-controls` handling, the ring only behind `data-just-added`, `ADDED_HIGHLIGHT_MS`, `prefersReducedMotion` picks `auto`), mutation-proven after the implementation commit. A new E2E `dg-83-link-dialog-validation.mjs`.
- Earlier scenarios that assert the old messages are updated if they turn red, never weakened (`dg-04` AS-25 with `ftp://x` and the Sync text stay valid; Task 3 greps all scenarios and unit tests for the messages and for spaced addresses).

## Acceptance scenarios

Common setup: the E2E harness with the first-run wizard off; default tiles; "190 links" is the seed of the triage probe (links in every free cell of rows 0–3 at 14 columns, then rows below), so the first screen has no free cell; sizes 1280×800, 500×800, 320×600 unless stated.

### AS-LDV-01 A spaced or junk address is rejected (Add)
- Given: the Add link dialog.
- When: Add is pressed with `not a url !!`, `a b.com`, `https://exa mple.com`, `example.com/a b`, `http://bad!host.com`.
- Then: the dialog stays open, the alert reads "Enter a valid URL", the focus is on the Link field, nothing is written (`chrome.storage.sync` unchanged), the desk has the same tiles.
- Verified by: E2E `dg-83`; unit tests.

### AS-LDV-02 Real addresses still pass
- Given: the Add link dialog.
- When: Add with `example.com`, `localhost`, `localhost:3000/a`, `intranet/wiki`, `192.168.0.1`, `[::1]:8080`, `http://my_host.local`, `example.com/a%20b`, `пример.рф`, saved one after another.
- Then: each is saved with the stored `url` equal to the normalized `href` of the input (`new URL` of the input, https-prefixed when it has no scheme); none shows an error.
- Verified by: E2E `dg-83` (three of them in the browser: `localhost`, `[::1]:8080`, `пример.рф`); unit tests for all.

### AS-LDV-03 The same rules in Edit
- Given: an existing link, its Edit dialog (edit mode, tap the tile).
- When: the Link field is changed to `not a url !!`, then Save; then to `example.org/ok`, then Save.
- Then: the first Save shows "Enter a valid URL", focus on Link, nothing written; the second saves and closes. The length rules apply in Edit too: a 2001-character link and a 101-character Name show their messages and write nothing; 2000 and 100 save.
- Verified by: E2E `dg-83`; unit tests.

### AS-LDV-04 A too long link
- Given: the Add link dialog.
- When: Add with `https://example.com/` plus text so the whole is 2001 characters; with 9000 characters; with 2000 characters exactly; with a path of 700 Cyrillic letters (700 typed characters, about 4200 after percent-encoding, so over 2000 once normalized).
- Then: 2001, 9000 and the Cyrillic case show "That link is too long (up to 2000 characters)", the typed text stays in the field, the focus is on Link, nothing is written, the Chrome Sync text is never shown. The 2000-character link is saved (the write succeeds) and its tile appears. Also a link whose host is about 1990 characters, with an empty Name and a 2000-character icon link, saves without the Sync text (budget of decision 2).
- Red on old code (premise): the 9000-character case shows the Sync text with focus on the button.
- Verified by: E2E `dg-83`; unit tests.

### AS-LDV-05 A too long name and a too long icon link
- Given: the Add link dialog with a valid link.
- When: the Name has 101 characters; separately 100; the Custom icon link (icon mode Custom) is 2001 characters; separately 2000.
- Then (the icon check also with the icon mode left on "From site" and a long value typed earlier in the hidden field: the error shows, the Custom radio gets checked, the field is visible and focused): 101 → "That name is too long (up to 100 characters)" with the focus on Name; 100 saves; icon 2001 → "That icon link is too long (up to 2000 characters)" with the focus on Custom icon; 2000 saves (a link with url, name and icon all at their maxima saves in one write). A link added with an empty Name and a 300-character host has a stored `label` of exactly 100 characters (the host cut), its Edit dialog opens with that 100-character Name and Save without edits succeeds; clearing the Name in Edit and saving stores the cut host again.
- Verified by: E2E `dg-83`; unit tests.

### AS-LDV-06 Real storage failures keep the Sync text
- Given: a valid link and a failing sync write (`failStorageInit`, as the existing AS-25 scenario).
- When: Add.
- Then: the alert reads the existing Chrome Sync message; the input has no `aria-invalid` and no `aria-describedby`; the focus is on the submit button; the dialog stays open.
- Verified by: E2E `dg-83`.

### AS-LDV-07 The error is tied to its field (assistive technology)
- Given: an invalid address entered in the Add link dialog.
- When: Add is pressed (error shown); then the Link is corrected to a valid address, the Name is made 101 characters long and Add pressed again; then the Name is shortened and Add pressed.
- Then: after the first error the Link input has `aria-invalid="true"` and `aria-describedby` equal to the id of the alert slot, whose text is the message; `ariaSnapshot()` of the dialog shows the input described by the message; after the second submit starts the Link input has neither attribute and the Name input has both; after the successful Add the dialog is gone. No visible change: the screenshot of the dialog with an error equals the old one (same box and text positions, measured through `getBoundingClientRect` of the field, the slot and the buttons).
- Verified by: E2E `dg-83`; design review (screen reader reading); `newtabSource` pins.

### AS-LDV-08 The Add tile points at its menu
- Given: a hidden weather tile so Add opens a menu.
- When: the Add tile is pressed; then Escape.
- Then: while the menu is open the tile has `aria-expanded="true"` and `aria-controls` equal to the menu's id; after Escape the tile has `aria-expanded="false"` and no `aria-controls`.
- Verified by: E2E `dg-83`.

### AS-LDV-09 A new tile below the first screen is shown
- Given: 190 links filling the first screen; scrollY 0.
- When: Add `https://newlink.example.org/`.
- Then: the dialog closes; within 1500 ms the new tile is fully inside the window (`top ≥ 0`, `bottom ≤ clientHeight`), `scrollY > 0`, the tile has `data-just-added="true"` and a visible ring; measured from the moment the dialog leaves the DOM, after 2000 ms ± 300 the attribute and the ring are gone; "Link added" is in the live region; focus is on the Add tile; the page does not scroll again after the highlight ends.
- Red on old code (premise): `scrollY` 0, tile at `top` 1136.
- Verified by: E2E `dg-83`; design review (the movement).

### AS-LDV-10 A new tile already on screen is left alone
- Given: a desk with free cells on the first screen.
- When: Add a link.
- Then: `scrollY` stays 0 during and after, no `data-just-added`, no ring.
- Verified by: E2E `dg-83`.

### AS-LDV-11 Reduced motion
- Given: `prefers-reduced-motion: reduce` emulated, the AS-LDV-09 seed.
- When: Add a link.
- Then: the tile is inside the window on the next frame after the dialog closes (instant scroll, `scrollY` constant within 100 ms), the ring is present and static (`getComputedStyle().animationName` is `none`) for 2000 ms ± 300 and then removed.
- Verified by: E2E `dg-83`; design review.

### AS-LDV-12 Narrow and low windows
- Given: the AS-LDV-09 seed (and the validation errors) at 500×800, 320×600 and 1280×300.
- When: Add an invalid link; then a valid one.
- Then: the error and the focused Link field are inside the visible part of the dialog (the dialog scrolls inside if needed); the valid link's tile ends fully inside the window (the page scrolls as close to centred as it can; in the last row it stops at the page bottom) at least 6 px from the window's top and bottom (the threshold of decision 4), so the 3 px ring is not clipped; at the page bottom the padding (`--grid-pad`, 8 px at 320 px) leaves at least 3 px beyond the ring.
- Verified by: E2E `dg-83`; design review.

### AS-LDV-13 No scroll or ring on other paths
- Given: (a) 190 links filling the first screen and one weather tile hidden; (b) a fresh desk with the first-run wizard (the wizard needs a fresh desk, so it cannot share the 190-link seed).
- When: (a) a link is edited and saved; a weather tile is restored from the Add menu; a tile is dragged; (b) the wizard adds starter links with Finish.
- Then: none of them scrolls the page (`scrollY` unchanged) or sets `data-just-added`; in (b) all starter links are added (the new validation accepts every starter address).
- Verified by: E2E `dg-83`.

### AS-LDV-14 The ring is readable
- Given: the AS-LDV-09 moment at t = 0 of the ring (animation paused at 0 through `getAnimations()`, or the reduced-motion static ring), light, dark and `forced-colors: active`.
- Then: the ring layer's colour (full strength) has contrast ≥ 3:1 against the page background (the ring lies outside the tile, on the page) in light and dark; under `forced-colors: active` the tile has `outline-style` solid, `outline-width` 3px and `outline-color` `Highlight` (no shadow layer); the ring does not change the tile's `getBoundingClientRect()`.
- Verified by: E2E `dg-83` (`lib/contrast.mjs`); design review.

### AS-LDV-15 Add after the storage was cleared in another tab
- Given: the Add link dialog open; another tab removes everything (the storage is cleared) before Add is pressed.
- When: Add.
- Then: the existing recovery message appears ("Your layout was reset in another tab."), the new link stays after the heal and is handled like any new tile (scrolled to when off screen), no `pageerror`.
- Verified by: E2E `dg-83`.

### AS-LDV-16 Keyboard
- Given: the Add link dialog.
- When: the address `not a url !!` is typed and Enter pressed; then Escape.
- Then: Enter submits (the error shows, focus on Link, `aria-invalid` set); Escape closes the dialog with nothing written and the focus returns to the Add tile.
- Verified by: E2E `dg-83`.

### AS-LDV-17 Two tabs add at once
- Given: two tabs on the same profile, both with the Add link dialog open; tab B's dialog was opened before tab A saved.
- When: tab A adds `https://a.example.org/`, then tab B adds `https://b.example.org/`.
- Then: in tab B the ring and the scroll (when needed) go to B's own link (`b.example.org`), not to A's.
- Verified by: E2E `dg-83`.

### AS-LDV-18 Texts
- Given: any dialog error.
- When: the person submits an invalid or too long input.
- Then: the strings (all new, plain, no trailing period, the same register as "Enter a valid URL"): "That link is too long (up to 2000 characters)", "That name is too long (up to 100 characters)", "That icon link is too long (up to 2000 characters)". Shown in the dialog's alert slot in Add and Edit. Existing strings unchanged. Nothing new is spoken for the ring or the scroll.
- Verified by: E2E `dg-83`; unit tests.

### AS-LDV-19 Add in edit mode
- Given: the AS-LDV-09 seed with edit mode on (tiles jiggling), and separately with reduced motion.
- When: Add link is opened from the Add tile (edit mode) and a link is saved.
- Then: the page scrolls to the new tile as in AS-LDV-09; the tile has the ring while it keeps jiggling (`getAnimations()` of the tile lists both `tile-jiggle` and `tile-added`); with reduced motion the tile keeps its dashed outline and shows the static ring layer; the ring ends after 2000 ms ± 300 and the jiggle continues.
- Verified by: E2E `dg-83`; `newtabSource` pin (both animation names in the edit-mode rule).

## Review focus

1. Scenarios: the exact boundary (2000 / 2001, 100 / 101), non-ASCII paths that grow on normalization, the order of checks (a long spaced string: which message), the Edit path, a stale-tab Add, the wizard starters still passing the new validation, the last-of-difference id when two tabs add at once (AS-LDV-17), the label fallback and the 8 KB budget (decision 2).
2. Visual: the ring around a tile in both themes and at the window edge, its fade, no layout shift or clipping, the interplay with edit-mode jiggle; the dialog with an error looks exactly as before.
3. Accessibility: `aria-invalid` / `aria-describedby` vs the existing `aria-labelledby` and the `role="alert"` slot (double reading), `aria-controls` only while the menu exists, reduced motion, forced colours, the focus staying on Add while the page scrolls away.

## Accepted exceptions

- An old stored link with a space, a long URL or a long name keeps working and displays; opening its Edit dialog and pressing Save without shortening it shows the new error (the person fixes the field). No migration (no-users policy).
- The custom icon link is not checked for spaces or junk (only its length): an unreadable image already falls back to the letter icon. A candidate for a later run.
- Focus stays on the Add tile after a scrolled-to add; with the tile off screen the focus ring is not visible until the person scrolls back.
- `closeDesktopDialog()` focuses the Add tile before the scroll to the new tile is requested; if the page was already scrolled, the focus call may jump it once before the smooth scroll starts.
- A long smooth scroll may overlap the first part of the 2 s ring; the ring is not restarted when the scroll ends (the fade continues across re-renders, decision 4).
- Screen readers may read the error twice (the focus lands on the field with `aria-describedby`, and the `role="alert"` slot announces on change).

- The new tile's ring uses the same colour token as the keyboard focus ring (focus stays on the Add tile after the add, so the two are never on one tile); a distinct highlight colour is a possible later design choice.
- While the 2 s `tile-added` animation runs, its shadow replaces the hover shadow of that tile.

- **Implementation finding (run 43):** in a 1280×300 window the focused Link field and the error slot are ~318 px apart and cannot both be inside the 268 px visible part of the dialog; AS-LDV-12 holds there as "the focused field is visible and the slot is reachable by scrolling the dialog" (low windows: backlog 20, R46). Widths 500 and 320 meet the original wording.

## Non-goals

- Visible error styling on the field (red border, icon): owner chose assistive technology only.
- `maxlength` attributes; counters; trimming or auto-fixing a pasted address.
- Encoding spaces automatically; requiring a dot in the host; blocking private or reserved hosts.
- Validating the custom icon link beyond its length; the Name beyond its length.
- Moving focus to the new tile; an extra live announcement about scrolling; scrolling after edit, restore, drag or the wizard.
- Changing where a new tile is placed (`placeNew`), the 200-link limit, the Chrome Sync wording for real quota failures.
- Other cluster items (R44 and later).
