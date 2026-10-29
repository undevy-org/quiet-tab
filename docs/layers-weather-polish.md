# Layers, weather and large font: quiet defects of dialogs, texts and requests of the weather, a steady segmented group

## Status

`draft` - revision 1 (2026-10-30, stage 0 of run 53 `layers-weather-polish`). One run, two rows of the roadmap queue: row Р53 ("Тихие дефекты слоёв, погоды и долг в `src/`", part A below) and row Р54 ("Погода: тексты и запросы; крупный шрифт", part B below). Backlog items 128, 129, 130, 138 (future `fetchedAt` only), 167 (b), 161 (1)(3), 165 (the comments of `src/desktopLayout.js`), 167 (`const metaKind` and the comment of `resetUnreadableWidgets`) for part A; 140, 156, 143, 147 and 148 (L2-01 only) for part B. Triage below is by reading `origin/main` at `848effd` (run 51 merged, run 52 changed only the notes repo); the first step of the kickoff re-checks every item on `origin/main` before any edit.

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). Nothing stored changes: no key, no field, no schema. Part B stops one kind of read-only network request (decision 9) and writes nothing new.

Related: `docs/layers-low-window.md` (decisions 6, 7, 9, 12 and 13: the error slot, the reveal, the ring, the chip reserve, the sticky footer; items 128, 129, 130 follow them), `docs/onboarding-wizard-polish.md` (the locked starter list), `docs/unreadable-grid-reset.md` (the Reset grid dialog, item 167), `docs/weather-reliability.md` (the cache rule and the stale description, decisions 3 and 4), `docs/tab-return-refresh.md` (decisions 1 to 4 and Accepted exception 18, which part B reverses by a decision of Kier), `docs/typography-copy.md` (decision 3 and Accepted exception 5: the larger font in the segmented groups), `docs/privacy.md` and `test/privacyDocs.test.js` (the Background Activity section and its pin); code: `src/newtab.js`, `src/newtab.css`, `src/surfaces.css`, `src/controls.css`, `src/weatherService.js`, `src/weatherTiles.js`, `src/desktopLayout.js`, `src/widgetsStore.js`.

Visual reference: none drawn. The figures of the earlier reviews are quoted where they are the reference (item 147: the dialog height jumps by 9.1 to 11.5 px at 20 to 21 px; item 148 L2-01: the label box is 56.5 px against a 40 px field and the row 76 px against 60); step 1 of the kickoff measures them again on `origin/main`.

## Terms

- **The error slot**: `[data-dialog-error]` (`role="alert"`) of a `.desktop-dialog`. **The footer**: `.favorite-form__footer`, sticky while the dialog scrolls (`docs/layers-low-window.md` decision 13). **Scrolls**: `data-scrolls="true"` on the dialog.
- **The chip**: `#desktop-status`. **The reserve**: `--status-reserve` on `:root`, px, the distance from the window bottom to the chip's top while the chip exists (decision 12 of the layers spec).
- **Gone-link recovery**: `recoverFromGoneLink` (a write on a link or tile another tab deleted, or a cleared storage healed).
- **The locked list**: the wizard's starter list after Finish when the flag write was refused (`data-starters-locked="true"`, a keyboard scroll stop).
- **A shown weather tile**: in the displayed state at least one item with `type: "weather-metric"` and `enabled: true`. The city hint tile stands for an enabled metric, so it counts. A tab whose grid is unreadable or newer has no items and so no shown tile.
- **Fresh cache**: `0 <= now - fetchedAt < WEATHER_CACHE_TTL_MS` (30 minutes, `src/weatherShared.js`) for the same city (decision 4).
- **Due**: `weatherRefreshDue(result, now)` (`src/weatherUiState.js`): an `error`, a `stale`, or a `ready` result whose data is 30 minutes old or more. Unchanged.
- **The stale state**: a weather result with `status: "stale"` (saved data, the last fetch failed), also while an attempt retries.
- **A group**: a `.segmented` radiogroup (Icon, Color, Size in Add link and Edit link; Size in Edit weather). **An option**: a `.segmented__option`.
- **Beside layout**: a form row whose label stands left of its control (`.favorite-form__row` as a flex row); under the stacking media queries of `src/surfaces.css` (the block at `max-width: 400px, 25rem`) and `src/controls.css` the label stands above the control.

## Intake log

Queue row Р53 and Р54 of `roadmap.md` (`kickoffs/queue-52-56-sessions.md`), no questions to Kier at stage 0: his answers are given. Decisions of Kier, taken as given:

- **2026-10-29, Q1 A (items 143, 147, 148 L2-01), the larger font in the segmented groups:** reserve the width of the bold face for the selected option and add vertical room to a wrapped label; at the default font the look does not change. Not chosen: B (the selected option stops being bold in dialogs), C (leave it, Accepted exception 5 of `docs/typography-copy.md`).
- **2026-10-29, Q2 A (item 140, S3-01):** in the stale state the temperature reads `Last known: 21°` (the temperature of the data); a fresh tile keeps `Currently`. Hanging words (`text-wrap: pretty`) are decided without a question. The sentence "Try again in a moment" stays (Ruling 2 of backlog row 136, accepted below).
- **2026-10-29, Q3 A (item 156), no tile, no request:** with no shown weather tile there is no request at open, at a return or at `online`; when a tile appears, one request if the cache is older than 30 minutes; `docs/privacy.md` and its pin are corrected. This reverses the Ruling of Accepted exception 18 of `docs/tab-return-refresh.md`.
- **2026-10-30, "Оставить все"** (answer to the orchestrator's question about backlog rows 115 to 118, 120 to 125, 131, 136, 141, 152, 158, 162, 169): every earlier `Ruling (марафон, на проверку Киру)` stands in the product. Those rows are closed in the notes repo; nothing of them enters this run.
- **Orchestrator decision, 2026-10-29 (row Р53, item 167 b):** only the redundant redraw under the Reset grid dialog is removed; the second announcement of the `p[role=alert]` when the dialog closes (item 170, point 2) stays "Не в очереди".
- Items 128, 129 and 130 follow decisions 6, 7 and 12 of `docs/layers-low-window.md` (roadmap row Р53, "Решения Кира": none new).

Everything else below is decided by the author. Three choices are marked `Ruling (марафон, на проверку Киру)` (decisions 1, 10 and Accepted exception 2); `backlog.md` row 179 asks Kier to check them.

## Triage (reading `main`)

| Item | Reproduces by reading? | Where |
|------|------------------------|-------|
| 128 a resize with a shown error leaves the slot under the footer | yes | `watchDialogScrolls` observes the dialog and its form and its callback only runs `syncDialogScrolls` (the `data-scrolls` flag); `scrollDialogErrorIntoView` runs once, from `showDialogError`. Nothing scrolls the slot back after a resize that makes the dialog scroll (320×480 to 1280×800 and back: `scrollTop` 0, the slot lower than the footer). |
| 129 the neighbour of a gone link can land under the chip | yes | `recoverFromGoneLink` reveals through `closeDesktopDialog({ reveal: true })` or `focusWidgetTarget(..., { reveal: true })` and only then calls `showDesktopStatus(error.message)`. `isSafelyInsideWindow` and the root `scroll-padding-bottom` read `--status-reserve`, which is written by a `ResizeObserver` on the chip, that is after the next layout: the reveal sees 0. Moving the `showDesktopStatus` call earlier is not enough by itself. |
| 130 the ring of the locked list is cut by the scrolling card | yes | `src/surfaces.css`: `.onboarding-wizard__starters[data-starters-locked="true"]:focus-visible` is `outline: 2px` with `outline-offset: 0`, outside the list's box; the `scroll-margin: 5px` rule of the city modal covers `button, input, .weather-form__suggestion` only, so the card scrolls the list to its own edge and the outline is clipped. |
| 138 a cache from the future counts as fresh | yes | `isCacheFresh` in `src/weatherService.js`: `now - cache.fetchedAt < WEATHER_CACHE_TTL_MS`, true for a negative difference (the clock moved back). The other half of item 138 ("city changed during the fetch, then the fetch fails" has no unit test) is a test gap and belongs to row Р55; step 1 only probes it. |
| 167 (b) the refused reset redraws the screen under its dialog | yes | `resetGrid` catch: `finishFavoritesAction(generation, () => {})` always ends in `renderFavorites()`, which rebuilds `.grid-unreadable` and its `p[role=alert]` (`createStatus(..., { live: "assertive" })`) once more before the chip text. |
| 161 (1), (3); 165 comments; 167 `metaKind` and the comment | yes | `healReadDesk` takes the busy lock without `try/finally`; `const downgrade = failed && ... && weatherResult?.data` is an object or false; `centeredDefaultRow` has the formula twice and a "Callers:" line; the `viewportRows` comment reads badly; the load calls `inspectWidgetsMeta(rawMeta)` twice; `resetUnreadableWidgets` names "Accepted exception 2" by number. No visible effect. |
| 140 "Currently" on stale data; hanging words | yes | `readyModel` in `src/weatherTiles.js` builds `Currently <t>°.` for every state and `describeWeatherMetric` prefixes `STALE_PREFIX` and the age sentence to it; `grep text-wrap src/*.css` finds nothing. |
| 156 weather requests with no shown tile | yes | `startWeather` and `retryWeather` (`src/newtab.js`) and `weatherRefreshDue` (`src/weatherUiState.js`) never look at the items; Accepted exception 18 of `docs/tab-return-refresh.md` records it as a Ruling. |
| 143, 147, 148 L2-01 a bold selected option wraps, the others do not; a wrapped label has no vertical room | yes | `.segmented__option` is `flex: 1` (equal widths) and `:has(input:checked)` sets `font-weight: var(--font-weight-control)` (600); the height of a group is the tallest option, so choosing "From site" at 20 to 21 px adds a line. `.favorite-form__row-label` is a fixed `--form-label-width` 100 px column; "Custom icon" is 108 px wide at 24 px and wraps. |

A row that does not reproduce at step 1 is closed in `backlog.md` with the command and output and leaves the scope; the PR is not widened.

## Live measurement (step 1 of the kickoff, on `origin/main`)

The numbers are filled in the kickoff report `pipeline/reports/layers-weather-polish-repro.md`, not here. What step 1 measures, and what the reviews already reported:

| Item | Measure | Reported before |
|------|---------|-----------------|
| 128 | 320×480, Add link with a bad URL shown, resize to 1280×800 and back; slot and footer rectangles, `scrollTop` | slot below the footer, `scrollTop` 0 (checkpoint L1-02 of run 46) |
| 129 | gone-link recovery in a low window with the chip: neighbour's bottom against the chip's top, `--status-reserve` read before and after the reveal | neighbour under the chip (final code review of run 46) |
| 130 | wizard step 2, flag write refused, 1280×300, Tab to the list; visible ring px on each side | 0 of 2 px at the top (1280×300), at the bottom (500×360, 500×300) |
| 138 | unit: a cache with a future `fetchedAt` is served without a request; unit probe "city changed, then the fetch fails" | the first is true by reading |
| 167 (b) | refused reset: count of rebuilds of `.grid-unreadable` and of inserted `p[role=alert]` between the confirm and the end | one extra rebuild, by reading |
| 140 | the stale tooltip at 320 px and the city save error at 320 px: the last line | `22°.` and `moment.` alone on a line (final of run 48) |
| 156 | all metrics hidden, a city set, the clock moved: Open-Meteo requests at open, return, `online` | more than 0 |
| 147 | Add link height as Icon changes at 16, 20, 21, 24 px | 9.1 to 11.5 px at 20 to 21 px, none at 16 and 24 (run 49) |
| 148 L2-01 | Custom icon row at 24 px, 1280×800 and 601×800 | label box 56.5 px, row 76 against 60 px, dialog 544 against 496 px |

## Decisions

### Part A (row Р53): quiet defects of layers, weather and code

1. **A shown error follows a window resize (item 128).** After a window `resize` (a zoom fires it too), one animation frame after the dialog's size observer has updated `data-scrolls`, if the dialog shows its error slot (not hidden) and scrolls, and the slot's bottom plus its 5 px margin lies below the footer's top edge, the dialog scrolls instantly by the rule of decision 6 of `docs/layers-low-window.md`: the same function, the same two branches (field and slot together if they fit, else the slot wins), the target being the field named by `aria-invalid` or the submit button. If the slot is already above the footer nothing moves. A change of the dialog's content (the Icon switch showing the Custom icon row, a font load) is not a trigger: it keeps the behaviour of `main`. The focus, `aria-invalid`, `aria-describedby` and the text do not change. **Ruling (марафон, на проверку Киру): the trigger is the window resize only; альтернатива: every size change of the dialog or its form (the Icon switch would also pull the slot back); цена ошибки: after switching Icon to Custom in a scrolling dialog with a shown error the slot may stay under the footer until the next scroll (as on `main`), with the alternative the dialog moves under a user who has just clicked a control.**
2. **The reserve is current before the reveal (item 129).** In both branches of `recoverFromGoneLink` (with a dialog and without; a healed storage included) the status text is shown before focus and reveal, and showing the chip writes `--status-reserve` at once (the chip's border-box height plus `--status-chip-offset-bottom`, read after the text is set, which forces the layout) instead of waiting for the observer. So `isSafelyInsideWindow` and the root `scroll-padding-bottom` see the chip when the neighbour is revealed: the neighbour (or Settings after a heal) ends at least 6 px inside the window and above the chip (decision 7 of the layers spec, unchanged). The observer stays and writes the same value later. A chip shown while the dialog is still in the DOM is unpainted but keeps its reserve (decision 2 of the layers spec), so showing it first changes nothing the user sees. No other caller changes.
3. **Ring room for the locked list (item 130).** `scroll-margin: 5px` on the locked list, a literal with the same reason as the city modal's rule (the widest ring is the forced-colors outline, 2 px + 2 px offset = 4 px, plus one pixel for integer scroll offsets). The ring itself stays: the solid `--focus-ring` outline, 2 px, offset 0, outside the list's box (decision 9 of the layers spec); the candidate "inset ring over the rows" of backlog row 130 is not taken because that spec chose a ring that rows cannot cover.
4. **A cache from the future is not fresh (item 138).** `isCacheFresh` needs `0 <= now - fetchedAt < WEATHER_CACHE_TTL_MS`. A cache whose `fetchedAt` is later than `now` (the clock moved back) is fetched again at open like an old one; if that fetch fails the result is `stale` with that cache, as for any old cache. `weatherRefreshDue` already treats a future `fetchedAt` as not due and `formatUpdatedAge` reads a negative age as "Updated just now"; both stay.
5. **A refused reset does not redraw (item 167 b).** In `resetGrid`'s catch the busy flag is released without a render: the unreadable screen is not rebuilt and its `p[role=alert]` is not inserted again. The rest of the catch stays: the dialog closes with the post-close guard, focus goes to the screen's Reset grid button, the chip says `Couldn't reset your grid. Try again in a moment.` (decision 6 of `docs/unreadable-grid-reset.md`, AS-UGR-12). The re-announcement of the alert when the dialog closes is outside this run (item 170, point 2).
6. **Code with no visible effect (items 161, 165, 167).** (a) `healReadDesk` releases the busy lock in a `finally`. (b) In `retryWeather` `downgrade` is a boolean (`Boolean(...)`). (c) `src/desktopLayout.js`: the sentence "The same value is max(0, floor((min(rows, CEILING_REFERENCE_ROWS) - blockRows) / 2))" and the "Callers: ..." line leave the comment of `centeredDefaultRow` (the formula stays once, in the code and the first sentences); the `viewportRows` comment says "`centeredDefaultRow` counts a window of more than CEILING_REFERENCE_ROWS rows as CEILING_REFERENCE_ROWS rows". (d) The load in `newtab.js` computes `const metaKind = inspectWidgetsMeta(rawMeta)` once and uses it for the `newer` and the `invalid` exits. (e) The comment of `resetUnreadableWidgets` in `src/widgetsStore.js` names the accepted window between the `get` and the `remove` by what it is, not by "Accepted exception 2". The source pins of `test/newtabSource.test.js` and `test/weatherSource.test.js` that match the old text move with it (the number of `it(` does not drop: the pre-push hook).

### Part B (row Р54): weather texts and requests, a steady segmented group

7. **A stale tile says "Last known" (item 140, Q2 A).** `readyModel` in `src/weatherTiles.js` knows whether the data is stale. For the temperature metric in the stale state, including the stale state while an attempt retries, the sentence `Currently <t>°.` becomes `Last known: <t>°.`; the rest of the sentence (`Today at 15:00`, `yesterday at 15:00`) and the whole order stay: `STALE_PREFIX`, the age sentence (when there is one), `Last known: <t>°.`, the rest. A ready tile keeps `Currently <t>°.`; an error tile is unchanged. The model's `description` feeds the hidden description and the tooltip, so both change together. The other three metrics have no such word, except UV (Accepted exception 2).
8. **No lone word at the end of a message (item 140).** `text-wrap: pretty` on the shared `.tooltip`, on the error slot of the city modal and the wizard (`.city-modal .status--full`), and on the page chip `.desktop-status`. These are the elements whose last line showed `22°.` and `moment.` at 320 px. It changes only where a break falls in a text that wraps. If, in the Chromium of the harness, `pretty` leaves one of the two measured cases with a lone word, the same elements get `text-wrap: balance` instead (their texts are a few lines). The sentence "Try again in a moment" stays (Ruling 2 of row 136).
9. **No shown tile, no weather request (item 156, Q3 A).** A request to Open-Meteo for the stored city (the forecast and the air quality) is made only while the displayed state has a shown weather tile. That gates three entries: the load at open (`startWeather`), the automatic attempt at a return and at `online` (`retryWeather({ automatic: true })`, so `weatherRefreshDue` is not even asked), and the manual attempt (a retry press needs a tile). Not gated, because they act from a tile or the wizard: choosing or changing the city (`setCity`, `selectLocation`). Reading the stored city and cache from storage is not a request and may stay. With no shown tile nothing is drawn, announced or written because of the weather: no status text, no cache write.
10. **A tile that appears asks once, when due (item 156, Q3 A).** When the displayed state changes from no shown weather tile to at least one (restoring a metric through the Add menu, a grid re-read that applies another tab's change, a heal), the weather is loaded once: if the tab holds no result yet, the load of open (`weatherService.initialize()`: a cache younger than 30 minutes is served with no request, otherwise one forecast and one air-quality request); if it holds a result, the automatic attempt of a return, which runs only when the result is due. A result that is not due is shown at once with no request. At most one attempt is in flight (the in-flight guard and the 3 s pause of `weatherUiState` apply as before). The tiles show the loading state until the answer. Mechanism is the plan's; the hook must be one place that every route of a changed state passes. **Ruling (марафон, на проверку Киру): a returning tile uses the held result when it is not due, and does not always re-read the cache; альтернатива: always call `initialize()` when a tile appears (a cache read, a flash of loading); цена ошибки: a tile shows data up to 30 minutes old that another tab has already refreshed, with the alternative the tile flashes its loading state on every restore.**
11. **Documents say so (item 156).** `docs/privacy.md`, Background Activity: a weather request happens only while at least one weather tile is shown, and then only in these cases: a new tab opens with a chosen city and no saved weather for it from the last 30 minutes; you come back to a tab that is already open and its weather failed to load or is 30 minutes old or more; the browser reports that the network is back while the tab is visible and its weather is in that state; a weather tile is shown again and its weather is missing or 30 minutes old or more; you press a weather tile to try again; you explicitly change the city. The "no background polling" sentences stay. `test/privacyDocs.test.js` pins the new sentence. `docs/tab-return-refresh.md`: Accepted exception 18 and its Review-rounds line L1-03 get a "Changed by run 53" note in the style of the notes of earlier runs (the Ruling is reversed by Kier's decision of 2026-10-29), decision 2 gets one sentence; the text of its other decisions stays history. `CHANGELOG.md` `[Unreleased]` gets the behaviour changes of both parts.
12. **A segmented group does not change height with its choice, and a wrapped label has room (items 143, 147, 148 L2-01, Q1 A).**
    - **Reserve for the bold face.** Each option lays its label out as if it were bold in every state: the label's width for wrapping and the option's height come from the bold face, while an unselected option still shows the regular face. So the number of lines of every option, and the height of the group, are the same whichever option is selected. The look at the default font is unchanged (nothing wraps there).
    - **Vertical room.** A label that wraps has 4 px above and below its text: `padding-block: 4px` on `.segmented__option`, and on `.favorite-form__row-label` in the beside layout only. Padding of 4 px is invisible where the label does not wrap, because the option's `min-height` (38 px) and the field (40 px) are taller than one line plus 8 px; in the stacked layout (label above its control) the row has no control height to hide it, so the stacked row label gets none and a one-line row there is unchanged. 4 px clears the 3 px inset focus ring of an option (`outline: 3px`, offset -3px).
    - The wrap of the "Custom icon" row label in its 100 px column is not removed (decision 3 and Accepted exception 5 of `docs/typography-copy.md` keep the column); it only gets room. Mechanism is the plan's. The candidate for the reserve is a hidden bold copy of the label stacked in the same grid cell as the visible text (generated content from a `data-` attribute, `visibility: hidden`); the trap to avoid is a copy that cannot wrap, because its width would become each option's minimum width and the group would be clipped by its `overflow: hidden` at 320 px. The label text itself stays a `textContent` node, the accessible names and the Tab order do not change.

## Scope

Changes (stage 4, in this order of risk): `src/newtab.js` (decisions 1, 2, 5, 6 a, b, d, 9, 10; the resize handler, `showDesktopStatus`, `recoverFromGoneLink`, `resetGrid`, `healReadDesk`, `retryWeather`, `startWeather`, the load, the segmented builder only if the reserve needs an attribute), `src/surfaces.css` (3, 8, 12), `src/newtab.css` (8), `src/controls.css` (12), `src/weatherService.js` (4), `src/weatherTiles.js` (7), `src/desktopLayout.js` and `src/widgetsStore.js` (comments only, 6), `docs/privacy.md`, `docs/tab-return-refresh.md`, `docs/weather-reliability.md`, `docs/weather-tile-retry.md`, `docs/typography-copy.md` (the stale sentence and the wrapped label, only where a sentence is now false), `CHANGELOG.md`, tests (`test/weatherTiles.test.js`, `test/weatherService.test.js`, `test/weatherSource.test.js`, `test/newtabSource.test.js`, `test/privacyDocs.test.js`, and a unit file for the shown-tile rule if the plan extracts it as a pure function), and the E2E `dg-92-layers-weather-polish.mjs` plus the edits of earlier scenarios listed below. Everything else is untouched.

### Texts

| String | Where it is shown | State |
|--------|-------------------|-------|
| `Last known: <t>°.` | hidden description and tooltip of the temperature tile | stale (also while retrying): replaces `Currently <t>°.` |
| `Currently <t>°.` | the same | ready: unchanged |
| the rest of the descriptions, `Couldn't reset your grid. Try again in a moment.`, `Couldn't save your city. Try again in a moment.` | as before | unchanged |
| the Background Activity paragraph of `docs/privacy.md` | the document | changed by decision 11 |

## Acceptance scenarios

Premises that depend on the machine (window sizes, counts of links, the clock) are printed by the scenario and asserted before the action, as in `dg-86`. Light and dark themes where a ring or a pixel is compared.

### AS-QDL-01 A shown error follows a window resize (decision 1, item 128)
- Given: Add link at 320×480 with a bad URL (`Enter a valid URL`) shown by Save pressed on Enter in the field; the dialog scrolls and the slot is above the footer (premise printed: `scrollTop`, slot and footer rectangles). Then the window grows to 1280×800 (the dialog fits, `scrollTop` 0) and shrinks to 320×480 again. A second case: the same dialog at 1280×800 with the error shown, then the window shrinks to 1280×300. A third case in Edit link at 320×480.
- When: the resize settles (two animation frames after the last `resize`).
- Then: `data-scrolls="true"`; the slot is inside the scrollport and its bottom plus 5 px is at or above the footer's top edge (±1 px); `scrollTop` is greater than 0; the field still has focus and keeps `aria-invalid="true"` and `aria-describedby` to the slot; the text is the same; the dialog moved in one step (no intermediate `scrollTop` frame). Controls: a resize with no error shown moves nothing (`scrollTop` unchanged); a resize after which the slot is already above the footer moves nothing (±1 px); switching Icon to Custom in a scrolling dialog with a shown error does not scroll by itself (Accepted exception 2, printed, not asserted beyond "no scroll step by the Icon switch").
- Verified by: E2E `dg-92`; `dg-86` AS-LLW-06 and `dg-83` stay green.

### AS-QDL-02 A gone-link recovery reveals above the chip (decision 2, item 129)
- Given: 188 links at 1280×600 (as AS-LLW-14), two tabs, the link deleted in the second tab. Case 1 (dialog): in the first tab Save of an edit of that link, the neighbour that takes the focus wholly below the window (premise printed from the grid cells). Case 2 (no dialog): a drop of that link's tile on a free cell. Case 3: the storage cleared in the other tab and a Save in the first (the heal; Settings takes the focus and the info chip shows). Each prints `--status-reserve` read in the same task as the reveal.
- When: the recovery settles.
- Then: the chip is visible with the message of `main` (`This link was deleted in another tab.` for cases 1 and 2, `Your layout was reset in another tab.` for case 3); the focused tile is fully inside the window, at least 6 px from the top and its bottom at least 6 px above the chip's top edge (±1 px); the reserve read at the reveal equals the final reserve; `scrollY` grew by at most the overhang plus the chip's reserve plus 6 px (+1) in one step, never above the starting `scrollY`. On `origin/main` the neighbour's bottom is lower than the chip's top (printed by step 1).
- Verified by: E2E `dg-92`; `dg-86` AS-LLW-14 cases 3 and 4, `dg-71` stay green.

### AS-QDL-03 The ring of the locked starter list is whole in a low window (decision 3, item 130)
- Given: the first-run wizard on step 2 with a starter checked; Finish writes the links but the write of `quietTabOnboardingWizardComplete` is refused (the recipe of `dg-82`), so the list is locked (`data-starters-locked="true"`, `tabindex="0"`, name `Starter links`); windows 1280×300, 500×360, 500×300, 320×480; light and dark.
- When: Tab moves focus to the list.
- Then: the list's outline box (its border box grown by 2 px on each side) lies inside the card's scrollport on all four sides (±0.5 px), measured by rectangles; the pixel comparison focused against unfocused shows the 2 px ring on all four sides (the method of run 44); no row is covered by the ring; the card scrolled only as far as the list plus 5 px requires. At 1280×800, where the card does not scroll, nothing moves.
- Verified by: E2E `dg-92`; `dg-82` stays green.

### AS-QDL-04 A cache from the future is not fresh (decision 4, item 138)
- Given: a stored city and a cache for it with `fetchedAt` equal to `now + 1 ms`, `now + 10 min`, `now + 2 h`; and, as controls, `fetchedAt` equal to `now`, `now - 29 min 59 s`, `now - 30 min` and `now - 2 h`.
- When: `initialize()` runs (unit), and a new tab opens (E2E, with a request counter on the two Open-Meteo weather hosts).
- Then: for the three future values and for `now - 30 min` and `now - 2 h` the service fetches (one forecast and one air-quality request), rewrites the cache with `fetchedAt` equal to `now` and returns `ready`; if the fetch fails it returns `stale` with the cached data. For `now` and `now - 29 min 59 s` it returns `ready` with the cache and no request. The tiles of the E2E case show the fresh values. The probe "the city changed during the fetch and then the fetch fails" is printed by a unit test and not asserted beyond `main`'s result (row Р55 owns it).
- Verified by: unit `test/weatherService.test.js`; E2E `dg-92` (the counter case).

### AS-QDL-05 A refused reset rebuilds nothing (decision 5, item 167 b)
- Given: an unreadable meta; the screen `Your grid couldn't be read.` with `Reset grid`; the dialog open; `chrome.storage.sync.remove` made to fail; a mutation observer on `#favorites` counting inserted nodes (the screen block, any `[role=alert]` paragraph) and the identity of the `.grid-unreadable` node.
- When: Confirm.
- Then: the dialog closes; the chip says `Couldn't reset your grid. Try again in a moment.`; focus is on the screen's Reset grid button; the `.grid-unreadable` node is the same node as before and no `[role=alert]` paragraph was inserted between the confirm and the end (0 against 1 rebuild on `main`, printed by step 1); a pointer click on the screen's button within 300 ms of the close is still swallowed (AS-UGR-12); a second Reset grid then Confirm with a working storage erases and reloads as before (AS-UGR-10).
- Verified by: E2E `dg-92`; `dg-91` AS-UGR-11 and AS-UGR-12 stay green.

### AS-QDL-06 Nothing else moves, and the code with no visible effect is pinned (decision 6)
- Given: the source after the change.
- When: `npm test` and `npm run check` run, and the earlier scenarios listed under "Affected earlier scenarios" run.
- Then: `healReadDesk` holds the busy lock in a `try` with `finally` (source pin); the load has one `const metaKind = inspectWidgetsMeta(rawMeta)` and no second call on `rawMeta` (source pin); `downgrade` is a boolean (pin); `centeredDefaultRow` has neither "The same value is" nor "Callers:" and the `viewportRows` comment has the new sentence (pin on the strings, not on the logic); the comment of `resetUnreadableWidgets` has no "Accepted exception 2". No scenario of `dg-59`, `dg-65`, `dg-71`, `dg-90`, `dg-91` changes its result; the count of `it(` does not drop.
- Verified by: source pins in `test/newtabSource.test.js`, `test/weatherSource.test.js`; the earlier E2E.

### AS-WTF-01 A stale tile says "Last known" (decision 7, item 140)
- Given: a stored city and a cache 2 h old, the forecast fetch failing, so the four tiles are stale; the temperature metric at 1×1 and at 2×1; the same with a retry press in flight (`Trying again…` in front); a tab at `describeWeatherMetric` level (unit) for `ready`, `stale`, `stale` without a finite `fetchedAt`, `error` and `null`.
- When: the tile's tooltip is shown (hover and `:focus-visible`) and its hidden description is read.
- Then: stale: `STALE_PREFIX`, `Updated 2 h ago.`, `Last known: 21°.` and then the unchanged rest of the sentence; no `Currently` anywhere in it. Stale while retrying: `Trying again…` then the same data sentence with `Last known: 21°.`. Stale without a finite age: `STALE_PREFIX` then `Last known: 21°.` and the rest. Ready: `Currently 21°.` and the unchanged rest. Error and loading: unchanged. The three other metrics' descriptions are character-equal to `main` in every state (UV: Accepted exception 2). The primary values of the tiles do not change.
- Verified by: unit `test/weatherTiles.test.js`; E2E `dg-92`; `10-weather-grid-states`, `dg-54`, `dg-88`, `dg-89` assertions on the stale description are updated, never deleted.

### AS-WTF-02 No lone word at the end of a message (decision 8, item 140)
- Given: 320×600 and 500×800; the stale temperature tooltip (AS-WTF-01 data); the city modal with a failed city save (`Couldn't save your city. Try again in a moment.`) in change mode and in the wizard step 1; the page chip with `Couldn't load weather. Try again in a moment.` after a failed retry press. The premise prints each text's lines before the change.
- When: the text is shown.
- Then: `getComputedStyle(...).textWrap` is `pretty` (or `balance` under the fallback of decision 8) on those elements; the last line of each text that wraps holds at least two words (lines counted from the rectangles of the text range); no text leaves its box (the existing AS-TYP-03 rule) and no existing numeric rule changes beyond ±1 px (the error slots of the city modal: the AS-DJ and AS-LW numbers).
- Verified by: E2E `dg-92`; `dg-53`, `dg-84`, `dg-89` stay green.

### AS-WTF-03 No shown tile, no request (decision 9, item 156)
- Given: a stored city; all four metrics hidden (stored `enabled: false`); the cache absent in one case and 31 minutes old in another; a request counter on `api.open-meteo.com` and `air-quality-api.open-meteo.com`; a tab that is open on the desk. The same with the grid unreadable (screen) and with a newer grid (read-only).
- When: (a) a new tab opens; (b) the tab is hidden and shown again, 31 minutes later by the clock stub of `lib/tabReturn.mjs`; (c) the browser fires `online` while the tab is visible; (d) (b) and (c) repeated.
- Then: 0 forecast and 0 air-quality requests in every step; no cache write (the cache key is byte-identical); `#desktop-status` and `#desktop-live` stay empty; no tile appears. On `origin/main` the same steps send 2 requests at least in (b) (printed by step 1).
- Verified by: E2E `dg-92`; `dg-90` stays green.

### AS-WTF-04 A tile that appears asks once, when due (decision 10, item 156)
- Given: the state of AS-WTF-03 with the cache missing or 31 minutes old, edit mode, the Add menu.
- When: Add weather tile restores one metric. Variants: (a) the tab opened with all metrics hidden, so it holds no result; (b) the same with the cache 5 minutes old; (c) the tab loaded weather 5 minutes ago with tiles shown, then all four were hidden, then one restored; (d) the same with the result 31 minutes old by the clock stub; (e) another tab enables a metric and this tab comes back (the grid re-read applies it); (f) no city stored.
- Then: (a) the tile shows its loading state, then exactly 2 requests (one forecast, one air quality) and the values; (b) 0 requests and the cached values; (c) 0 requests, the held values at once; (d) 2 requests; (e) like (a) or (b) by the cache age, one attempt only; (f) the hint tile appears, 0 requests. Restoring a second metric while the first is loading starts nothing new. No status text and no announcement from the load itself; the restore announcement of `main` stays.
- Verified by: E2E `dg-92`.

### AS-WTF-05 With a tile shown, nothing changes (decisions 9, 10; run 50)
- Given: the cases of AS-TRR-01 to AS-TRR-05 and AS-WRL (a shown tile, stale or error or 30 minutes old results, the pause, `online`).
- When: the same steps as in those scenarios.
- Then: the same results as before this run; at open with a shown tile and a missing or old cache the load makes 2 requests as before; a fresh cache makes none.
- Verified by: E2E `dg-90`, `dg-88`, `dg-54`, `10-weather-grid-states` stay green; `dg-92` repeats one case as a control.

### AS-WTF-06 The privacy text says so (decision 11, item 156)
- Given: `docs/privacy.md` and `test/privacyDocs.test.js`.
- When: `npm test` runs.
- Then: the Background Activity section says that a weather request happens only while at least one weather tile is shown, lists the cases of decision 11, keeps "no background polling", "nothing is polled or repeated on a timer", "once a tab has loaded, a hidden tab starts no request" and the Nominatim sentence; the pin asserts the new sentence and the listed cases and still forbids the old false sentences; `docs/tab-return-refresh.md` no longer presents the old Ruling as the current behaviour.
- Verified by: unit `test/privacyDocs.test.js`; read in the final review.

### AS-WTF-07 A group keeps its height whatever is chosen (decision 12, items 143, 147, 148 L2-01)
- Given: Add link and Edit link, and Edit weather for the Size group; the browser font 16, 20, 21 and 24 px (the setting of `lib/typography.mjs`); windows 1280×800, 601×800, 500×800 and 320×800 (tall enough that the dialog does not scroll); light and dark.
- When: each option of the Icon, Color and Size groups is selected in turn, by click and by arrow key.
- Then: the group's height, the number of lines of every option's label and the dialog's height are the same (±0.5 px) for every choice of that group, at every font size and width; on `origin/main` the dialog's height changed by 9.1 to 11.5 px at 20 to 21 px between "From site" and "Letter" (printed by step 1, quoted from run 49). No label is cut (the AS-TYP-03 rule: its text range lies inside its group, ±0.5 px). The group keeps its radius and border.
- Verified by: E2E `dg-92`; `dg-89` AS-TYP-03 stays green.

### AS-WTF-08 A wrapped label has room above and below (decision 12, items 143, 148 L2-01)
- Given: Add link with Icon on Custom so that the Custom icon row shows; the font 24 px at 1280×800 and 601×800, where the label "Custom icon" wraps beside its field; the font 20 and 21 px in the 420 px dialog where "From site" wraps (the wrap is printed as the premise, which options wrap); the stacked layout (500×800) at 16 and 24 px.
- When: the layout settles.
- Then: for every label that wraps (its text range has more than one line) the distance from the text range to the top and to the bottom of its option (option labels) or of its box (the row label) is at least 4 px; the row label's two lines are not clipped; a focused option's 3 px inset ring does not touch the text. In the stacked layout at 16 px and 24 px a one-line row label has the box height of `main` (±0.5 px) and the row heights of the stacked rows are those of `main` unless the label wraps.
- Verified by: E2E `dg-92`.

### AS-WTF-09 At the default font nothing looks different (decision 12; Q1 A)
- Given: Add link, Edit link and Edit weather at the default font (16 px) at 1280×800, 500×800, 320×600, light and dark, every option of every group selected in turn.
- When: the dialogs are drawn.
- Then: every rectangle of the dialog (the card, the rows, the groups, the options, the labels) equals `origin/main` at tolerance 0.5 px and a screenshot comparison of the dialog is pixel-equal; the accessible names and roles of the options, the Tab and arrow-key order, the label nodes' `textContent` (so the visible text is the same string) and the radio state are those of `main`; the generated reserve is not in the accessibility tree (no extra text for a screen reader).
- Verified by: E2E `dg-92`; `dg-89`, `dg-83`, `dg-58`, `dg-86` stay green.

## Affected earlier scenarios and documents

- E2E whose assertions on the stale description move (updated, never deleted): `10-weather-grid-states`, `dg-54-weather-tile-retry`, `dg-88-weather-reliability` (the text builder of the stale description), `dg-89-typography-copy` (the stale tooltip and the AS-TYP-03 numbers, which stay true). Unit: `test/weatherTiles.test.js`, `test/weatherSource.test.js`.
- E2E that must stay green and that this change can touch: `dg-82` (the locked list), `dg-83` and `dg-86` (the error slot and the reveal), `dg-91` (the Reset grid dialog), `dg-90` (returns), `dg-53`, `dg-58`, `dg-84`, `dg-71`, `dg-59`, `dg-65`. Scenarios that seed a city with all four metrics hidden and count weather requests (search `enabled: false` and the request routes) are read at step 1.
- Documents: `docs/privacy.md` (decision 11); `docs/tab-return-refresh.md` (Accepted exception 18, L1-03 line, decision 2); `docs/weather-reliability.md` and `docs/weather-tile-retry.md` (the example stale description with `Currently`); `docs/typography-copy.md` (Accepted exception 5: "A wrapped segmented label has no extra vertical padding (backlog 143)" is now false; the AS-TYP-03 numbers stay); `docs/layers-low-window.md` (decision 6 gets one sentence for the resize); `docs/unreadable-grid-reset.md` (decision 6: the refused removal redraws nothing). Spec statuses are not rewritten; each gets a short "Changed by run 53" note where a sentence is now false.

## Review focus

- **Scenarios and states.** The tile-appears hook (decision 10): every route by which the displayed state gains its first shown tile (Add menu, a re-read on return, a heal after a cleared storage, `recoverFromGoneLink`) and the cases where two routes meet; a result held from before the last tile was hidden; a load that was gated at open and has no result when a tile arrives; the city flows that must stay un-gated. The resize hook (decision 1): a resize while a dialog is not open, while the city modal is open, while a drag runs.
- **Visual and layout.** The segmented reserve (decision 12) at 320 px, where a group is narrowest and `overflow: hidden` clips: nothing may be cut; the `padding-block` on the row label in the beside layout against the stacked layout; the 3 px inset ring of an option against the text; light and dark pixel equality at the default font. The `text-wrap` change against the numeric rules of the city modal and the chip.
- **Accessibility and copy.** `Last known: 21°.` read by a screen reader as part of the description, in order; the generated reserve is not announced; the locked list's ring and its name; the failure chip text is announced once (item 167). The privacy paragraph: every case of a request is listed and none is false.

## Accepted exceptions

1. **The wrap of the "Custom icon" row label stays.** The 100 px label column is kept (`docs/typography-copy.md` decision 3 and Accepted exception 5): at 24 px the label wraps beside its field and the row is taller than at 16 px (76 against 60 px on `main`, plus 8 px of vertical room now). Kier chose room, not a wider column (Q1 A). The cut above about 175 percent of the font (item 148 L3-01), 24 px with a classic scrollbar at 320 px (L2-02) and the right footer button at 24 px and 320 px (S3-01) stay as `docs/typography-copy.md` Accepted exception 5 and the roadmap record them.
2. **Ruling (марафон, на проверку Киру): the UV tile keeps `Current UV index <n> (<level>)` in the stale state.** Kier's decision names `Currently` of the temperature tile; the UV sentence has the same present-tense problem. Not changed because the decision does not name it and it is one string; альтернатива: `Last known UV index` in the stale state; цена ошибки: an old UV index reads as current, with the alternative one more string, one more test and the same family of pins. Recorded in `backlog.md` row 179.
3. **A change of the dialog's content does not re-scroll an error (decision 1, Ruling).** As on `main`.
4. **A tile that appears shows the held result when it is not due (decision 10, Ruling).** Up to 30 minutes old data of this tab, possibly older than the cache another tab wrote; the return rules refresh it at the next return.
5. **Chrome's `text-wrap: pretty` is best effort.** It changes only the last lines of a wrapped text and has no effect where a text fits in one line; a case where Chromium keeps a lone word falls back to `balance` (decision 8).
6. **A request the user starts is not gated.** Choosing a city, the wizard's city step and a retry press run from a shown tile or the wizard; they are the user's own actions (decision 9).
7. **The re-announcement of the unreadable screen's alert when the Reset grid dialog closes** (item 170, point 2) and the other points of items 148 and 170 listed in `roadmap.md` "Не в очереди" stay as they are.

## Non-goals

- Items 148 S3-01, L2-02, L3-01 and the tooltip not following a keyboard scroll (roadmap "Не в очереди"); item 148 L1-01 (row Р56); item 170; items 132, 133, 134, 154, 157, 159 (roadmap).
- The test half of item 138 ("city changed during the fetch, then the fetch fails": unit and behavioural pins) and the test and E2E-library items of rows 146, 165 (7)(8)(13), 166, 167 (tests): row Р55. Docs of rows 127, 150, 160, 161 (2)(5), 172, 168: row Р56.
- Any change of storage, the cache rule beyond the future `fetchedAt`, the 30 minute window, the pause of 3 s, the timeout of 15 s, the weather tile's primary value or tone, the Add menu, the city modal's behaviour.
- Making the selected option of a group non-bold (Q1 B), widening the 100 px label column, a table-like layout of the dialog.
- A manual smoke in a live Chrome (return after 31 minutes, offline return, VoiceOver) is Kier's, after the queue (`kickoffs/queue-52-56-sessions.md`, "После очереди").

## Review rounds

None yet (stage 0).
