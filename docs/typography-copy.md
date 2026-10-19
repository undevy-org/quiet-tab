# Typography and copy: one body size, overlay text that follows the browser font, one vocabulary, a labelled city hint, honest host checks

## Status

`draft` — revision 1 (2026-10-20, stage 0 of run 49). Run №49 (`typography-copy`), row Р49 of the roadmap ("Типографика и тексты", marathon `kickoffs/marathon-45-51.md`). Backlog items 27, 35, 28, 36 and 104. Triage below is by reading `origin/main` at `a9b88be` (runs 45–48 merged) plus a live probe; the first step of the kickoff re-checks every item live on `origin/main` before stage 1.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). Nothing stored changes: no key, no field. Old stored links keep working (Accepted exception 8).

Related: `docs/design-system.md` (Typography table, `.segmented`), `docs/link-dialog-validation.md` (decision 1, host rule that this run tightens), `docs/tile-size-1x2.md` (decision 4, the hint tile by size), `docs/weather-reliability.md` (the stale description whose dash changes), `docs/layers-low-window.md` (sticky footer and scrolling dialogs that carry a larger font), `docs/onboarding-wizard.md`, `docs/city-modal-focus-copy.md`; code: `src/design-tokens.css`, `src/newtab.css` (`body`), `src/controls.css` (`.segmented__option`), `src/surfaces.css`, `src/newtab.js` (`createCityHintTile`, tooltip handlers, `ENSURE_FAILED_MESSAGE`), `src/widgetsService.js` (`normalizeFavoriteUrl`), `src/widgetsStore.js`, `src/widgetsShared.js`, `src/weatherTiles.js` (`STALE_PREFIX`), `src/desktopLayout.js`, `src/newtab.html`.

## Terms

- **Overlay text**: all text inside `.desktop-dialog`, `.city-modal` (change mode and the first-run wizard, which reuses the shell), the Add menu and the suggestion list, plus the shared tooltip and the page status chip.
- **Tile text**: text drawn on a tile of the grid (link label and host, letter, weather values, the 2×1 / 1×2 hint caption, weather city line) and the glyph sizes. Together with the cell metrics (`--cell-size`, `--grid-gap`, `--grid-pad`) it is in px.
- **Default font size**: Chrome's "Font size" setting, `webkit.webprefs.default_font_size`, 16 px unless the user changed it. It is the root size that `rem` and the extension-page default `body` size follow.
- **Junk host**: a typed host the URL parser accepts but that cannot name a site: an empty label, a label that begins or ends with `-`, a label with no letter or digit, or a number the parser expands to an IPv4 address (`1` → `0.0.0.1`).

## Intake log

Marathon row Р49, no questions to Kier. Decisions of Kier (2026-10-15, roadmap row Р49 and backlog items 35, 36): **item 36 — `rem` for the text of dialogs, the wizard and modals; tiles and the cell stay in px. Item 35 — vocabulary link / tile / grid: "favorite" and "widget" leave all visible and announced text (the name of `#favorites`, "Widgets", becomes "Grid"), the dash is "—".** Items 27, 28 and 104 had no decision. Everything else is decided below by the author; four choices are marked `Ruling (марафон, на проверку Киру)` (decisions 2, 4, 6, 7).

## Triage (reading `main`, then live)

| Item | Reproduces? | Where |
|------|-------------|-------|
| 27 text of the modal is 12 px, the design system says 14 px | yes | `body` has no `font-size`; the browser's own default for extension pages is `body` at 75 % of the default font size (measured: 12 px at 16, 18 px at 24), and everything with `font: inherit` (inputs, buttons, descriptions, the city link, Add menu rows, suggestion rows, the city field value) takes it. Only labels (13), error and confirm text (14) and titles (18) are explicit. `docs/design-system.md` still says "`--font-size-body` inherit (~16px UA)". |
| 36 sizes are px: a larger browser font does not scale dialogs | yes | `--font-size-sm/md/title` are `13px/14px/18px`; the only part that scales today is what inherits the 75 % body, so at a 24 px default font the buttons and inputs are 18 px beside a 13 px label and an 18 px title. |
| 35 hyphen instead of dash, favorite/widget in visible text | yes | two hyphens (`ENSURE_FAILED_MESSAGE`, `STALE_PREFIX`); "Widgets", "favorites", "widgets", "Favorite", "Widget" in nine messages and the `#favorites` name (list in decision 4). |
| 28 the 1×1 "Set a city" hint has only a pin | yes | `createCityHintTile` 1×1 draws the `mapPin` glyph; no text, no `data-tooltip-trigger`, no `title`; hover shows nothing. The copy part of the item (the modal promising a "weather tile") is obsolete: the current modal and wizard copy do not say so. |
| 104 junk hosts pass the address check | yes | `PLAIN_HOST_PATTERN = /^[a-z0-9._-]+$/i` accepts `a..b`, `-a.com`, `.com`; `new URL("https://1")` is `0.0.0.1`. |

## Live measurement

Measured on `origin/main` `a9b88be` (2026-10-20, Mac, Chromium for Testing 153, throw-away profiles; probes `scratch/run-49-triage/probe-type.mjs`, `probe-body.mjs`, `probe-hint.mjs` in notes; the font-size profile is `Default/Preferences` with `webkit.webprefs.default_font_size`, which the harness can write before launch). All five items reproduce.

**Body size (item 27).** On the new tab page `html` is 16 px and `body` is 12 px. With the product's stylesheets removed the body is still 12 px and its family `system-ui, sans-serif`: it is the browser's own default for extension pages, not a rule of ours (setting `body { font-size: medium }` gives 16; with the default font size at 24 px the body is 18, which is 75 % again). A plain `data:` page in the same browser has body 16 px.

**Computed sizes at the default font size (16 px), px:**

| Surface | Text |
|---------|------|
| Add link, Edit link | title 18; row labels 13; segmented labels 13; **inputs 12**; **Cancel / Add 12**; inline error 14 |
| Delete / Hide confirm | title 18; body 14; **buttons 12** |
| Edit weather | title 18; label 13; **city value 12**; hint "Change" 12; segmented 13; **buttons 12** |
| City modal (change mode) | title 18; **description 12; "use your location" 12; input 12; buttons 12** |
| Add menu | **items 12** |
| Wizard | titles 18; **descriptions 12; input 12; buttons 12**; starter labels 13; starter icon letter 12 |
| Tooltip | 13 |
| Grid (normal and edit mode) | weather primary 18, secondary 11; link letter 15 (all explicit px) |

**The same surfaces with the default font size 24 px (150 %), before the change:** `html` 24, `body` 18. Inputs, buttons, descriptions, the city link, menu items and the city value follow the 75 % body: 18 px. Titles stay 18, row labels and segmented labels 13, confirm body and inline error 14, tooltip 13, starter labels 13, grid text unchanged. So a dialog has a title the size of its buttons and labels smaller than the field text; the cell stays 72 px.

**CSS-only prototype** (throw-away worktree, not committed: tokens in `rem` (0.75 / 0.8125 / 0.875 / 1.125), `body { font-size: var(--font-size-md) }`, the two literal px sizes of `surfaces.css` on tokens, `.segmented__option` `min-height` instead of `height`):
- At 16 px: inputs, buttons, descriptions, links, menu items 14; labels 13; titles 18; grid text identical to base. Dialog heights equal base for Add link (436), confirm (156), Edit weather (256), Add menu (200×94); the city modal 205 → 208 and the wizard 226 → 229 (the description line 12 → 14 px: 17.4 → 20.3 px).
- At 24 px: title 27; labels, segmented labels, starter labels and tooltip 19.5; inputs, buttons, body text, descriptions, links, menu items, errors 21; the city hint 18; grid text identical to base (18 / 11 / 15), `--cell-size` 72. Heights at 1280×800: Add link 449, confirm 179, Edit weather 269, city modal 231, wizard 322. No text outside its box except one: **with `height: 38px` on `.segmented__option` the label "From site" wraps to two lines (text 71×56 px) inside the 38 px option and the group's `overflow: hidden` clips it**; with `min-height` all options grow and nothing clips. At 320×600 the Add link dialog scrolls inside (618 > 566), as it does today when it does not fit.
- Full E2E on this prototype (`--base origin/main`, Mac, one run, about an hour): 6481 of 6531 checks, 0 errors. The 50 red checks are 8 known reds of clean `main` (`dg-85` AS-CSL-08 ×2, `dg-86` AS-LLW-04/05 gap ×6, backlog 135), 5 more that are red on clean `main` too (`dg-88` AS-WRL-04, premise "the base carries no age sentence", 173 of 178 on `a9b88be`, backlog 142), and **37 caused by the CSS change in four scenarios**, all green on clean `main` (`dg-83` 132/132, `dg-78` 50/50): `dg-78` AS-FBO-01/04 ×3 (absolute y of the starter rows against base: +1.45 px from the 14 px step description), `dg-83` AS-LDV-07 ×1 (dialog screenshot against base: the button text is 14 px) and AS-LDV-13 ×3 (the scenario counts every `scroll` event in capture; the Link field of an edited link, `https://site-number-0.example.com/path`, no longer fits at 14 px (scrollWidth 285 > 264) and scrolls its own text: probe `scratch/run-49-triage/probe-scroll.mjs`; a test artefact, the page does not scroll), `dg-85` AS-CSL-06 ×24 (city modal and suggestion boxes against base: +1.45 px, the overlay-to-docked flip height moves with the +3 px modal) and `dg-86` AS-LLW-04/05 ×6 (the confirm dialog's footer band against base pixel for pixel: the button text is 14 px). Every other scenario, including `dg-39`, `dg-41`, `dg-42`, `dg-47`, `dg-48`, `dg-49`, `dg-58`, `dg-60`, `dg-75`, `dg-79`, `dg-82`, `dg-84`, was green.

**Hint tile (item 28).** No city stored, default metrics, 1×1 hint at 1280×800 / 500×800 / 340×700: cell 72 / 64 / 56, tile 72×72 / 64×64 / 56×56, `aria-label` "Set a city", `textContent` empty, no `data-tooltip-trigger`, no `aria-describedby`, no `title`; after 500 ms of hover the shared `#tooltip` stays hidden. The caption "Set a city" in 11 px / 600 would be 51.1 px wide: one line fits the 54 px inner width of the 56 px cell with 1.4 px to spare, nothing else fits beside the pin.

**Hosts (item 104),** `normalizeFavoriteUrl` on `origin/main`: accepted — `http://a..b`, `http://-a.com`, `http://.com`, `http://a-.com`, `http://a.-b`, `http://..`, `http://-`, `http://_`, `1` (→ `https://0.0.0.1/`), `127.1` (→ `127.0.0.1`), `2130706433` (→ `127.0.0.1`), `0x7f.0.0.1`, `010.1.1.1` (→ `8.1.1.1`), `1.2.3` (→ `1.2.0.3`); rejected as today — `http://a b`, `999.1.1.1`, `http://1.1.1.1.1`, port above 65535. Legitimate and kept: `localhost:3000`, `router:8080`, `nas:9000/share`, `intranet/wiki`, `192.168.0.1`, `[::1]:8080`, `http://my_host.local`, `example.com.`, `a--b.com`, `xn--80ak6aa92e.com`, `пример.рф`.

**Strings (item 35).** Every string literal of `src/*.js` and `src/newtab.html` matching `favorit|widget|desktop` (comments removed, including multi-line templates) was listed: the visible or announced ones are the nine messages and the name in decision 4; the rest are class names, ids, data attributes, storage keys and imports. Hyphen used as a dash: two strings (decision 5).

## Decisions

1. **Body text is 14 px (item 27).** `body` gets `font-size: var(--font-size-md)` (`newtab.css`). Everything that inherits the body size (inputs, buttons, descriptions, `use your location`, Add menu and suggestion rows, the city field value, the unsized parts of the wizard) goes from 12 to 14 px at the default font size, the "dialog body" size the design system already names. Explicit sizes stay: row, segmented and starter labels 13, hint 12, error and confirm body 14, titles 18. Tile text never inherits from `body` (every tile text rule sets its own px size; verified by the prototype), so the grid does not change. The Settings and Add chrome tiles inherit a 14 px `font` from `body` but draw only icons.
2. **Overlay text is in `rem`; tiles and the cell stay in px (item 36, decision of Kier).** `design-tokens.css`: `--font-size-xs: 0.75rem` (new, 12 px), `--font-size-sm: 0.8125rem` (13), `--font-size-md: 0.875rem` (14), `--font-size-title: 1.125rem` (18): numerically the old px at the default font size, so only decision 1 changes anything at 16 px. The two literal px sizes of `surfaces.css` move to tokens (`.onboarding-wizard__starter-label` → `--font-size-sm`, `.city-field__hint` → `--font-size-xs`). The starter icon letter (12 px inside a fixed 22 px icon box) stays px. Everything in `newtab.css` that sizes tile text stays px, including `--font-size-weather-*`; the cell metrics stay px. **Ruling (марафон, на проверку Киру): the tooltip (`--font-size-sm`), the page status chip and the page-level error text (`--font-size-md`) share the tokens and so also scale with the browser font; the Add menu and suggestion rows scale through the body size; альтернатива: keep the tooltip and the chip in px by splitting the tokens so that only dialogs, the wizard and modals scale; цена ошибки: a token split and one scenario row, nothing structural.**
3. **A larger font must not clip a control.** `.segmented__option` uses `min-height: calc(var(--control-height) - 2 * var(--control-border-width))` instead of `height` (found by the prototype: "From site" wraps at a 24 px default font in a 420 px dialog; below 452 px windows the existing narrow block already sets `white-space: nowrap`). Options of a group stay equal in height (flex stretch). No other geometry changes: control min-height 40, dialog width `min(420px, 100vw − 32px)`, label column 100 px, icon-button 36 px, glyph sizes, paddings. Tall dialogs use the existing scroll with the sticky footer of `docs/layers-low-window.md`.
4. **One vocabulary: link / tile / grid (item 35, decision of Kier).** A saved site is a **link**; any square of the grid is a **tile** (link tile, weather tile, Settings, Add); the whole board is the **grid**. "Favorite" and "widget" (also "favourite", "bookmark", "desktop") do not appear in visible or announced text: every string that reaches `textContent`, `aria-label`, `title`, `alt`, the live region, `#desktop-status`, a dialog error slot or the full-page message, including `Error.message` that `runDesktopMutation` and the bootstrap show. New texts:

   | Where | Now | New |
   |-------|-----|-----|
   | `#favorites` accessible name (`newtab.html`; the id stays) | `Widgets` | `Grid` |
   | `widgetsService.js` (2×, Add and wizard batch) | `You can save up to 200 favorites` | `You can save up to 200 links` |
   | `widgetsStore.js` `SYNC_WRITE_ERROR` | `…Try removing a few favorites or try again shortly.` | `…Try removing a few links or try again shortly.` |
   | `widgetsShared.js` `NEWER_WIDGETS_MESSAGE` | `Your saved widgets were written by a newer version of Quiet Tab and can't be edited here. Update Quiet Tab to keep using them.` | `Your saved grid was written by a newer version of Quiet Tab and can't be edited here. Update Quiet Tab to keep using it.` |
   | `widgetsStore.js` `INVALID_WIDGETS_MESSAGE` | `Your saved widgets data could not be read, so changes are paused. Reload this tab; if this keeps happening, update Quiet Tab.` | `Your saved grid could not be read, so changes are paused. Reload this tab; if this keeps happening, update Quiet Tab.` |
   | `newtab.js` bootstrap | `Chrome APIs for favorites are unavailable.` | `Chrome APIs for the grid are unavailable.` |
   | `widgetsService.js` + `newtab.js` (2×) | `Favorite not found` | `Link not found` |
   | `widgetsService.js` | `Widget not found` | `Tile not found` |
   | `desktopLayout.js` (3×) | `Widget is wider than the grid` | `Tile is wider than the grid` |
   | `widgetsStore.js` | `Invalid widgets state` | `Invalid grid state` |

   Identifiers and storage stay as they are: the type value `"favorite"`, `quietTabWidget:<id>` keys, `#favorites`, `data-widget-id`, class names, `addFavorite`, `MAX_FAVORITE_WIDGETS` (renaming them is a storage or API change, not copy). The wizard's error mapping matches the text `up to 200` (`onboardingFinishErrorForAddFailure`), which the new wording keeps. The unreadable-data message is only re-worded here; its design (a reset button) is row Р51. **Ruling (марафон, на проверку Киру): "layout" stays in `Your layout was reset in another tab.`, `Couldn't restore your layout. Reload this tab.`, `Editing layout. Activate Settings to finish.` and `Layout editing off`, because they speak of the arrangement and the edit mode, not of the whole board; альтернатива: "grid" in those four strings; цена ошибки: four strings and their tests.**
5. **The dash is "—" (item 35, decision of Kier).** `ENSURE_FAILED_MESSAGE`: `Couldn't add the weather and settings tiles — Chrome Sync may be full or unavailable. Free up sync space, then reload this tab to try again.` `STALE_PREFIX` (`weatherTiles.js`): `Couldn't refresh — showing saved data. ` (so the stale description reads `Couldn't refresh — showing saved data. Updated 2 h ago. Currently 21°. …`). A dash is written with a space on both sides, as the other texts of the product already do. No other string uses a hyphen as a dash (checked: the source scan finds only these two).
6. **The 1×1 city hint gets the shared tooltip (item 28).** In normal mode, hovering the 1×1 hint tile or focusing it with the keyboard (`:focus-visible`) shows the shared `#tooltip` with the text `Set a city`, with the same placement, Escape and edit-mode rules as the weather tiles whose cell it takes. The face of the tile (pin, dashed border, size) and its accessible name (`aria-label` "Set a city") do not change; no `aria-describedby` (the name is the text) and no native `title` (it would double the custom tooltip). The 2×1 and 1×2 hints already show the words and get no tooltip. **Ruling (марафон, на проверку Киру): tooltip, not a permanent caption: the pin stays alone on the face (no room for a caption at the 56 px cell: 51.1 px of text in 54 px of space with the pin still to place; a caption at 64 and 72 would make the three sizes differ); альтернатива: a two-line caption "Set a / city" under a smaller pin at 1×1; цена ошибки: someone who never hovers or tabs to the tile still sees only the pin, as today; changing it later is one rule in `newtab.css` and `createCityHintTile`.**
7. **Junk hosts are rejected (item 104).** After the existing checks, `normalizeFavoriteUrl` validates the parsed host with these rules (error `Enter a valid URL`, field `url`, as for every bad address; no new text):
   - an IPv6 literal in brackets: as today;
   - an IPv4 address (the parsed host is four decimal parts): accepted only if the typed host was that same dotted quad; so `192.168.0.1` and `http://192.168.0.1:8080/x` pass, while `1`, `127.1`, `2130706433`, `0x7f.0.0.1`, `010.1.1.1`, `1.2.3` (all expanded by the parser) are rejected;
   - any other host: split on `.`; one trailing dot is allowed (a rooted name such as `example.com.`); every other label is 1 or more characters from `[a-z0-9_-]`, does not begin or end with `-`, and contains at least one letter or digit. So `a..b`, `.com`, `..`, `-a.com`, `a-.com`, `a.-b`, `-`, `_` are rejected; `localhost`, `intranet`, `my_host.local`, `_dmarc.example.com`, `a--b.com`, `xn--80ak6aa92e.com` pass.

   No label-length or total-length rule: the 2000-character link limit stays the only length rule (run 43 tests build 300 and 1990 character hosts). Add, Edit and the wizard starters all go through the same function. The image URL of a custom icon is not host-checked (backlog 102, decided in run 43). **Ruling (марафон, на проверку Киру): number-only short forms of an IPv4 address (`127.1`, `2130706433`, hex and octal parts) are rejected because they are far more often a typo than a wish; альтернатива: accept every address the parser can turn into IPv4 and reject only the bare numbers without a dot; цена ошибки: someone who really types `127.1` has to type `127.0.0.1`.**
8. **Documents.** `docs/design-system.md`: Typography table (xs added, sm / md / title in `rem` with their px equivalents, the `--font-size-body` row replaced by "body = `--font-size-md`; Chrome's extension-page default is 75 % = 12 px"), a "Browser font size" paragraph (what scales: overlay text, tooltip, status chip; what does not: tile text, cell, icon boxes, control geometry) and the `.segmented` option rule; `docs/link-dialog-validation.md`: one line that decision 1's host rule is tightened by this spec; `agent-config/CLAUDE.md` (notes): the `aria-label="Grid"` of the DOM contract and the host rule sentence; `CHANGELOG.md` `[Unreleased]`.

## Acceptance scenarios

### AS-TYP-01 Overlay text is 14 px, not 12 (decisions 1, 2, item 27)
- Given: the default browser font (16 px), 1280×800, light theme, two links, a stored city, the UV tile hidden (so the Add tile in edit mode opens a menu), a fresh profile for the wizard.
- When: open Add link (with an inline error shown), Edit link, the delete confirm, the hide confirm, Edit weather, the city modal in change mode (alone and stacked over Edit weather), the Add menu (first and second level), the city suggestion list (stub returns two cities), and the wizard (both steps).
- Then: computed `font-size` of the element that carries the text: `body` 14; every `input.favorite-input`, every `.button`, `.add-menu__item`, `.weather-form__suggestion`, the city field value, `.city-modal__description`, `.onboarding-wizard__step-description`, `.city-location-link` 14; row labels, segmented labels, starter labels and the tooltip 13; `.city-field__hint` 12; `.desktop-dialog__body`, `.desktop-dialog__error`, `.status` and `.desktop-status` 14; titles 18; the starter icon letter 12. No other text node in these surfaces is 12 px. Grid text is unchanged (weather primary 18 / secondary 11, link letter 15, hint 13 / 11). Dialog heights equal base (Add link 436, confirm 156, Edit weather 256, Add menu 94) except the city modal and the wizard, which grow by 3 px (205 → 208, 226 → 229).
- Verified by: E2E `dg-89-typography-copy.mjs` (table of computed sizes against the table above) and unit pins (`test/designSystem.test.js` token values, `test/newtabSource.test.js` `body { font-size: var(--font-size-md) }`).

### AS-TYP-02 Overlay text follows the browser font size; tiles and the cell do not (decision 2, item 36)
- Given: a profile whose default font size is 24 px (150 %; written to `Default/Preferences` before launch), 1280×800, the same desk as AS-TYP-01.
- When: open the same surfaces as AS-TYP-01.
- Then: every overlay text is 1.5 × its AS-TYP-01 value: `body` 21; inputs, buttons, descriptions, links, menu items, suggestion rows, errors, confirm body, status 21; row labels, segmented labels, starter labels, the tooltip 19.5; `.city-field__hint` 18; titles 27; the starter icon letter stays 12. Tile text and geometry equal the default-size values: weather primary 18 / secondary 11, link letter 15, hint 13 / 11, `--cell-size` 72, every tile rect equal to the default-size rect within 0.5 px, the Settings and Add glyphs unchanged. The page zoom (Ctrl +) is unaffected: it still scales everything.
- Verified by: E2E `dg-89` (same table times 1.5 and a tile-rect comparison); unit pins that no `font-size` declaration in `design-tokens.css`, `controls.css`, `surfaces.css` is in `px` except the weather tile tokens `--font-size-weather-*` and the starter icon letter.

### AS-TYP-03 A larger font clips nothing (decision 3)
- Given: the 24 px default font; windows 1280×800, 500×800, 320×600 and 1280×300; light and dark; the Icon row of Add link ("From site", "Letter", "Custom"), the Size row, Edit weather, the city modal with its suggestion list (docked and overlay), the wizard (both steps), the Add menu.
- When: open each surface, Tab through every control.
- Then: for every text-bearing element the text box lies inside its own border box (±1 px) and inside the surface box horizontally; in a 420 px dialog "From site" wraps to two lines and its option is at least as high as the text (about 56 px), all options of a segmented group have the same height, the group keeps its radius and border (no content cut by `overflow: hidden`); below 452 px the options stay on one line as today; controls keep the 40 px minimum; a surface taller than the window scrolls inside with its footer reachable (Cancel / Save visible after scrolling, the sticky footer rule of `docs/layers-low-window.md`); no horizontal scroll of the page; focus rings on a segmented group, a button and the city field are whole (pixel comparison focused / unfocused in both themes, lesson of run 44).
- Verified by: E2E `dg-89` (box containment sweep in the page, the segmented heights, screenshots for the rings).

### AS-TYP-04 One vocabulary: link / tile / grid (decision 4, item 35)
- Given: each state that shows one of the strings of the table in decision 4.
- When: the state is reached: `main` landmark at rest; a newer meta (`version` 4) and a malformed meta (full-page message); `chrome.storage` missing (bootstrap message); a failing `sync.set` on Add link (dialog error); 200 links and Add link (dialog error; the wizard Finish with a full grid maps to the existing limit copy); the ensure failure (status chip); a stale or deleted link or an unknown tile id and a too-wide tile (unit only, they are not reachable from the UI).
- Then: the strings are exactly the "New" column; the `main` element's accessible name is `Grid`; no visible or announced text contains `favorite`, `favourite`, `widget`, `bookmark` or `desktop` (any case, whole words and plurals); the wizard maps the 200 limit to `Too many links on your grid. Uncheck some starters.` as before.
- Verified by: E2E `dg-89` for the reachable strings; unit tests for the rest; a source guard test (`test/vocabulary.test.js`) that extracts the string literals of `src/*.js` and the text of `src/newtab.html` and fails on those words except an explicit allowlist of identifiers (class names, ids, data attributes, storage keys, imports, `"favorite"` type value).

### AS-TYP-05 The dash is a dash (decision 5, item 35)
- Given: the ensure failure at boot; a stale weather tile (cache older than 30 minutes, forecast fails).
- When: read the status chip text and the stale tile's `aria-describedby` text / tooltip.
- Then: `Couldn't add the weather and settings tiles — Chrome Sync may be full or unavailable. Free up sync space, then reload this tab to try again.` and `Couldn't refresh — showing saved data. Updated 2 h ago. Currently 21°. …`; no string of `src` contains a hyphen with spaces on both sides.
- Verified by: E2E `dg-89` (and the updated `dg-56`, `dg-59`, `dg-54`, `dg-88`, `10-weather-grid-states`), unit `test/weatherTiles.test.js`, and the guard of AS-TYP-04.

### AS-TYP-06 The 1×1 "Set a city" tile says what it is (decision 6, item 28)
- Given: no city stored; the hint takes the first enabled metric's cell at 1×1; windows 1280×800 (cell 72), 500×800 (64), 340×700 (56); also the 2×1 and 1×2 hints (the metric resized in Edit weather).
- When: the pointer enters the hint, then leaves; Tab reaches it (`:focus-visible`); Escape; edit mode on; a neighbouring weather tile is hovered next.
- Then: normal mode: `#tooltip` is visible with the text `Set a city` and `role="tooltip"`, inside the viewport and not covering the tile's resting box, hidden on leave, on blur and on Escape; hovering the next tile replaces it. Edit mode: no tooltip. The tile's resting pixels, size and dashed border equal base; its accessible name is exactly `Set a city`; it has no `aria-describedby` and no `title`; clicking or pressing it still opens the city modal. The 2×1 and 1×2 hints show their words and have no tooltip. Reduced motion: no change.
- Verified by: E2E `dg-89` (all three cells, pointer and keyboard, pixel comparison of the resting tile against `--base`).

### AS-TYP-07 Junk hosts are rejected, real ones are not (decision 7, item 104)
- Given: the Add link dialog open at 1280×800; separately a stored link whose url is `http://a..b/` (an old save).
- When: type each address and press Add (Enter and the button): rejected — `http://a..b`, `a..b`, `http://-a.com`, `http://a-.com`, `http://a.-b`, `http://.com`, `.com`, `http://..`, `http://-`, `http://_`, `1`, `127.1`, `2130706433`, `0x7f.0.0.1`, `010.1.1.1`, `1.2.3`; accepted — `localhost:3000`, `router:8080`, `intranet/wiki`, `192.168.0.1`, `192.168.0.1:8080/x`, `[::1]:8080`, `http://my_host.local`, `http://_dmarc.example.com`, `example.com.`, `a--b.com`, `пример.рф`, `https://example.com/path?q=a+b`. For the old link: open its Edit dialog and press Save without changing it, then type a valid address and Save.
- Then: a rejected address shows `Enter a valid URL` in the dialog error slot (`role="alert"`), `aria-invalid="true"` and `aria-describedby` on the Link field, focus on the Link field, the dialog stays open, nothing is written (the sync area is byte-identical before and after); fixing the text and pressing Add saves the link and announces `Link added`. Pressing Add twice in a row on a rejected address shows one error and writes nothing. An accepted address is saved with the normalized `href` and `domain` the unit table lists. The old link stays on the grid and opens its stored `href`; its Edit → Save unchanged shows `Enter a valid URL` on the Link field until a valid address is typed (Accepted exception 8). The wizard's starter links are unaffected.
- Verified by: unit table in `test/widgetsService.test.js` (every address above plus the existing run 43 tables, which stay green) and E2E `dg-89` (a representative subset through the dialog, the old-link case, the sync area comparison).

### AS-TYP-08 Nothing else moves (all decisions)
- Given: the default font size; 500×800, 320×480 and 1280×300 windows; light, dark, forced colors, reduced motion; keyboard only.
- When: open the surfaces of AS-TYP-01 and Tab through them; Escape; reopen.
- Then: tab order, focus return, Escape order and the focus rings are identical to base; colours and contrast are untouched (no colour token changes); the only geometry differences at the default font size are the +3 px of the city modal and the wizard; every existing low-window and narrow case that had no scroll or had a scroll still has the same (in the full E2E of the CSS-only prototype only the four scenarios of "Affected earlier scenarios" differed from base, each by the comparison named there); the grid, the tiles, the drop highlight and the tooltip placement are identical to base.
- Verified by: E2E `dg-89` (geometry and order compared with `--base origin/main`) plus the existing scenarios listed below.

## Affected earlier scenarios

Each is updated, never deleted: the assertion keeps its strength and the commit message says why.

- **Texts (decisions 4, 5), by grep:** `dg-54-weather-tile-retry`, `dg-88-weather-reliability`, `10-weather-grid-states` (stale prefix, em dash); `dg-56-first-run-empty-desk`, `dg-59-vertically-centered-defaults` (ensure message); `dg-14-newer-meta`, `dg-56`, `dg-57-centered-grid` (newer-meta text; `dg-57` also the 200-cap text); `dg-24-cap-200`, `09-weather-ensure` (`up to 200 favorites`). Unit: `test/weatherTiles.test.js`, `test/desktopV2.test.js` (unreadable message), `test/onboardingWizard.test.js`, `test/widgetsService.test.js` (`Favorite not found`, `Widget not found`, the 200 text), `test/widgetsStore.test.js` (`Invalid widgets state`), `test/newtabSource.test.js` and `test/weatherSource.test.js` (the `aria-label="Widgets"` markup pins).
- **Typography (decisions 1–3), measured by the prototype run:** `dg-78` AS-FBO-01/04 (compare the rows' offsets to the dialog, not absolute y: the step description grows by 3 px); `dg-83` AS-LDV-07 (the base comparison of the field, error and button boxes: compare the input and error boxes, and the buttons by their geometry, since the button text changed) and AS-LDV-13 (count `scroll` events whose target is the document, not an input's own text scroll); `dg-85` AS-CSL-06 (the boxes of the list and dialog against base: the modal is 3 px taller, so the comparison uses the base's own offsets, and the flip height shifts by the same 3 px); `dg-86` AS-LLW-04/05 (the confirm dialog footer band: compare the band's geometry and the card's bottom edge, not the pixels of the button text). All other scenarios that measure dialogs or fonts were green.
- **Red on clean `main` (not this run's task, new scenarios do not rely on them):** `dg-85` AS-CSL-08 and `dg-86` AS-LLW-04/05 (backlog 135, Mac), `dg-79` flakes under load (backlog 139), `dg-88` AS-WRL-04 (backlog 142: its premise "the base has no age sentence" became false when run 48 merged; the text checks of that block are updated together with the dash change of decision 5 and the base premise is dropped).

## Review focus

- **Scenarios/states:** the host rule on the whole input space (what a user types into the Link field, with and without scheme, port, credentials, trailing dot, IPv4 short forms, IPv6); the old stored link in Edit; completeness of the vocabulary scan (any visible or announced string with the banned words that the guard misses: ternaries, concatenations, `Error.message` shown through `showDesktopStatus`); the tooltip trigger states (pointer, focus-visible, edit mode, Escape, scroll) on a tile that already has a different action.
- **Visual/layout:** every surface at the default size (+3 px) and at 150 %; the segmented group with wrapped labels; the wizard at 150 % in a 320×480 window; the tooltip and the status chip at 150 %; the grid at 150 % (must be identical to 100 %).
- **Accessibility/texts:** `Grid` as the landmark name; the new wording of the full-page messages; the em dash and a screen reader's reading of it; the tooltip text duplicating the name without double announcement; text that scales with the browser font setting (WCAG 1.4.4) while the page zoom keeps working.

## Accepted exceptions

1. `manifest.json` `description` ("…your favorite links…"), `README.md` and `store/*` use the everyday adjective or the store's permission wording; they are not UI text and are published separately (the store text is Kier-only). Revisit with the next store publication.
2. Internal identifiers keep "favorite" and "widget": the `"favorite"` type value, `quietTabWidget:<id>` and `quietTabWidgetsMeta` keys, `#favorites`, `data-widget-id`, class names, function and constant names. They are not visible or announced; renaming storage keys is a format change.
3. Tile text and the cell stay in px (decision of Kier): a larger browser font does not enlarge tile labels, weather values or hint captions; the page zoom does.
4. The starter icon letter (12 px in a 22 px box) stays in px: it is part of an icon.
5. Control geometry stays in px (40 px controls, 100 px label column, 420 px dialog, 36 px icon button): text grows inside it, and where it does not fit the element grows (segmented) or the dialog scrolls (existing mechanism). One line is not guaranteed at font sizes above 150 % or in very narrow windows.
6. The tooltip and the status chip scale with the browser font (Ruling in decision 2).
7. "Layout" stays in four strings (Ruling in decision 4).
8. An old stored link with a junk host stays on the grid and opens; its Edit → Save reports `Enter a valid URL` until the address is fixed. No migration (no-users policy).
9. IPv4 short forms are rejected (Ruling in decision 7). A custom icon URL gets no host check (backlog 102).
10. The 1×1 hint gets its words only on hover or focus (Ruling in decision 6); touch has no hover, which is the case today.
11. Wording of the unreadable-data message is only re-worded; its reset flow is row Р51.

## Non-goals

- Tile typography: sizes of tile text, glyphs, the cell and grid metrics, the weather type tokens (decision of Kier: px).
- Control geometry in `rem` (heights, paddings, dialog width), a user font-size setting inside the product, `html { font-size }`.
- A label-length or total-length rule for hosts, a TLD requirement, DNS or reachability checks, the host check of a custom icon URL.
- Renaming code identifiers or storage keys; the manifest `description`, README and store texts (Accepted exception 1).
- The reset flow for unreadable data and the text "Your grid couldn't be read." (Р51), tab-visibility refresh (Р50), any change to colours, focus rings, or weather behaviour.

## Review rounds

Revision 1: stage 0 author.
