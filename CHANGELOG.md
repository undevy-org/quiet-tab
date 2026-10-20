# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- The Nominatim `User-Agent` rule (`rules/nominatim-user-agent.json`) now matches only requests made by Quiet Tab
  itself: the manifest pins the extension id with a `key` (id `dbcdpffdgfbjmdlomgheeijfkkjkhmma`, the one the Chrome Web Store draft gave) and the
  rule has `initiatorDomains` set to that id. Before, a page on any host the extension has permission for (for
  example the Open-Meteo hosts) could make a request to Nominatim carry the Quiet Tab `User-Agent`. The pinned
  `key` must be removed from the zip uploaded to the Web Store (`docs/architecture.md`, "Extension id"). E2E
  `dg-63-nominatim-ua-wire.mjs` reads the header on the wire.

### Changed

- Typography: text in inputs, buttons, descriptions, the Add menu and the city suggestions is 14 px (it was 12 px, the browser's default for an
  extension page); the dialogs, the first-run wizard, the city modal, the shared tooltip and the status chip are now sized in `rem` and follow Chrome's
  "Font size" setting, while tile text, the cell and the control geometry stay in px. A segmented option grows with a wrapped label ("From site" at
  150 %) instead of being cut, and dialog rows stack (label above the control) up to 600 px wide at 150 % (400 px at the default size). The city modal and
  the first-run wizard are about 3 px taller at the default size (`docs/typography-copy.md` decisions 1-3, `docs/design-system.md`).
- One vocabulary: a saved site is a link, a square of the grid is a tile and the whole board is the grid. The page landmark is named `Grid`
  (not `Widgets`), and the messages that said "favorites" or "widgets" say links, tiles or the grid: `You can save up to 200 links`,
  `Chrome APIs for the grid are unavailable.`, and the three messages about saved data (a newer version, unreadable data, a failed Sync write).
  The two texts that used a hyphen as a dash use an em dash: the ensure-failure chip (`Couldn't add the weather and settings
  tiles — Chrome Sync may be full or unavailable. …`) and a stale tile (`Couldn't refresh — showing saved data. …`). Stored data and code
  names do not change (`docs/typography-copy.md` decisions 4 and 5).
- The 1×1 "Set a city" tile, which shows only a map pin, now names itself in the shared tooltip (`Set a city`) on hover and on keyboard focus in
  normal mode; its accessible name is unchanged and it has no title. The wider and taller hints already show their words and get no tooltip
  (`docs/typography-copy.md` decision 6).
- Link addresses: a host that cannot name a site is now refused with `Enter a valid URL` in Add link and Edit link: an empty
  label (`a..b`, `.com`), a label that begins or ends with `-` or has no letter or digit (`-a.com`, `_`), and an IPv4 address the browser
  expands from a short form (`1`, `127.1`, `2130706433`, `0x7f.0.0.1`, `192.168.001.1`, `192.168.0.1.`); an address typed in full
  (`192.168.0.1`, also behind credentials, a port or a path) and every real name keep working. A link saved earlier stays on the grid and opens;
  its Edit dialog asks for a valid address before it saves (`docs/typography-copy.md` decision 7, `docs/link-dialog-validation.md`).
- Weather reliability: the first load of a new tab now gives up after 15 s like a city change or a retry, so tiles
  no longer stay on `…` forever and become the retryable error tiles instead; a stale tile's tooltip and screen-reader
  description say how old the data is (`Updated 2 h ago`); a forecast that arrives after the city was changed no longer
  overwrites the saved weather of the new city; a city that could not be saved shows `Couldn't save your city. Try again
  in a moment.`; and after a successful first load the city is known again for the city modal and the weather dialog
  (`docs/weather-reliability.md`).
- Layers and low windows: the status message no longer shows through the backdrop of a dialog, the city modal or the
  wizard, and while it is on screen the page keeps room below the last row so tiles can be scrolled clear of it. A dialog
  taller than the window keeps Cancel and Save at its bottom edge (a divider appears only while it scrolls), keeps a
  focused control's ring and a shown error in view, and closing a dialog no longer scrolls the page by itself. The city
  modal stacked over the weather dialog hides the lower card, and several focus rings (title, starter list, "use your
  location") and the remove badge at the narrowest grid are no longer cut or covered (`docs/layers-low-window.md`).
  E2E: `dg-86-layers-low-window.mjs`.

- City suggestion list (modal and wizard step 1) is an ARIA 1.2 combobox with a listbox of options. Tab skips the
  suggestions (clear, Cancel or Skip, Save); arrow keys enter the list. The focus ring of "use your location" now
  reaches 3 px beyond the link text and no longer covers a neighbouring character (`docs/city-suggestion-list.md`).

### Added

- Size segments show the footprint as a small outline rectangle (width × height) before 1×1 / 1×2 / 2×1 / 2×2, and each Size radio has an accessible name that starts with the visible label (`1×2, 1 wide, 2 high`); the selected dialog segment keeps its mark in forced colors (`forced-color-adjust: none`, `Highlight`). E2E `dg-66-tile-size-followups.mjs` covers the glyphs, the tone contrast table, dark theme, forced colors and two open tabs; unit tests cover 1×2 tiles at the edges of the layout engine (docs/tile-size-followups.md).
- Fourth tile size 1×2 (tall) for links, weather tiles and the city hint: Size control 1×1 / 1×2 / 2×1 / 2×2; a 1×2 link shows icon, label and host; a 1×2 weather tile stacks glyph, value and city (docs/tile-size-1x2.md).
- **Use your location** in the first-run wizard (step 1) and the change-mode city modal: tap the link to
  fill the city field from the browser position (Continue/Save still required). E2E: `dg-62-use-my-location.mjs`.
- Host permission for Nominatim (`nominatim.openstreetmap.org`) for reverse geocoding on that tap only,
  and the `declarativeNetRequestWithHostAccess` permission with one static rule
  (`rules/nominatim-user-agent.json`) that sets the identifying `User-Agent` header on requests to that host
  only (the OpenStreetMap usage policy requires it; Chrome ignores the header when set from `fetch`). Documented
  in the README and the store privacy disclosure.
- Test: a geolocation prompt answered after more than 8 s still ends with the city filled, not "Couldn't look up
  your city" (the 8 s reverse timer starts when the position arrives). E2E `dg-62-use-my-location.mjs` (AS-UL-26)
  and a source assertion in `test/newtabSource.test.js`.
- Add link dialog includes a Size row (default 1×1); 2×2 link tiles center the favicon or letter
  horizontally while labels stay left-aligned. E2E: `dg-61-link-tile-polish.mjs`.
- First-run onboarding wizard: two steps (city, then starter links), progress pills, and
  `quietTabOnboardingWizardComplete` in local storage. The change-mode city modal is unchanged.
  E2E: `dg-60-onboarding-wizard.mjs`; existing first-run scenarios adapted.
- The desk starts from the middle of the window. The grid always has an even number of
  columns, a fresh install puts the weather, Settings and Add tiles in the center of
  the row, widening or narrowing the window keeps the tiles around the center, and
  layouts saved by the earlier development layout are moved to the center once on the
  first open. Weather tiles of an upgraded legacy layout are placed as one block
  below the links. E2E: `dg-57-centered-grid.mjs`.
- First run: while the onboarding wizard is open, the page behind it is empty (no links,
  Settings, Add or hint tile); they appear with a soft fade when the wizard finishes, also
  for users who already have links. The wizard opens before the page is drawn, so no tile
  flashes first. E2E: `dg-56-first-run-empty-desk.mjs`.
- Weather tiles: a tile that could not load, or that shows saved (stale) data, can now be pressed
  to try again, from the tile itself with the mouse, Enter or Space. It repeats once for all
  tiles, shows a small refresh sign in its corner and a spinner while it works, waits a few
  seconds after a failure before the next try, and says why it failed in the status line
  ("Can't reach the weather service..."). When it works, the tiles update and "Weather updated"
  is announced. Fresh tiles have no refresh control. E2E: `dg-54-weather-tile-retry.mjs`.
- Hide weather metric now asks first. Pressing − on a weather tile in edit mode opens
  "Hide temperature?" (or precipitation, air quality, UV index) with Cancel and Hide; the
  tile is hidden only after Hide, and "Temperature hidden" (and so on) is announced. The
  hide button uses an eye-off icon, so it is not mistaken for Delete link. E2E:
  `dg-58-modal-overlay.mjs`.
- Edit weather: the city row is a single field that shows the city with a "Change" hint
  (or "No city set" and "Set a city") and opens the city window; it replaces the
  "Change city" text button.
- Change city: the field is now filled with the current city, with the cursor at the end,
  so Save without editing keeps it and Clear starts a new search.

### Removed

- The "Current: …" line in the Change city window, the extra space kept under the city
  field for an error, and the Delete button in the Edit link dialog (links are still
  deleted with − in edit mode).
- The migration code (legacy favorites → widgets v1 → v2 → v3) and its upgrade tests.
  Data of earlier versions is ignored: the old favorites keys are neither read nor
  deleted, and a v1 or v2 widgets layout is read as unsupported, like a damaged one
  (an empty read-only desk, nothing is written). Quiet Tab has no users on those
  versions (`docs/remove-migrations.md`).

### Fixed

- Drag and scrolling (`docs/drag-scroll-target.md`): the drop outline now follows every scroll of the page during a drag (wheel,
  keys, scrollbar), not only the pointer, and a release writes to the cell under the pointer.
- A tile dropped on a page scrolled to its bottom lands on its outline: the page keeps the height its scroll position needs until you scroll
  up out of it, instead of the browser shifting everything down by the rows the drop freed. E2E: `dg-87-drag-scroll-target.mjs`.
- City modal (`docs/city-modal-focus-copy.md`): changing the city is saved only after the forecast has loaded. A failed forecast or
  geocoding keeps the modal open with the error, the focused field and the old city, cache and tiles (the first-run wizard keeps saving
  the city first). Save without a change is Cancel: no request, no write. After a successful Save focus goes to the weather tile of the
  hint (or the dialog's City field, else Settings) and the page announces `City set to <city>`; while the request runs focus stays on the
  modal title, also after a press on the backdrop or a disabled control.
- Repeated announcements ("Link deleted", "UV index hidden", "Weather updated") are read again: the live region is cleared and the text is
  set on the next frame.
- Weather edit dialog: with no city the City field is one muted line `Set a city` (accessible name `City Set a city`) instead of
  `No city set` plus a hint.
- Use your location: while the position is looked up the description line is only `Finding your location…` (no more "…or Finding your
  location…."); the link's focus ring has padding and the control radius.
- Onboarding step 2: the locked starter list is a keyboard stop (`tabindex="0"`, name `Starter links`, visible ring) so it can be
  scrolled with the arrow keys; the second press of a double click right after the wizard or the city modal closes no longer moves focus.
- Link dialog (`docs/link-dialog-validation.md`): an address with a space or an invalid host (`not a url !!`, `example.com/a b`) is rejected with
  "Enter a valid URL" in Add and Edit; a link longer than 2000 characters, a name longer than 100 and a custom icon link longer than 2000 get a
  plain message instead of the Chrome Sync text (an empty name falls back to the host cut to 100); the field with an error carries `aria-invalid`
  and `aria-describedby` (nothing visible changes) and the Add tile `aria-controls` while its menu is open; a new link whose tile is off screen
  is scrolled to (smooth, instant with reduced motion) and gets a 2 s ring. E2E: `dg-83-link-dialog-validation.mjs`.
- First-run wizard polish (`docs/onboarding-wizard-polish.md`): a second pointer click right after the wizard or the city modal closes (the second click of a double click on Finish, Cancel, Save) no longer lands on the link under the button (a 300 ms click guard; keyboard activation is not guarded); Finish focuses Settings without scrolling the page (also after Escape or the backdrop on step 2; a re-render no longer re-focuses with a scroll); once the starter links are written and only the completion flag failed, the starter rows are locked (dimmed, not focusable) instead of silently losing a new check; the progress pills have the accessible name "Step 1 of 2" / "Step 2 of 2". E2E `dg-82-onboarding-wizard-polish.mjs`; `dg-65` group 7 and `docs/post-onboarding-grid.md` AS-POG-07 are superseded (no scroll to bring Settings' ring into a short window).
- A link whose site Chrome has no cached icon shows the letter on the colored tile instead of Chrome's grey globe (grid tiles,
  onboarding rows and the automatic tile color); a real icon is kept; if the check cannot run, the icon stays as it is
  (`docs/favicon-globe-fallback.md`).
- After a failed onboarding **Finish** (the add error or the completion-flag error) the focus returns to the Finish button instead of the
  page, so Enter retries (`docs/post-onboarding-followups.md`).
- If this tab cannot read the saved desk back right after the onboarding links were written, Finish closes and the persistent "Couldn't
  restore your layout. Reload this tab." message shows, instead of the add error and a stale desk; a retry no longer adds anything.
- Link tile labels fit one line at the narrowest cell (56 px, windows up to 360 px): on a 1×2 tile the side padding is 3 px and the label 10 px
  ("YouTube", "ChatGPT", "Amazon" no longer break in the middle of the word); the 2×1 label is 12 px ("ChatGPT" no longer overflows by a pixel).

- A focused tile keeps its focus ring inside the window: tiles carry `scroll-margin: 6px`, so focusing a tile at the window edge scrolls enough to show the ring (except Settings after Finish, which is focused without scrolling since run 42).
- The failure message of a stale tab that could not restore its layout now has a **Reload** button and goes away on Escape; the notice `Your layout was reset in another tab.` is shown in a neutral colour (errors stay red). Finishing the first-run wizard on a storage another tab cleared now keeps the starter links and restores Settings and Add. After such a restore the tab drops a weather city it still held in memory (the hint tile stands in the first cell, as after a reload). Low-window and rejected-second-write cases are specified and covered (docs/stale-tab-closeout.md). E2E `dg-71-stale-tab-closeout.mjs`.
- A tab that was open while another tab cleared the extension storage no longer stays broken when it hides or restores a weather tile, saves a weather tile's size or adds a link: those actions now heal the layout like a deleted-link recovery does (Settings and Add come back, an added link is kept) and say `Your layout was reset in another tab.`. If another tab healed the storage in the meantime the tab shows that layout. If the heal fails, the tab shows `Couldn't restore your layout. Reload this tab.` (stays until you reload or act), leaves edit mode and puts focus on the desk instead of `body` (docs/stale-tab-recovery-followups.md). E2E `dg-70-stale-tab-recovery-followups.mjs`.
- A tab that was open while another tab cleared the extension storage no longer ends its recovery from a deleted link with an empty grid: when the re-read finds no Settings tile, the desk is healed like a fresh install (Settings, Add and the weather tiles come back in the cells of the current window) and focus goes to Settings (docs/stale-tab-empty-state.md). If that fails the grid stays empty until a reload. E2E `dg-68-stale-tab-empty-state.mjs`.
- A tab that was open while another tab deleted a link no longer shows `Favorite not found` on Save, on Delete or on a drop of that link: it re-reads storage, closes the dialog, redraws the grid without the link, moves focus to the neighbouring tile and says `This link was deleted in another tab.` (alert status). E2E `dg-67-stale-link-and-host-contrast.mjs` (docs/stale-link-and-host-contrast.md).
- The host line of a link tile is a little closer to the text color (`color-mix(in srgb, var(--muted) 70%, var(--text))`): it was 4.09–4.31:1 on the red, black and dark accents in the light theme, and `dg-67` now asserts at least 4.5:1 for every accent, size and theme.
- City modal: when you move through the city suggestions with the arrow keys or Tab and
  the list (or the dialog, in a short window) scrolls, the focus ring is no longer cut off
  on its top or bottom edge. This also covers the field and the clear button, and the
  stronger outline used in forced-colors mode. E2E: `dg-52-docked-list-focus-ring.mjs`.
- Link forms: the hint text inside the empty fields (Link, Name, Custom icon, in both
  Add link and Edit link) is darker, so it is readable in light and dark themes,
  including when the field is focused. The city field already looked like this; now
  all fields share one rule. E2E: `dg-50-placeholder-contrast.mjs`.
- City modal: in a very short browser window, or at a large zoom, the Save button and
  the Cancel (or Not now) button no longer fall below the edge, so you see them without
  scrolling. E2E: `dg-48-city-modal-low-window.mjs`.
- City modal: the red error message now disappears as soon as you start editing the
  city name (or press the clear button), instead of lingering under the suggestions.
  E2E: `dg-47-city-error-ux.mjs`.
- Network failures in the city flow no longer show the browser's raw "Failed to fetch"
  (or developer text such as a status code). The city modal and the weather tiles
  show a calm, fixed message by kind of failure: can't reach the service, the
  service isn't responding, request took too long, or a generic fallback. Save is
  still the retry; the typed city is kept. E2E: `dg-45-city-network-error.mjs`.
- While no city is set, the 1×1 "Set a city" hint now shows a map pin, so the
  grid has one plus icon (Add) instead of two. The wide hint keeps its text.
- Dragging a tile in edit mode: the drop outline is drawn only at the cell being
  judged and no longer jumps to a neighbouring free cell. A block that does not
  fit at the right edge, or lies below the allowed rows, snaps to the nearest
  allowed cell and the outline is drawn there; only an occupied cell shows the
  dashed error outline (the drop is rejected and writes nothing).
- Dragging a tile in edit mode now works over the whole window: the columns fill
  the window width (an even count, so one edge column can go to the margins), every row of the first screen is a drop target (below it a
  tile can still go one row below the lowest tile), and a pointer in the side
  margins, above the grid or below the last row targets the nearest allowed cell.
  Only an occupied cell is invalid, and a drop inside the window never makes the
  page scroll. E2E: `dg-55-drag-whole-window.mjs`.

### Changed

- Light theme: the replacement letter and the pending chip on grid tiles now have a visible quiet fill (new token `--letter-fill`, 6% black in light; the dark theme keeps 12% white). Before, the fill was almost invisible on a pale tile (E2E `dg-80-light-letter-fill.mjs`, `docs/light-letter-fill.md`).
- Favicon check (grid tiles and onboarding step 2): while the default-icon check runs, the icon box shows a quiet neutral chip (the fill and radius of the replacement letter, no glyph, no globe pixel) instead of an empty box, and the replacement letter is hidden from assistive technology (`aria-hidden`; the tile and row names are unchanged). E2E `dg-79-favicon-letter-pending.mjs` (run 37, `docs/favicon-letter-pending.md`, backlog 84 and 86).
- Onboarding step 2: in the dark theme a favicon gets a quiet 1 px outline (`--icon-outline`) in checked rows, so a favicon with its own dark plate keeps its shape against the panel (run 36, `docs/favicon-outline.md`; E2E: new `dg-78-favicon-outline.mjs`).

- Onboarding step 2, dark theme: a favicon now sits on a light backdrop (new token `--icon-backdrop`, `#eef1f5` in the dark theme, transparent in the light one) so a dark icon stays readable on the dark panel; the run 33 row CSS was tidied without changing any computed style (`docs/starter-rows-icon-chip.md`). A white favicon with a transparent background is weaker on the backdrop (accepted). E2E: new `dg-76-starter-rows-icon-chip.mjs`.

- Onboarding step 2 polish (run 33, `docs/starter-rows-polish.md`): an enabled starter row gets a hover fill (`--soft-fill`, the letter chip `--soft-fill-strong`; pointer devices only, no transition); an unchecked row keeps the dialog colour and only its icon turns grey (the dark-theme grey block is gone; a letter icon stays at `opacity` 0.6 so it keeps 3:1 against its chip); the rows are muted (`opacity` 0.62, cursor `wait`) while Finish writes; the progress pills get a border and a `Highlight` fill under forced colors. E2E: new `dg-75-starter-rows-polish.mjs`; `buildFromRef` now copies `rules/`, so `ctx.base` and the `01-upgrade` baseline open a tab.

- Onboarding step 2: each starter link is one full-width row (icon, name, the check on the right) that looks like a grid link tile, and the whole row toggles. An unchecked row turns grey while its name and check keep their contrast; the focus ring is drawn inside the row so the scrolling list does not clip it. E2E: `dg-73-onboarding-starter-rows.mjs`. (the grey surface of an unchecked row is superseded by run 33 above)
- After the first-run wizard's Finish on a fresh desk, the six system tiles and the starter links form one solid island, centered once (horizontally on the center line, vertically in the first screen), instead of a strip with the links scattered by free-spot search. The tile sizes per link count are fixed (1 to 8 links; no links gives a 3×3 island with a tall temperature tile). A desk that is not fresh (links already there, a hidden or resized weather tile) or a window narrower than the island keeps the old 2×1 placement; reload and resize never re-pack. E2E: `dg-65-post-onboarding-grid.mjs`; spec `docs/post-onboarding-grid.md`.
- The city line and the metric glyph of a toned weather tile use the full text color (they were muted: 2.59:1 on a rain-5 tile); the dialog segments (Icon, Color, Size) use `padding: 0 5px` and no wrapping up to 451 px windows (was 6 px up to 400 px), and the Size shape glyph uses unit 4 px there.
- Tiles no longer carry the data-tile-size attribute; layout CSS uses data-w / data-h only.
- The six starting tiles (the four weather tiles, Settings and Add) now appear in the
  middle of the first screen, not at its top. This happens only at their first
  appearance; moving them afterwards is unchanged, and a window of another height
  opened later does not move them. E2E: `dg-59-vertically-centered-defaults.mjs`.
- Dialogs and the city window share one footer: two buttons of equal width with icons
  (Cancel or Not now on the left, Add, Save, Delete or Hide on the right), 16px under the
  content, with no divider line above. Form rows have no divider lines and 10px padding;
  the selected option of Icon, Color and Size is a soft fill with a ring instead of the
  primary color. An error in the city window now sits 8px under the field and 16px above
  the buttons, so the window grows when it appears (the earlier reserved space and the
  low-window shrinking of it are gone). E2E: `dg-58-modal-overlay.mjs`.
- Borders of text fields, the color field, the segmented control, the Settings and Add
  tiles and the first-run "Set a city" tile are darker so they meet 3:1 contrast
  (WCAG 1.4.11) in light and dark. Card edges and dividers keep their quiet look.
- The outline of Cancel, Not now and the other secondary buttons in dialogs is darker, so
  it meets 3:1 contrast (WCAG 1.4.11) in light and dark, like the fields above them.
  Save, Delete and the hover color look the same; a focused Cancel keeps its focus ring
  and fill, and its outline is darker too. E2E: `dg-51-button-border-contrast.mjs`.
- Design system phase 2: grid and page chrome in `newtab.css` use tokens from
  `design-tokens.css` (tile and drop-highlight radii, status chip padding and
  shadow, tooltip shadow, grid spacing `--space-grid-*`, weather cell font sizes,
  body/status typography; the page status chip now uses line-height 1.4 like dialog
  status text, previously 1.45). Grid engine, tile focus rules, and overlay CSS are
  unchanged. E2E metrics: `dg-42-grid-chrome-metrics.mjs`.

- Design system phase 1: overlay styles split into `design-tokens.css`,
  `controls.css`, and `surfaces.css` (loaded before `newtab.css`). Dialogs, the
  city modal, and the Add menu use a unified 40px control height and 8px control
  radius; city modal title spacing matches desktop dialogs (12px below the title).
  City suggestion rows keep 8px of vertical padding, so a long name that wraps
  does not touch the row edges. The Add menu shadow uses the shared popover
  shadow (18% instead of 20% opacity).

### Fixed

- Delete buttons (Edit link, Delete link?) show their red border and text again;
  the base `.button` rule had been overriding the `.button--danger` modifier.

### Added

- A full-window, macOS-style desktop grid replaces the favorites toolbar: links,
  weather tiles and two fixed tiles (Settings and Add) sit on a 2D grid of
  1×1, 2×1 or 2×2 cells. The number of columns follows the window (2 or more, no upper limit) and a
  narrower window repacks the tiles for display only; widening it restores your
  arrangement.
- Edit mode: the Settings tile turns it on (Settings again, Escape or a click on
  the background turns it off). The tiles jiggle, a − badge deletes a link (with a
  confirmation) or hides a weather tile, and any tile can be dragged to a free cell
  with a drop highlight (an occupied or out-of-range cell is rejected and the tile
  slides back).
- Dialogs for adding and editing a link (address, name, icon, color, size), a
  weather edit dialog (size, and the city through the city modal), and an Add menu
  in edit mode that restores hidden weather tiles. A new link takes the free
  cell nearest to the center of the first row that has one.
- A page status line reports a change that could not be saved; nothing is
  half-applied.
- Weather tiles in the same grid as your links: temperature, precipitation, air
  quality and UV index can be resized, moved, hidden and shown (live weather data
  stays in its own storage). They are added automatically on the first open after
  updating and are safe to run from several tabs at once.
- A dismissible city modal that opens on a new tab when no city is set and at
  least one weather tile is shown. It opens once: any way of closing it
  (Not now, Escape, or a click outside) stops it from returning on that device.
  It is also opened by the "Set a city" tile (shown while no city is set, unless
  all four weather tiles are hidden) and by the weather edit dialog.
- A live city suggestion dropdown in the city modal: typing two or more
  characters shows matching cities from Open-Meteo's geocoding search;
  selecting one fills the field, and Save then stores it without a second
  geocoding request. Free-text entry and Save still work exactly as before.
- A shared tooltip layer for the weather tiles.
- README badge linking to the [Chrome Web Store listing](https://chromewebstore.google.com/detail/quiet-tab/dbcdpffdgfbjmdlomgheeijfkkjkhmma).

### Changed

- Favorites are stored in a new widgets layout (`quietTabWidgetsMeta` /
  `quietTabWidget:<id>`, layout version 3) where every widget stores its own cell
  (`grid: { x, y, w, h }`, with `x` counted from the center line of the grid). A widget whose cell is missing or broken is kept and
  placed at the free cell nearest to the center instead of being dropped.
- The Settings and Add tiles are restored automatically if they are ever missing
  from the synced layout.
- Tiles take their size from the grid cell (72px, 64px on windows up to 600px
  wide, 56px up to 360px), links and weather tiles alike.
- The standalone weather panel is gone: the weather is shown in the grid's weather
  tiles, and the city is set in the city modal instead of a form.
- In the city modal a failed city search keeps what you typed, the field and
  buttons are disabled while a request runs, and an empty city name shows a
  message instead of doing nothing. Suggestions open as a popover over the dialog
  (the dialog does not move), with full-width Not now/Cancel and Save below the
  field, a clear button and arrow-key selection.
- The grid is labelled "Widgets" for assistive technology.
- Tooltips are edge-aware: one shared layer that stays fully inside the window,
  flips below a tile that is near the top, and is shown in normal mode only (not
  in edit mode or while dragging). Escape hides it before anything else except an
  active drag. After a re-render a tooltip may reappear on the tile under a
  stationary pointer in real Chrome (the tile is new and is the current one under
  the pointer).
- Weather tiles show a loading ("…") and an unavailable ("—") state without moving
  the grid; tiles showing saved data after a failed refresh get a dashed border.
- Widgets written by a newer version of Quiet Tab (for example synced from another
  device) are never overwritten: this build shows a message, keeps the grid
  read-only and writes nothing.
- Add/edit errors (for example the 200-favorites limit) show inside the dialog,
  and keyboard focus returns to the tile that opened a dialog when it closes.
- Keyboard focus is clearly visible on the grid tiles, the − badge, the Add menu
  and the controls of the link, weather and delete dialogs (contrast of at least
  3:1, also in edit mode and with reduced motion).
- The link, weather and delete dialogs fit a 320 px window; in the Edit link
  dialog the buttons wrap onto two rows at 400 px and below so Save is never cut
  off. The colour field has an accessible name.

### Notes

- Update Quiet Tab on every device that shares your Chrome Sync. Version 0.1.0 does
  not read the new layout, so a device still on 0.1.0 shows no links until it is
  updated. The updated version does not read or convert the favorites that 0.1.0
  stored (the migration was removed, see Removed above): it starts from a fresh desk.
- If you update with no city set, the city modal appears once on your next new tab.
  Leaving that tab without closing the modal does not count as closing it, so it
  appears again on the next new tab. The choice to close it is remembered per
  device, not synced.

## [0.1.0] - 2026-09-27

### Added

- Initial public release of Quiet Tab: a favorites toolbar and a local
  weather panel on the new tab page. Forked from a personal news-queue
  extension, with the news feature removed entirely and every remaining
  string translated to English.

[0.1.0]: https://github.com/undevy-org/quiet-tab/releases/tag/v0.1.0
