# Tile text options: name and link switches on a link tile, a city label option on weather tiles, custom icons in any image format

## Status

`draft`

Revision 1 (2026-11-15, stage 0 of run 58). Run №58 (`tile-text-options`), row R58 of the roadmap. Kier's three requests (2026-11-15, below) plus three backlog lines that touch the same code: 102 (the custom icon link is not checked for spaces and junk), 107 (the name limit counts UTF-16 units) and 146 (10) (a dead `.toLowerCase()` in `typedHost`). Lines 102 and 107 are closed by this spec; the rewrite of both is in decisions 7 and 8, and the dead call is in decision 9.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). The storage change is three optional boolean fields; a stored item without them is valid and looks as it does today (decision 1). No migration, no upgrade scenario.

Related: `docs/tile-size-1x2.md` (decision 3, the tile text by size: superseded in part), `docs/link-tile-polish.md` and `docs/stale-link-and-host-contrast.md` (the host line), `docs/link-dialog-validation.md` (decision 2, the limits and the 8 KB budget; Accepted exception about the icon link: superseded in part), `docs/placeholder-contrast.md` (decision 7, the placeholder texts: superseded in part), `docs/typography-copy.md` (decision 7, `isRealHost`, `typedHost`), `docs/design-system.md` (`.segmented`), `docs/layers-low-window.md` (sticky dialog footer, `scroll-margin`), `docs/layers-weather-polish.md` (decision 12, the bold-face reserve); code: `src/newtab.js` (`createFavoriteTile`, `createFavoriteForm`, `createFormRow`, `createSegmentedControl`, `readFavoriteFormPayload`, `buildDialogContent` case `edit-weather`, `createWeatherMetricTile`), `src/widgetsStore.js`, `src/widgetsService.js`, `src/favoritesShared.js`, `src/controls.css`, `src/surfaces.css`, `src/newtab.css`.

Visual reference: none drawn in advance. The new control is built from the existing segmented control (decision 4) and every figure it must meet is in `## Acceptance scenarios`.

## Terms

- **`RUN58_BASE`**: `ea866b404e5d6226c1e5bcb675468a5c4e0d976f`, the head of `main` when the measurements below were taken.
- **Name line**: the link tile's label (`span.favorite-tile__label`, the text of `item.label`). **Link line**: the host name (`span.favorite-tile__host`, `item.domain`). The word the person sees in the dialog is "Link"; what the tile shows for it is the host, as today.
- **Tile sizes**: 1×1, 2×1 (`w` 2, `h` 1), 1×2 (`w` 1, `h` 2), 2×2.
- **Switches**: the two checkboxes `showName` and `showLink` of a link; **city label option**: `showCity` of a weather metric.
- **Icon box**: the 28 px (1×1, 2×1), 32 px (1×2) or 40 px (2×2) square of `.favorite-icon` and `.favorite-letter` (`src/newtab.css:448-499`).

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-11-15 | Kier, request 1: a custom icon as SVG instead of PNG; support for JPEG and other formats; cover the main wishes without a complicated architecture. | `confirmed` (live, § Live measurement 1): the field already takes any http(s) link and the image is a plain `<img>`; the real gaps are the hint text that says `icon.png`, no check of the link for spaces (backlog 102) and no test that the formats draw | decisions 6 and 7 |
| 2026-11-15 | Request 2: remove the link or the name or both from a link tile; on 1×1 they are already absent. | `confirmed` (code, § Live measurement 2): the tile text is a function of size only (`src/newtab.js:492-496`) | decisions 1 to 3 |
| 2026-11-15 | Request 3: remove the city name from the weather widgets; the city itself stays saved. | `confirmed` (code, § Live measurement 3): the city line shows only on 1×2 and 2×2 (`src/newtab.js:2169-2170`) | decision 5 |
| 2026-11-15 | Backlog 102, 107, 146 (10), which touch the same functions. | taken into the run by the coordinator; closed here | decisions 7, 8, 9 |

## Decisions of Kier (2026-11-15, the chat of the local Claude Code session, no message id)

1. Custom icon: variant A. A link only, as now; no file upload. Change the hint in the field (it says `icon.png`, which reads as "PNG only"); prove the formats with tests. SVG without own size (a `viewBox` only) must fill the icon box; JPEG, WebP, GIF, ICO and PNG must draw on every tile size; an unreadable image gives the letter.
2. Text on a link tile: variant B. Two separate switches, `Name` and `Link`, in the link dialog (Add link and Edit link). A new kind of control: designed here from `docs/design-system.md` and the existing controls, with an accessible name, focus, contrast and target size, in both themes and in forced colors. Both are on by default. The setting is per tile. The row is shown at 1×1 too: it changes nothing there and is remembered for a later size.
3. A 2×1 tile with the link on and the name off: the host takes the place of the name. (Today 2×1 shows the name only, 1×2 and 2×2 show the name and the host, 1×1 shows the icon only.)
4. A tile with no text at all: the icon at the same size, centered. The hover title and the accessible name (`Open <label>` / `Edit <label>`) stay in every variant.
5. City on weather tiles: a per-tile setting in the Edit weather dialog, like the size.
6. The text is a row `City label` with the options `Shown` and `Hidden` (a segmented control, like the existing ones). Default `Shown`. The city is shown today only on tall tiles (1×2, 2×2); the row is visible at every size.

Boundaries from Kier: a simple architecture, no new dependency and no background script, the module boundaries of `CLAUDE.md` (store, service, UI state, `newtab.js`), the `chrome.storage.sync` limits (8 KB per key, 100 KB in all) stay in force, security is not relaxed (user text only through `textContent`, links only `http:` and `https:`, custom images are never read through a canvas), the new settings change nothing a person sees today, wording is link / tile / grid and `test/vocabulary.test.js` stays green.

## Live measurement

Playwright's headless Chromium 153.0.8010.12 (a throw-away page, not the extension; the real-extension check is AS-TTO-16 and AS-TTO-17), `<img class="favorite-icon">` with the CSS of `src/newtab.css:448-461` (`width` and `height` set, `object-fit: contain`, `loading="lazy"`), a red fixture on a white page, 28, 32 and 40 px boxes. The probe script is not committed.

**1. Image formats in the icon box (request 1).** Served by a route with the right content type; `state` is the `load` or `error` event; "fills" means the pixel at 1 px inside the corner and at the centre is the fixture colour.
- SVG with only `viewBox="0 0 10 10"` (no `width`, no `height`): loads (`naturalWidth` 150, the default of an SVG with a ratio and no size), fills the box at 28, 32 and 40. SVG with `width="512" height="512"` and a `viewBox`: loads at 512×512, fills. SVG with neither a `viewBox` nor a size: loads at 300×150 and still fills the box (no intrinsic ratio, so `object-fit: contain` uses the box). SVG `viewBox="0 0 20 10"`: contained, the corners are white and the centre red (a 28×14 band centred in the box).
- PNG, JPEG (from `canvas.toBlob`), WebP (same), GIF (a 1×1 red GIF) and ICO (a 16×16 PNG inside an ICO container, content type `image/x-icon` and `image/vnd.microsoft.icon`): all load and fill the box at the three sizes (JPEG and WebP within 2 levels per channel).
- **A wrong content type for an SVG breaks it**: SVG served as `text/plain` or `application/octet-stream`, with or without `X-Content-Type-Options: nosniff`, fires `error` (the letter, on the page). A PNG served as `text/plain` still loads (sniffed), also with `nosniff`. A corrupt body with `image/png`, and an HTML body with status 200, fire `error`. This is the raw file URL of most code hosts (they serve SVG as `text/plain`): Accepted exception 1.

**2. The text of a link tile today (request 2).** `createFavoriteTile` (`src/newtab.js:475-501`): the text box `span.favorite-tile__text` exists when `cell.w === 2 || cell.h === 2` (line 492); it holds the name line, and the host line only when `cell.h === 2` (line 495). So 1×1: no text; 2×1: the name; 1×2 and 2×2: the name and the host. `button.title = item.label` (line 484) and `aria-label` `Open <label>` or `Edit <label>` (line 485) do not depend on size. In `src/newtab.css`: `.favorite-tile[data-w="2"]` is `justify-content: flex-start` with 12 px side padding (line 364); 2×2 is a column with `align-items: flex-start` (line 369); 1×2 is a centered column (line 487); the name is 13 px weight 600 (11 px at 1×2, 12 px at the 56 px cell on 2×1), the host 12 px (10 px at 1×2) in `color-mix(in srgb, var(--muted) 70%, var(--text))` (line 414-420); both lines are one line with an ellipsis except the name at 1×2 and 2×2 (3 and 2 lines).

**3. The city line today (request 3).** `createWeatherMetricTile` (`src/newtab.js:2127-2188`): `const cityName = view?.location?.name; if (cell.h === 2 && cityName) tile.appendChild(createNode("span", "weather-tile__city", cityName))` (lines 2169-2170). The city name only, not the label with the country; it exists in the ready, stale and error results that carry `location` (`src/weatherService.js:108-162`), not in loading or in the `error` result with `location: null`. The tile's `aria-label` is the metric name (`model.label`), its description (`span.sr-only[data-tooltip-text]`, the text the shared tooltip shows) is built in `src/weatherTiles.js:23-102` and names no city in any state. So hiding the city line changes the visible tile only.

**4. The dialogs today.** `createFavoriteForm` (`src/newtab.js:568-656`): rows `Link`, `Name`, `Icon`, the `Custom icon` row (shown only while Custom is checked), `Color`, `Size`, then the alert slot and the footer (lines 631-646). The Custom icon placeholder is `https://example.com/icon.png` (line 607). Edit weather (`src/newtab.js:2409-2457`): rows `City` (the city field button) and `Size`; `Save` is disabled until the size differs from the initial one (lines 2434-2438). `createFormRow` (`src/newtab.js:539-562`) points `aria-labelledby` at the first `input` or `[role="radiogroup"]` inside the control. The size control is `createSegmentedControl("size", SIZE_OPTIONS, ...)` (line 676).

**5. Storage today.** A favorite item has eleven required fields and an extra field passes (`hasOwnFields` checks required fields only, `isFavoriteWidgetItem`, `src/widgetsStore.js:69-100`); a `weather-metric` item has `id`, `type`, `enabled` (`isWeatherMetricItem`, lines 102-109). `rebase`, `moveWidget` and `updateWeatherMetric` copy an item with `{ ...item }`, so an unknown field is carried through every write (`rebase`, `src/widgetsService.js:247-257`; `moveWidget`, line 510). The name limit is `typed.length > 100` (`src/widgetsService.js:155`): UTF-16 units, so 51 emoji are refused with "up to 100 characters" (backlog 107). The icon link is trimmed, length-checked (typed and normalized, 2000), parsed and protocol-checked, but not checked for whitespace (`src/widgetsService.js:125-150`, backlog 102), unlike the main link (`normalizeFavoriteUrl`, line 98-100).

**6. The 8 KB budget (computed on a worst-case item with a script, key length included).** A link with a 1993-character link, a 1984-character host, a 2000-character icon link, a name of 100 control characters (each is `\u0001`, six bytes in JSON) and a 4-digit grid: 6924 bytes without the new fields, 6958 with `showName: false` and `showLink: false` (34 bytes). A name of 100 emoji is 6724 bytes (an emoji is four bytes raw in Chrome's JSON). A weather item with `showCity: false` is 121 bytes. All are under 8192 with more than 1200 bytes to spare (decision 1).

## Decisions

1. **Three optional boolean fields, stored only when false.** A link item may carry `showName` and `showLink`; a `weather-metric` item may carry `showCity`. A missing field means "shown". The service writes a field only when its value is `false` and removes the field when the value becomes `true`, so every item that shows everything keeps exactly the shape it has today (existing tests and seeds that compare whole items stay valid, and a link saved by an older build is valid). The validators (`isFavoriteWidgetItem`, `isWeatherMetricItem`) accept the field when it is absent or a boolean and reject any other value (an item with such a value is not a widget item, as for any malformed field). The fields are not added to the `requiredFields` list. The store reads and writes them unchanged; `rebase`, `moveWidget`, drag and resize carry them by the `{ ...item }` copy. Budget: decision 1 of `docs/link-dialog-validation.md` (about 7100 bytes) plus 34 bytes for the two fields; measured 6958 (§ Live measurement 6). The wizard's starter links and every other writer of a link stay without the fields.
2. **What a link tile shows (the table).** One pure function in `src/favoritesShared.js`, `favoriteTileText(item, { w, h })` returning `{ name: boolean, host: boolean }`, decides it; `createFavoriteTile` only draws what it says. `wantName` is `item.showName !== false`, `wantLink` is `item.showLink !== false`.
   - 1×1: `{ name: false, host: false }` whatever the switches are.
   - 2×1 (`w` 2, `h` 1): one line of room: `name = wantName`, `host = !wantName && wantLink` (the host takes the place of the name; with the name on, the link switch changes nothing).
   - 1×2 and 2×2 (`h` 2): `name = wantName`, `host = wantLink`.

   | size | name on, link on | name on, link off | name off, link on | both off |
   |------|------------------|-------------------|-------------------|----------|
   | 1×1 | icon | icon | icon | icon |
   | 2×1 | icon, name | icon, name | icon, host | icon (centered) |
   | 1×2 | icon, name, host | icon, name | icon, host | icon (centered) |
   | 2×2 | icon, name, host | icon, name | icon, host | icon (centered) |

   Both on is today's tile at every size, pixel for pixel. The host line keeps its own look wherever it stands (12 px, 10 px at 1×2, the muted mix, one line with an ellipsis); it does not take the name's weight or size when it replaces the name. The text box exists only when at least one line is drawn.
3. **A tile with no text.** `createFavoriteTile` sets `data-tile-text="none"` on the button when `favoriteTileText` returns no line at a size that has a text box (2×1, 1×2, 2×2); the icon is then centered horizontally and vertically in the tile at its own size (28, 32, 40 px), overriding the left alignment of the 2-wide tile (`src/newtab.css:364`) and the top-left column of 2×2 (line 369). 1×1 is already centered and gets no attribute. The `title`, the `aria-label` (`Open <label>` / `Edit <label>`), the `Remove <label>` badge and the tab order do not change in any variant. The cell, the grid, drag and the size of the tile never depend on the switches.
4. **The link dialog control: a checkbox variant of `.segmented`.** A new row `On tile` after `Size` in Add link and Edit link, holding one group `div.segmented.segmented--toggle[role=group]` of two options, built like a segmented option but with a checkbox: `label.segmented__option > input[type=checkbox][name=showName|showLink][aria-label] + b.segmented__label.segmented__label--check[data-text] > i.segmented__content > i.segmented__glyph.segmented__glyph--check[aria-hidden=true] + span` (the visible text is the one `span`, so the bold-face reserve and the `data-text` rule of `docs/layers-weather-polish.md` decision 12 apply unchanged). The row label is `On tile` and names the group (`createFormRow` is taught that `role="group"` is a labelled container, as `radiogroup` is, so the row label does not land on the first checkbox). Options and names:
   - visible `Name`, accessible name `Name on tile`, field `showName`;
   - visible `Link`, accessible name `Link on tile`, field `showLink`.
   Both are checked in Add link; Edit link preselects from the item (`item.showName !== false`). The group is the existing segmented geometry: 40 px outer height (`--control-height`), 1 px `--border-control` edge, 8 px radius, the two options share the width, a 1 px `--border` divider, text `--font-size-sm`. The state is cued three ways, so it never rests on colour alone: a glyph box (12 px square, 1.5 px `currentColor` border, 3 px radius, always present so the width does not change with the state) with a check mark inside while on; weight 600 while on; and the dialog's selected fill (`--soft-fill-strong`, inset 1 px `--border-control`, as `.segmented__option:has(input:checked)` in `src/surfaces.css:725-731`). In forced colors the checked option takes `Highlight` and `HighlightText` as the existing segment does (the rule at `src/surfaces.css:734-740` already matches `input:checked`), the glyph follows `currentColor`. Focus: the ring of the whole group, as for a segmented group (`src/surfaces.css:660-668` matches `.segmented:has(input:focus-visible)`), and the checkbox keeps the `scroll-margin` of `src/surfaces.css:557-566`. No new colour, radius or token; the new CSS is the glyph and its reserve in `src/controls.css`. A checkbox is a Tab stop each (two stops), Space toggles; arrow keys do not move between them (they are not radios).
   The row shows at every size, 1×1 included (decision 2 of Kier). The payload of the form carries `showName` and `showLink` as booleans (`data.has(...)`).
5. **A city label row in Edit weather.** After `City` and before `Size`: row `City label`, `createSegmentedControl("cityLabel", [["shown", "Shown"], ["hidden", "Hidden"]], ...)`, a radiogroup labelled by the row. The default and the preselection is `Shown` unless the item has `showCity: false`. The row is visible at every size and with or without a city. Save is enabled when the size or the city label differs from what the dialog opened with (it was: the size only); the payload is `{ w, h, showCity }`. `updateWeatherMetric(id, { showCity })` validates a boolean and stores it by decision 1. On a tile, `createWeatherMetricTile` draws the city line only when `item.showCity !== false` and the existing condition holds (`cell.h === 2 && cityName`); nothing else on the tile, in its description, its tooltip or its accessible name changes (§ Live measurement 3). Hiding a metric and restoring it, changing the city, resizing and dragging keep `showCity`.
6. **The custom icon hint.** The placeholder of the Custom icon field becomes `https://example.com/icon` (no extension, so no format is named; the Link field's own placeholder, `https://example.com`, is the model). No format list is shown in the dialog: a list would promise what the browser decodes, and the browser decides. Formats that draw (verified in § Live measurement 1 and by AS-TTO-16): SVG, PNG, JPEG, WebP, GIF, ICO. Nothing in how the image is drawn changes: a plain `<img>` of the typed link, the letter on `error`, no canvas read of the image (`sampleable: false`, `src/favoriteIcon.js:28`).
7. **The icon link check (closes backlog 102).** `normalizeNullableImageUrl` rejects, after the typed-length check and before parsing, whitespace inside the trimmed text, with `Enter a valid image URL` for the field `customIconUrl`; the order is the order of the main link: empty (null), typed length, whitespace, parse, normalized length, protocol. `isRealHost` is not applied to the icon link: the rule exists so that a garbage link never opens a tab, and a bad host in an icon link only ends as the letter on `error` (`createFavoriteIconNode`), so the extra rule would add a refusal and no protection. A pasted link with spaces in its path (`https://cdn.example.com/my icon.svg`, which the parser used to encode and the image to load) is now refused until typed as `my%20icon.svg`: the cost of the same rule as the main link (Ruling 3).
8. **The name limit counts characters a person sees as code points (closes backlog 107).** `normalizeLabel` compares `[...typed].length` (code points) with `LINK_LABEL_MAX_LENGTH`; the text `That name is too long (up to 100 characters)`, the constant and the fallback `domain.slice(0, 100)` (a host is ASCII after parsing) do not change. 100 emoji are accepted, 101 are refused. The budget does not move: a code point is at most six bytes in JSON (an astral one four), 100 of them are 600 bytes at most, the same as the 100 units of decision 2 of `docs/link-dialog-validation.md` assumed (§ Live measurement 6). The link and icon limits (2000) still count UTF-16 units of the typed text and of the normalized `href` (they guard bytes).
9. **Incidental cleanup (backlog 146 (10)).** The `.toLowerCase()` at the end of `typedHost` (`src/widgetsService.js:70`) has no effect: its result is compared only with a parsed host that matches `IPV4_HOST_PATTERN` (digits and dots, already lower case), and a typed host that differs in case from that cannot equal it. It is removed and the word "case-insensitively" of `docs/typography-copy.md` decision 7 and of `agent-config/CLAUDE.md` gets a superseded note; behaviour does not change (the existing `isRealHost` tests stay green).

## Ruling

- **Ruling 1: the three fields are stored only when false.** Why: every existing item, test seed and E2E comparison of whole items stays valid, the grid of a person who never opens the new rows is byte-identical, and the quota cost is zero. Cost of being wrong: none visible; a later wish for "explicit true" is a one-line change in the service.
- **Ruling 2: the link row is named `On tile`, the options `Name` and `Link`, the checkboxes `Name on tile` and `Link on tile`; the row stands after `Size`.** Why: Kier named the switches `Name` and `Link`; the dialog already has fields called `Name` and `Link`, so the row label and the accessible names say where the choice acts, and the visible text is contained in the name (WCAG 2.5.3). After `Size` because the size decides whether the text has room. Cost of being wrong: a copy change in one string and a row move.
- **Ruling 3: the icon link refuses whitespace.** Why: one rule for both links; the main link refuses it already (`docs/link-dialog-validation.md` decision 1). Cost: a person who pastes an address with a raw space in its path must write `%20`; the old behaviour (the parser encodes it) worked by accident and stays out. Existing stored icon links are already normalized (no whitespace) so an Edit Save never meets the new error.
- **Ruling 4: code points, not grapheme clusters, for the name.** Why: a code point count is what a person means by "characters" for emoji and accents in nearly all cases and it keeps a hard byte bound (600 bytes) that a grapheme count would not (a cluster can have any number of code points). Cost: a name of 15 family emoji (seven code points each) is refused at 105 code points; the error text says "characters", the common case is right.
- **Ruling 5: a host that stands in for the name on 2×1 keeps the host look.** Why: it is the same information in the same style as 1×2 and 2×2 and it keeps the 4.5:1 contrast of `docs/stale-link-and-host-contrast.md` without a second style; a name-weight host would read as a name. Cost: on 2×1 the line is lighter than a name line; a restyle is one rule.
- **Ruling 6: the custom icon placeholder is `https://example.com/icon`.** Why: no format is named and it follows the pattern of the Link field. Cost: none; the contrast tests do not read the text (`test/placeholderContrast.test.js`).
- **Ruling 7: the toggle row is built on `.segmented`, not a switch or a bare checkbox.** Why: it reuses the geometry, focus ring, forced-colors rule, bold-face reserve and narrow-window rules that the two other groups of the dialog already pass, with one new glyph; a separate switch would be a second component to measure in two themes, forced colors, 150 % fonts and a 320 px window. Cost: the control looks like the groups above it, which is the intent; a person who expects a classic checkbox sees a check mark in the option.

## Scope

- `src/favoritesShared.js`: `favoriteTileText`. `src/widgetsStore.js`: the optional boolean checks in `isFavoriteWidgetItem` and `isWeatherMetricItem`. `src/widgetsService.js`: the three fields in `addFavorite`, `addFavorites` (accepts them, the wizard passes none), `updateFavorite` and `updateWeatherMetric`; the code-point name limit; the whitespace check in `normalizeNullableImageUrl`; the `typedHost` cleanup.
- `src/newtab.js`: `createFavoriteTile`, `createFavoriteForm` (the `On tile` row and the placeholder), a toggle-group builder next to `createSegmentedControl`, `createFormRow` (`role="group"`), `readFavoriteFormPayload`, `case "edit-weather"` (the `City label` row and the Save rule), `createWeatherMetricTile`. `src/controls.css`: the check glyph and its reserve. `src/newtab.css`: `[data-tile-text="none"]` and the host line alone in a text box. `src/surfaces.css` only if a narrow-window measurement needs a rule.
- `test/`: `favoriteTileText.test.js` (new), `widgetsStore.test.js`, `widgetsService.test.js` (fields, code points, icon whitespace, the budget), `newtabSource.test.js` (the pins named in the plan, replaced and not weakened), `vocabulary.test.js` only for new class names.
- `CHANGELOG.md`, `agent-config/CLAUDE.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/privacy.md` (the stored-data list), superseded notes in `docs/tile-size-1x2.md`, `docs/link-dialog-validation.md`, `docs/placeholder-contrast.md`, `docs/typography-copy.md`.
- E2E: new `dg-94-tile-text-options.mjs`; the scenarios that measure the link or weather dialog (height, Tab order, row count) are re-run before and after and updated only where the new row is the cause, never weakened (the list is in the plan).

## Acceptance scenarios

Common setup: the E2E harness, windows 1280×800 (cell 72) unless stated; v3 desks seeded with `deskV3`, `favV3(i, grid, extra)` and `metricV3(id, grid, extra)` (the three new fields go in `extra`); links use `iconMode: "letter"` unless the scenario is about an icon, so no favicon request is involved; the weather city seed of `dg-30` and a fresh forecast cache (`weatherFixture`) where a weather tile is under test. "Tile text" is the `.favorite-tile__text` node and its two lines; "icon box" is the `.favorite-icon` or `.favorite-letter` node. Sizes are named by the `data-w` / `data-h` of the tile. A premise that depends on the page (a rect, a computed style) is read in the page and printed.

### AS-TTO-01 Everything stays as it is by default
- Given: (a) a desk of links seeded without the new fields at 1×1, 2×1, 1×2 and 2×2, a city and a weather tile at 1×2 and 2×2; (b) a fresh install, the wizard finished with starter links; (c) Add link with both switches left on.
- When: the desk is drawn, light and dark; in (c) the link is added at each size.
- Then: (a) the grid region is pixel-equal to the same desk on `RUN58_BASE` (letter icons, zero tolerance outside the tile text, which must also be equal: the same text nodes, rects and computed styles), at 1280×800 and 320×600 (cell 56); (b) no starter link item has `showName`, `showLink`; the tiles equal `RUN58_BASE`; (c) the stored item has no `showName` and no `showLink` key (the item equals the one `RUN58_BASE` stores, key for key, but for the id and times) and the tile equals the table's "both on" column.
- Verified by: E2E `dg-94` (g1, with the base build of `dg-92`'s `baseBuild` pattern); `test/widgetsService.test.js`.

### AS-TTO-02 The text of a link tile follows the table
- Given: sixteen links, one per cell of the table of decision 2 (four sizes by `showName` / `showLink` true or false), two windows: 1280×800 and 500×800.
- When: the desk is drawn.
- Then: each tile has exactly the lines the table gives and no other: the name line is `item.label`, the host line is `item.domain`, both through text nodes; 1×1 has no text box; where the host replaces the name on 2×1 the node is `.favorite-tile__host` (computed font size 12 px, weight 400, colour `color-mix(...)` of `--muted` and `--text`, one line, `text-overflow: ellipsis`) and is vertically centred in the tile (±1 px); in the other cells the lines are the ones of `RUN58_BASE` (computed font sizes, weights and line clamps equal). The icon box has the size of the tile's size (28, 28, 32, 40) in every cell. The text box and icon are inside the tile (no overflow). A pure-function check lists the same 16 results from `favoriteTileText`.
- Verified by: E2E `dg-94` (g2); `test/favoriteTileText.test.js`; `newtabSource` pin (`createFavoriteTile` draws from `favoriteTileText`).

### AS-TTO-03 A tile with no text shows the icon centered
- Given: links at 1×1, 2×1, 1×2, 2×2 with both switches off, in normal mode and in edit mode, 1280×800.
- When: the desk is drawn.
- Then: no `.favorite-tile__text` node; on 2×1, 1×2, 2×2 the tile has `data-tile-text="none"`, on 1×1 it has none; the centre of the icon box equals the centre of the tile (±1 px, both axes) at every size; the icon box is 28, 28, 32, 40 px; `title` is the label and the `aria-label` is `Open <label>` (normal) or `Edit <label>` (edit mode); in edit mode the `Remove <label>` badge is present; Tab visits the tile once; a click opens the link (normal) or the dialog (edit mode) as before.
- Verified by: E2E `dg-94` (g2).

### AS-TTO-04 Long text and the narrowest cell
- Given: 320×600 (cell 56) and 1280×800; links whose name is 100 characters and whose host is 60 characters, at 2×1, 1×2 and 2×2, in the states name on / link off, name off / link on, both on.
- When: the desk is drawn.
- Then: every line stays inside the tile (`scrollWidth <= clientWidth` of the line or an ellipsis that fits: `text-overflow` set and the node's box inside the tile's content box), the host alone is one line, the name keeps its clamp (3 lines at 1×2, 2 at 2×2, one at 2×1), the tile's size and the grid's row and column count equal those of the same links with both on, and a host alone never wraps. The starter labels of `dg-72` (cell 56) still fit on one line with both switches on.
- Verified by: E2E `dg-94` (g3).

### AS-TTO-05 The setting travels with the tile
- Given: a 1×1 link with `showName: false`; a 2×1 link with `showLink: false` and a 1×2 link with both false.
- When: (a) the 1×1 link is resized to 2×1 and to 2×2 through Edit link; (b) the tiles are dragged; (c) the page is reloaded; (d) the link is edited in another tab and the first tab is shown again (`docs/tab-return-refresh.md`); (e) a link with `showName: false` is edited and Name is switched on again.
- Then: (a) after resizing the tile shows the host (name off, link on, as the table says) and the stored item keeps `showName: false` and gains nothing else; (b) a drag changes only the grid, the stored fields stay; (c) the tiles draw the same text; (d) the other tab's tile text updates on return with no other change; (e) after Save the stored item has no `showName` key and the tile shows the name.
- Verified by: E2E `dg-94` (g4); `test/widgetsService.test.js`.

### AS-TTO-06 The `On tile` row in Add link and Edit link
- Given: Add link opened; Edit link opened on a link with no fields, on one with `showName: false`, on one with both false.
- When: the dialog is read; each switch is toggled; Add and Save are pressed.
- Then: the row `On tile` stands after `Size` and before the alert slot and the footer; it holds one `[role=group]` named `On tile` with two checkboxes whose accessible names are `Name on tile` and `Link on tile`, visible texts `Name` and `Link`; in Add link both are checked; in Edit link each reflects the item (`showName` absent or true is checked); the accessibility tree has the group and two checkboxes with their checked state; the row is present at every size selection including 1×1. Add with `Name` unchecked stores `showName: false` and no `showLink` key; with both unchecked stores both `false`; Save with a changed switch stores or removes the key (a switch turned back on removes the key and the item equals one that never had it); the payload of an Add or Save with no change to the row writes no new key. The other rows' rects in the dialog (Link, Name, Icon, Custom icon, Color, Size) are unchanged from `RUN58_BASE` (±0.5 px) and the dialog is one row (the row's box) taller.
- Verified by: E2E `dg-94` (g5); `newtabSource` pins (the row, `createFormRow` and `role="group"`, `readFavoriteFormPayload`).

### AS-TTO-07 The `On tile` row from the keyboard
- Given: the Add link and Edit link dialogs, 1280×800 and 500×800.
- When: Tab from the Size group; Space on a focused checkbox; ArrowLeft, ArrowRight, ArrowUp, ArrowDown on it; Shift+Tab back; Tab to the end; Escape.
- Then: Tab from Size lands on `Name on tile`, then `Link on tile`, then Cancel, then Save, and Tab from Save wraps to the Link field `url` (the existing wrap points; the cycle of the Add link dialog is now ten stops: `url label iconMode backgroundColorSource backgroundColor size showName showLink` then Cancel and Save); Space toggles only the focused checkbox, with its `checked` state and the check mark; arrow keys do not change either checkbox and do not move focus; Shift+Tab reverses the order; the focus ring is the ring of the whole group (`box-shadow` of the `.segmented`, `outline` transparent), whole inside the dialog in both scroll positions; Escape closes the dialog and writes nothing.
- Verified by: E2E `dg-94` (g5).

### AS-TTO-08 The new control: look, size and contrast
- Given: Add link at 1280×800 and 500×800, light and dark, and with `forcedColors: "active"`; the four states of the pair (off/off, on/off, off/on, on/on); the focus on each option; a profile with the browser font at 150 % (`profileWithFont(…, 24)`).
- When: the group is measured.
- Then: the group is 40 px high (`min-height`, the options 38) at the default font; the two options have the same width in every state (the bold-face reserve; ±0.5 px) and each option is at least 24 px by 24 px (WCAG 2.5.8; the measure is far above); the unchecked text and glyph keep at least 4.5:1 against the panel (the glyph box edge at least 3:1), the checked text keeps `--text` against `--soft-fill-strong`; a checked option shows a check mark and a heavier weight (computed `font-weight` 600), an unchecked one shows the empty box and weight 400, so the state is readable in a greyscale capture; in forced colors the checked option's background is `Highlight` and its text `HighlightText`, the glyph box and mark follow `currentColor` and both states stay distinguishable; the focus ring has at least 3:1 against the panel in both themes; at 150 % a label that wraps grows the whole group (nothing is clipped; `scrollWidth <= clientWidth` of each option), and the row stacks (label above control) below 400 px (600 px at 150 %), like the other groups.
- Verified by: E2E `dg-94` (g6); `test/focusTokens.test.js` stays green (the ring is the existing one).

### AS-TTO-09 Narrow and low windows
- Given: Add link and Edit link at 500×800, 320×600, 1280×600 and 500×400, the Custom icon row shown and hidden.
- When: the dialog opens; the new row is reached by Tab and by Space; Save is pressed.
- Then: no horizontal scroll of the page or of the dialog; the row stacks its label above the control at 320 px; the dialog either fits (`scrollHeight <= clientHeight + 1`) or scrolls inside (`data-scrolls="true"`, sticky footer, the two buttons reachable and fully visible after scrolling to the end); a focused checkbox in a scrolling dialog is scrolled into view with its ring whole (5 px of room, `scroll-margin`); the page status chip does not cover the row. The printed premise is the measured `scrollHeight` and `clientHeight` per window.
- Verified by: E2E `dg-94` (g7).

### AS-TTO-10 Fast actions, a failed write and recovery
- Given: Edit link on a link; the sync write refused once (`failStorageInit` on `set`); a stale tab whose link was deleted in another tab.
- When: (a) both switches are toggled ten times in a row then Save; (b) Save is double-clicked; (c) a switch is toggled then Cancel; (d) Save with the write refused, then Save again with the write allowed; (e) Save in the stale tab.
- Then: (a) the stored fields equal the final state of the switches (one write, no key for a `true`); (b) one write and one dialog close; (c) nothing is written and the tile is unchanged; (d) the dialog stays open with the existing alert text in `[data-dialog-error]`, the switches keep the person's choice, the second Save succeeds and stores it; (e) the existing recovery runs (`This link was deleted in another tab.`), the dialog closes, no switch state leaks into another tile.
- Verified by: E2E `dg-94` (g8).

### AS-TTO-11 Big data and the 8 KB limit
- Given: 200 links, half with `showName: false`, a quarter with both false, mixed sizes; and one link with a 2000-character link, a 2000-character icon link, a 100-character name of emoji and both switches off.
- When: the desk is drawn; the big link is added (Add link) and then edited and saved.
- Then: the grid draws all 200 tiles with the text the table gives, no error chip, no Sync text; the big link saves without the Chrome Sync text in Add and in Edit; its stored size (key included) is under 8192 bytes with at least 1000 to spare (the unit test prints the number: the measured worst case is 6958); the sync write of the whole desk stays within the existing rules.
- Verified by: E2E `dg-94` (g9); `test/widgetsService.test.js` (the byte budget, computed on the stored item).

### AS-TTO-12 The `City label` row in Edit weather
- Given: Edit weather opened on a ready temperature tile with a city, on one with `showCity: false`, and with no city; at 1280×800, 500×800, 320×600.
- When: the dialog is read and the row is changed; Save and Cancel are used; the keyboard walks the dialog.
- Then: the dialog shows `City` (the city field), then `City label` with a radiogroup of `Shown` and `Hidden`, then `Size`, then the footer; `Shown` is checked unless the item has `showCity: false`; the row is there at 1×1, 2×1, 1×2, 2×2 and with no city; `Save` is disabled until the size or the city label differs from its opening value and is enabled again after either changes (and disabled again when both are back to the opening values); Save with `Hidden` stores `showCity: false` and nothing else changes (grid, `enabled`); Save with `Shown` on an item that had `false` removes the key; ArrowLeft/Right move the radio like the other groups; Tab order is city field, the label group (one stop), the size group (one stop), Cancel, Save; Cancel writes nothing; the row stacks below 400 px.
- Verified by: E2E `dg-94` (g10); `newtabSource` pins.

### AS-TTO-13 The city line on tiles
- Given: ready tiles for all four metrics at 1×1, 2×1, 1×2 and 2×2 with `showCity` absent, and the same with `showCity: false`; also a stale tile, an error tile with a city, an error tile with no city and a loading tile at 1×2.
- When: the desk is drawn.
- Then: with the field absent the tiles equal `RUN58_BASE` (the grid region is pixel-equal at 1280×800 and 320×600, text, rects and styles); with `false` there is no `.weather-tile__city` node in any state at any size and everything else in the tile (glyph, primary and secondary text, tone, retry glyph) has the same rect and text as with the city shown (±0.5 px); the `aria-label`, `aria-describedby` target text and the shared tooltip text are the same in both settings (the tooltip is read by hovering a tile and by focusing it); the city name is still in storage and still in the Edit weather dialog's city field.
- Verified by: E2E `dg-94` (g10).

### AS-TTO-14 The city label is per tile and survives other actions
- Given: temperature `showCity: false`, the other three shown, all at 1×2.
- When: the city is changed through the modal; the temperature tile is hidden and restored from the Add menu; it is resized to 2×2 and dragged; the page is reloaded; the weather tiles are shown after a city is first chosen (no city at start).
- Then: only the temperature tile hides the city line, in every case above; the setting is kept through hide and restore, resize, drag and reload; changing the city writes nothing to the metric items; the hint tile (no city) is unchanged and the setting is not lost while it stands in.
- Verified by: E2E `dg-94` (g10).

### AS-TTO-15 The custom icon hint
- Given: Add link and Edit link with Custom checked, light and dark, 1280×800 and 320×600.
- When: the Custom icon field is empty.
- Then: its placeholder is `https://example.com/icon`; no placeholder names a format; the contrast of the placeholder is unchanged (the existing rule, `test/placeholderContrast.test.js` and `dg-50`); the Link field's placeholder is unchanged.
- Verified by: E2E `dg-94` (g11); `newtabSource` pin.

### AS-TTO-16 Every common image format draws on every tile size
- Given: links with `iconMode: "custom"` whose icon links are served by the harness route (`context.route`, as `dg-79` does): SVG with only a `viewBox`, SVG with `width` and `height` of 512, SVG with neither, SVG with a 2:1 `viewBox`, PNG, JPEG, WebP, GIF, ICO (`image/x-icon`); each at 1×1, 2×1, 1×2 and 2×2. The bytes are built in the scenario: the SVGs from text, PNG with the `solidPng` writer, JPEG and WebP from `canvas.toBlob` in a scratch page, GIF a fixed 1×1 literal, ICO a header wrapped around a 16 px PNG. Colours are a solid red.
- When: the desk is drawn and the images load.
- Then: each tile shows an `img.favorite-icon` (not a letter) with `naturalWidth > 0`, `complete` true, `data-icon-source="custom"`; its box is 28, 28, 32, 40 px; a screenshot pixel 1 px inside each corner and at the centre of the box is the fixture colour (JPEG and WebP within 2 levels per channel) for the four square fixtures and for the SVG without a size; for the 2:1 SVG the corners are the tile's background and the centre is red (a contained band); the tile's name, `title` and tab order are unchanged by the format.
- Verified by: E2E `dg-94` (g12).

### AS-TTO-17 An unreadable image gives the letter
- Given: custom icon links that answer with a corrupt body (`image/png`), an HTML body with status 200, status 404, an aborted request, and an SVG served as `text/plain` and as `application/octet-stream`.
- When: the desk is drawn and the requests settle.
- Then: each tile shows the letter icon (`.favorite-letter`, the first letter of the name, the same node as for a failed favicon) and no `img`; no broken-image glyph is drawn (the icon box has the letter's pixels); the tile's size, name and `title` are unchanged; a following valid link on the same desk still draws its image.
- Verified by: E2E `dg-94` (g12).

### AS-TTO-18 The icon link check
- Given: Add link with Custom checked; Edit link on a link with a custom icon.
- When: the icon link is `https://cdn.example.com/my icon.svg`; `https://cdn.example.com/a\ticon.png`; `  https://cdn.example.com/icon.svg  ` (outer spaces); `cdn.example.com/icon.png` (no scheme); `https://cdn.example.com/my%20icon.svg`; a 2001-character link with a space inside; a 2000-character valid link; `ftp://x/i.png`; `http://`.
- Then: the 2001-character spaced link shows `That icon link is too long (up to 2000 characters)` (the typed-length check is first); the first two links (a space, a tab) show `Enter a valid image URL`; all three in the dialog's alert slot with `aria-invalid="true"` on the field, `aria-describedby` set, the focus on the Custom icon field (the Custom radio is checked if it was not), nothing written; the outer-space link is trimmed and saved; the scheme-less link is saved as `https://cdn.example.com/icon.png`; the `%20` link is saved; the 2000-character link is saved; the last two show their existing texts (`Only http and https image URLs are supported`, `Enter a valid image URL`). The main link and name rules are unchanged.
- Verified by: E2E `dg-94` (g11); `test/widgetsService.test.js` (every row of the list).

### AS-TTO-19 The name limit counts characters
- Given: Add link and Edit link; names of 100 emoji, 101 emoji, 51 emoji, 100 ASCII letters, 101 ASCII letters, 100 code points made of a letter and a combining accent pairs (50 pairs), and an empty name.
- When: Add and Save are pressed.
- Then: 100 emoji, 51 emoji, 100 letters and the 50 pairs are saved (the stored label equals the typed text); 101 emoji and 101 letters show `That name is too long (up to 100 characters)` with the focus on Name and nothing written; the empty name stores the host cut to 100; an Edit of a saved 100-emoji name pressing Save without a change succeeds; the Chrome Sync text never shows (the budget of AS-TTO-11).
- Verified by: E2E `dg-94` (g11); `test/widgetsService.test.js`.

### AS-TTO-20 Texts
- The new strings are: the row label `On tile`; the option texts `Name` and `Link` and the accessible names `Name on tile` and `Link on tile`; the row label `City label` and the option texts `Shown` and `Hidden`; the Custom icon placeholder `https://example.com/icon`; three internal validation messages, not reachable from the dialogs: `Choose whether the tile shows its name`, `Choose whether the tile shows its link`, `Choose whether the weather tile shows the city`. They stand in the link dialogs (Add link and Edit link), the Edit weather dialog and the Custom icon field, and in no other state. No other string changes; the existing icon, link and name errors keep their texts (`Enter a valid image URL`, `That name is too long (up to 100 characters)`). `test/vocabulary.test.js` stays green (the words are link, tile, name, city; class names that are new go on its allowlist only if they contain a listed word).
- Verified by: `test/vocabulary.test.js`; E2E `dg-94` (g5, g10, g11 read the visible strings).

### AS-TTO-21 Storage shape and validators
- Given: items with and without the three fields.
- When: `isWidgetsState` and the store read and write them.
- Then: an item without the fields is valid; `showName` / `showLink` / `showCity` are valid as `true` or `false` (never written as `true` by the service); any other value (a string, a number, `null`) makes the item invalid (a read drops it like any malformed item, a write is refused with `Invalid grid state`); the fields are carried through `setState`, `getState`, `ensureWidgetsLayout` (a missing system tile is created without them), `moveWidget`, resize and a restore; the stored shape of every other field is unchanged; no migration is run.
- Verified by: `test/widgetsStore.test.js`, `test/widgetsService.test.js`; E2E `dg-94` (g4, g10) reads the stored items.

### AS-TTO-22 Security and privacy are not relaxed
- Given: a custom icon link and the new rows.
- When: the dialog and the grid are built and an SVG icon is loaded.
- Then: every user string (the name, the host, the city) reaches the DOM through `textContent` (a name `<img src=x onerror=...>` shows as text with both switches in any state); the only `innerHTML` is still `icons.js`; the custom image is a plain `<img>` (an SVG icon cannot run script and requests nothing but itself); it is never read through a canvas (`resolveAutoBackgroundColor` takes the domain fallback for a custom icon, `sampleable: false`); no new permission, host or request appears (the network log of the scenario has the image request and nothing new); `docs/privacy.md` lists the new stored settings.
- Verified by: E2E `dg-94` (g12 network log, g2 name `<img ...>`); `newtabSource` pins; `test/privacyDocs.test.js` stays green.

## Review focus

1. Scenarios: the table of decision 2 at all sixteen cells and the 2×1 rule (the host takes the name's place only when the name is off); the setting surviving a resize, drag, reload and another tab; the stored-only-when-false rule (a toggle back to on removes the key); the failure path of Save with the new row; the 200-link and the byte budget; the formats on every size and the content-type exception.
2. Visual: the new group next to the two existing groups (same height, divider, fill, ring; the check mark cue in both themes and forced colors; no width jump between states); the icon centered with no text on 2×1 and 2×2; the host alone on 2×1, 1×2, 2×2 (weight, size, contrast on every accent); the cell 56 case; the stacked row at 320 px and at 150 % font.
3. Accessibility and texts: the group's name and each checkbox's name (WCAG 2.5.3: the visible `Name` is contained in `Name on tile`); the Tab order (ten stops in Add link, no radio-style arrows on the checkboxes); the state not resting on colour; the target size; `Open <label>` / `Edit <label>` unchanged with no text; the Edit weather Save rule; no new string with a banned word.

## Accepted exceptions

1. An SVG served with a content type other than an image one (most code hosts serve a raw `.svg` as `text/plain`) shows the letter, because the browser refuses it as an image (§ Live measurement 1). The fix is a link to a host that serves `image/svg+xml`. No check of the content type or of the bytes is added: it would be a request and a parser for a case the letter already covers; the dialog does not promise formats (decision 6).
2. The host that replaces the name on 2×1 is lighter than a name would be (Ruling 5).
3. A pasted icon link with a raw space is refused (Ruling 3).
4. A name of grapheme clusters made of many code points counts per code point (Ruling 4).
5. With both switches off a person has no visible text but the tile still carries `title` and the accessible name; a tile of the same colour and a letter icon can then look alike. The hover title is the cue; not changed here (decision 4 of Kier).
6. The switches and the city label are not synced as a pair with the size: choosing a size does not reset them, so a hidden name on a 1×1 tile returns hidden on a later 2×1 (Kier's decision 2).

## Non-goals

- Uploading an icon file, converting or validating image bytes or content types, cropping or scaling an icon, an icon format list in the UI, any change to how the icon is drawn.
- A global setting ("hide the names everywhere"), a bulk "apply to all tiles" action, a per-size setting.
- Hiding other tile text: a weather tile's glyph, value or secondary line, the metric name, the hint tile's text, the Settings and Add tiles.
- Showing the full address instead of the host, or the city label with its country, on a tile.
- A change to the tile sizes, the grid engine, the 1×1 tile, drag or the Add menu.
- The title (`title` attribute) and the accessible names of tiles.
- A migration, an upgrade scenario, a new dependency, a background script, a new permission.
- The name limit for the typed link or the icon link (they stay UTF-16 units of the text and of the `href`); `isRealHost` for the icon link.
