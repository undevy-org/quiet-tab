# City suggestion list: combobox semantics, Tab order, and the leftovers of run 44

## Status

`draft` — revision 2 (2026-10-17, stage 2: fixes after spec review 1 and the spec gate r1; see § Changes after review 1). Revision 1 was stage 0. Run №45 (`city-suggestion-list`), row Р45 of the roadmap ("Список подсказок города", marathon `kickoffs/marathon-45-51.md`). Backlog: the "no ARIA on the suggestion list" nit of run #10 (`backlog.md`, section "Мелочи от проверяющих"), 41 (overlay list covers Save/Cancel; the L2-02 stack part is R46), 101, 108, 110, 113. The facts under § Triage come from reading `origin/main` at `289ea8d`; the executor's first step is to reproduce every item live and record the result there (an item that does not reproduce is closed with a backlog line and its AS and tasks are dropped by a spec fix).

**Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`). Nothing is stored or migrated by this run.

Related: `docs/modal-overlay-design.md` (the city modal, the list as an overlay), `docs/dialog-threshold-jump.md` (the flip between overlay and docked list, accepted exception), `docs/docked-list-focus-ring.md`, `docs/city-error-ux.md` (AS-CE-02), `docs/city-modal-focus-copy.md` (AS-CMF-17, AS-CMF-20), `docs/use-my-location.md`, `docs/onboarding-wizard.md`, `src/newtab.js` (`createCityForm`, `renderSuggestionsList`, `placePopover`, `closeList`, `showCityModal`, `armPostCloseClickGuard`), `src/surfaces.css` (`.weather-form__suggestions`, `.city-location-link`).

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-10 (run #10 final) | The suggestion list has no ARIA: no combobox/listbox, no `aria-expanded`, no `aria-controls`. | `confirmed` (technical default) | decision 1 |
| 2026-10-06 (run 16) / run #10 | Backlog 41 (overlay part): the overlay list covers Save/Cancel (40 px at one suggestion). | `confirmed`; layout kept | decision 3, Ruling |
| 2026-10-15 (run 42 nit N2) | Backlog 101: the mutation "`showCityModal` does not call `clearPostCloseClickGuard`" survives the whole E2E suite; only a source pin catches it. | `confirmed` | decision 4 |
| 2026-10-17 (run 44 review) | Backlog 108: AS-CMF-20 names the Tab order "field, clear, link, Cancel, Save"; the DOM puts the link above the field. | `confirmed` (spec text) | decision 5 |
| 2026-10-17 (run 44 executor) | Backlog 110: `page.click` on the weather dialog's city field right after the city modal closes waits on actionability. | `confirmed` (harness) | decision 6 |
| 2026-10-17 (run 44 final) | Backlog 113: the focus ring of "use your location" reaches into the neighbouring characters (≈2.6 px left, 6 px right). | `confirmed` | decision 7, Ruling |

Out of scope, other rows: the stacked modal over the weather dialog showing the lower card's strips (41 L2-02, 60 V2-04: R46), the status chip layers (R46), the starter list's interrupted ring (114: R46).

## Triage (pre-measurement by reading `main` at `289ea8d`; live measurement below)

- **ARIA.** `createCityForm` (`newtab.js:~780-900`): `input` has `aria-label="City"` only; `suggestionsList` is a bare `div.weather-form__suggestions`; each item is a `button.weather-form__suggestion` with `data-weather-action="select-city"`. No `role`, `aria-expanded`, `aria-controls`, `aria-autocomplete`, `aria-haspopup`. ArrowDown in the field focuses the first item (real focus), ArrowUp/ArrowDown move through items (`suggestionsList` keydown), ArrowUp on the first item returns to the field. Every item is a Tab stop (the list is inside the `field` wrapper, so `closeListIfFocusLeft` does not close it while focus walks the items), so with N suggestions Tab goes field → clear → N items → Cancel. The list is also `overflow-y: auto` with `max-height` up to 240 px (`surfaces.css:1-16`, `POPOVER_MAX_HEIGHT` 240), so with 6 rows it really scrolls (`scrollHeight` 254 against `clientHeight` 240 in `docs/docked-list-focus-ring.md`); the Chromium used by the E2E harness makes a scrollable container without a keyboard-focusable descendant a Tab stop itself (the same mechanism the locked starter list uses on purpose), see decision 1 and step 1 of the kickoff.
- **41 overlay.** `.weather-form__suggestions { position: absolute; top: calc(100% + gap) }` (`surfaces.css:1-16`) while `free >= POPOVER_MIN_FREE` (96 px, `placePopover`); the footer sits in the flow below the field, so the list covers the (empty-height) feedback slot and the Cancel/Save row. This is the accepted design of `docs/modal-overlay-design.md` and `docs/dialog-threshold-jump.md` (accepted exception "the list flip"); a pointer press on the covered area hits an item.
- **101.** `showCityModal` calls `clearPostCloseClickGuard()` (`newtab.js:1443`) and `test/newtabSource.test.js:2168` pins that text. No E2E step reopens the modal inside the 300 ms window of a close and then clicks with the mouse, so removing the call keeps `dg-82` green.
- **108.** `buildCityModal` (`:1091-1107`) appends title, `createCityLocationDescription` (the paragraph with the link), then the form (field, clear, footer). DOM order: link, field, clear, Cancel, Save. `dg-84` (`:1360`) already asserts the cycle `clear, cancel, save, link, input` from the field, which is the same DOM order; only the sentence in `docs/city-modal-focus-copy.md` AS-CMF-20 is wrong.
- **110.** Seven scenarios touch `button.city-field` (`13-city-modal`, `dg-29`, `dg-58`, `dg-62`, `dg-84`, …) and some click it through `page.evaluate`. Cause not measured. First hypothesis (reviewers, `newtab.js:313-331`): the post-close click guard `armPostCloseClickGuard` (`POST_CLOSE_CLICK_GUARD_MS` 300) silently swallows any pointer click with `event.detail > 0` for 300 ms after a modal closes; a Playwright click has `detail = 1` and is swallowed without an error or a timeout, while `evaluate(click)` has `detail = 0` and bypasses it, which is the likely reason for the `evaluate(click)` workarounds and `sleep(450)`. The guard is an intended feature, not a bug. Other candidates: the dialog or its tiles still animate under the closing modal. The executor measures it (decision 6).
- **113.** `surfaces.css:112-118`: `.city-location-link:focus-visible { padding: 0 4px; margin: 0 -4px; box-shadow: 0 0 0 2px … }` so the ring extends 6 px to each side of the text; the space before the link is ≈3.5 px (estimated from backlog 113 until step 1; not measured by the author), the full stop/comma after it has no space.

### Live measurement (executor, step 1; fill in)

| Item | Result | Measured |
|------|--------|----------|
| ARIA | | |
| 41 overlay | | |
| 101 | | |
| 108 | | |
| 110 | | |
| 113 | | |
| Tab stops with 6 and 8 rows, overlay (scrolling list), before the change | | |
| Space width before the link in both hosts and widths 500 / 320 | | |

## Decisions

Technical defaults of the stage-0 author unless marked. No owner question was asked (marathon rule); the UX forks carry a Ruling (four).

1. **Combobox semantics (technical default; Ruling 1).** The field becomes an ARIA 1.2 combobox with a listbox popup, in both hosts (wizard step 1 and the city modal, they share `createCityForm`):
   - input: `role="combobox"`, `aria-autocomplete="list"`, `aria-haspopup="listbox"`, `aria-controls=weather-city-suggestions`, `aria-expanded="true"` while the list has items (`isSuggestionsOpen`), `"false"` otherwise; the existing `aria-label="City"` stays; `aria-expanded` always equals `isSuggestionsOpen` after every render and every close path (choice, Escape, focus leaving, Clear, an empty result, use my location, busy, the modal closing; review L0-03);
   - list: `role="listbox"`, `id="weather-city-suggestions"` (next to `weather-city-input`; the form is unique, `activeCityForm`, so there are no duplicates; review M8), `aria-label="City suggestions"`, **`tabindex="-1"` on the listbox itself** (review I1: a scrollable container whose options are all `tabindex=-1` becomes a Tab stop in Chromium; `-1` takes it out of the sequential order and leaves arrows and the pointer alone); it stays in the DOM when empty (hidden by `:empty { display: none }`), so `aria-controls` always resolves;
   - each item: `role="option"` on the existing `button` (class, `data-*`, text and click handler unchanged), `tabindex="-1"`;
   - **focus model is the one that exists: real focus moves into the list** (ArrowDown from the field to the first option, ArrowUp/ArrowDown between options, ArrowUp on the first returns to the field, Enter/Space/click on an option chooses it). `aria-activedescendant` is not used.
   Ruling (марафон, на проверку Киру): real focus moves onto the options (the existing roving behaviour, with listbox/option roles added), the field does not keep focus while arrowing; альтернатива: focus stays in the input and `aria-activedescendant` points at the highlighted option (typing continues while arrowing); цена ошибки: with the chosen model a screen reader user leaves the text field to browse (Escape or ArrowUp returns), with the alternative a larger rewrite of keyboard handling, the focus ring and the dg-47/48/49/52/53 pins.
2. **Tab leaves the list out (Ruling 4).** Options are arrow-only (`tabindex="-1"`, and the listbox too, decision 1): Tab from the field goes clear → Cancel (or Skip) → Save, never through the suggestions or the scrolling list, so the number of Tab presses to reach Save does not depend on the number of suggestions (1 to 6 in the product). Focus entering the list by arrow keys cancels the pending request (`focusin` handler, unchanged). A pointer press on an option does not move focus: `mousedown.preventDefault()` on the option keeps focus in the field (`newtab.js:899-904`), and the choice runs from the click handler. Shift+Tab from an option goes to the field's previous stop in DOM order (the clear button when visible, else the field), and the list stays open while focus is inside the `field` wrapper (unchanged). **Replace, not weaken:** this reverses the documented behaviour "Tab reaches the rows" (`docs/architecture.md:272-273`, `agent-config/CLAUDE.md` § Weather, `docs/docked-list-focus-ring.md` AS-FR-04, AS-10 of `15-city-modal-layout`, the walks in `dg-52`/`dg-53`); each such Tab-walk check is replaced by a check of the new order (clear → Cancel/Skip → Save), the earlier AS is kept and marked "amended by run 45", never deleted, and the coverage of the row focus ring from the keyboard stays through the arrow walk of `dg-52` (AS-FR-03). Ruling (марафон, на проверку Киру): Tab skips the suggestions and the arrows are the only keyboard way into the list; альтернатива: keep Tab reaching every row (the listbox-in-Tab-order pattern, Save is N+3 presses away) and give only the roles; цена ошибки: a keyboard user who expects Tab to enter the list must press ArrowDown (the combobox pattern announces it), with the alternative the press count to Save grows with the number of rows and a pointer-covered Save (Ruling 2) is also far for the keyboard.
3. **The overlay stays an overlay (Ruling 2).** The list keeps its geometry: overlay while `free >= 96`, docked below; flip heights, metrics, z-order and `scroll-margin` unchanged. What changes is access: with decision 2 a keyboard user is no longer forced through the items to reach Save, and the list closes by choosing an item, Escape (`escapeLayer`, unchanged), focus leaving the field wrapper or a pointer release outside it (unchanged). Ruling (марафон, на проверку Киру): keep the overlay list that can cover Cancel/Save while it is open (accepted by runs #9, #10, #16, `docs/dialog-threshold-jump.md`); альтернатива: always dock the list in the flow, or stop the overlay above the footer (the dialog grows, the flip exception disappears, dg-47/48/49/52/53 are rewritten); цена ошибки: a pointer user sees Save hidden under the list until they choose an item, press Escape or click outside the list.
4. **Guard reopen scenario (technical default).** `dg-85` gets a step "Cancel with the mouse, reopen at once by the keyboard, Cancel with the mouse again inside 300 ms of the first close"; the second click must be delivered (the modal closes). The timing is measured in the page, not guessed from CDP latency (pattern of `dg-82` AS-OWP-03, `dg-82:276-300`): a `MutationObserver` on the removal of `#city-modal` records `performance.now()` at the close; the second click is delivered in one page task together with the reopening (`opener.click()` for the keyboard activation, `detail 0`, which the guard does not swallow, then at once a `MouseEvent("click", { detail: 1, bubbles: true, cancelable: true })` on Cancel). Premises asserted before the value: the in-page `delta` between the close and the second click is `< 300` ms, and `document.activeElement` is the opener before the Enter variant (a separate real-keyboard step). The executor proves the step catches the mutation by deleting `clearPostCloseClickGuard();` from `showCityModal`, running the scenario THREE times (FAIL line quoted in all three) and restoring it. The source pin stays.
5. **AS-CMF-20 text (technical default).** `docs/city-modal-focus-copy.md` AS-CMF-20 and its sentence in § Decisions (if any) say "location link, field, clear, Cancel, Save" (the DOM order); no code, no `dg-84` change (it already asserts the cycle).
6. **Click after close in E2E (technical default).** The first hypothesis of the probe is the post-close click guard (`POST_CLOSE_CLICK_GUARD_MS` 300), not Playwright actionability: the guard swallows a pointer click (`detail > 0`) silently, so an actionability check by visibility / enabled / stable bbox repeats what Playwright already does and does not cover it. The executor first finds the cause with a probe (does a real click within 300 ms of the close do nothing; which element is reported unstable or covered; `locator.click({ trial: true })` timing). If it is the harness only (the guard or a transition), add one helper `clickWhenActionable(page, locator)` to `.private/e2e/lib/harness.mjs`: it waits until `performance.now() - closedAt >= 300 + margin`, where `closedAt` is recorded in the page by a `MutationObserver` on the removal of `#city-modal` (an observed event, not a blind `sleep`), then waits for the locator to be visible, enabled and stable, and performs the real pointer click; the caller asserts the effect (the click took effect: the city modal / dialog it opens exists), not just the absence of an exception. The workaround `evaluate(click)` calls on `city-field` are replaced, not weakened. The guard is an intended feature: it is never a backlog bug. If a product element still animates under a closed modal (a real bug), stop and record it as a backlog line (no product change in this run).
7. **Focus ring of the location link (Ruling 3).** The ring never covers a neighbouring word character. Padding becomes `0 1px` with margin `0 -1px` (text does not move), the 2px ring and radius stay, so the ring reaches 3 px beyond the text; the space before the link (≈3.5 px at the modal's text size, estimated from backlog 113 until step 1) is wider than that, and only a directly adjacent `,` or `.` after the link may be touched. The real width of the space is entered into § Live measurement for both hosts and both widths (500, 320; the wizard has its own description font size) before the spec gate; if it is below 3 px the decision becomes padding `0 0` (the ring is only the 2 px `box-shadow`) by a spec fix. The overlap rule is checked on the last non-space character of the preceding text (AS-CSL-12), not on the whole text node, whose rectangle ends exactly at the link and always touches a ring. Ruling (марафон, на проверку Киру): reduce the ring's reach to 3 px per side (was 6 px, decision 7 of run 44 set 4 px padding); альтернатива: keep 4 px padding and add an equal margin of space around the link (changes the sentence's measure and the field position); цена ошибки: a tighter, less airy ring around the link text, still ≥ 3:1 against the panel.

## Scope

- Roles and states of the field and list (decision 1), Tab order (decision 2), both hosts; no pixel change of the list, field or dialog.
- Items 101, 108, 110, 113 as above; E2E `dg-85-city-suggestion-list.mjs` (the next free number after `dg-84`).
- Updates of earlier scenarios that pin the Tab walk through items or the list's markup, by the rule "replace, not weaken" of decision 2: the executor greps `.private/e2e/scenarios/` for `weather-form__suggestion`, `ArrowDown` and Tab walks (`dg-47`, `dg-48`, `dg-49`, `dg-52`, `dg-53`, `dg-58`, `13-city-modal`, `15-city-modal-layout`, `dg-84`) and `test/newtabSource.test.js` / `test/weatherSource.test.js`.
- `CHANGELOG.md` `[Unreleased]`; `docs/architecture.md:272-273` ("Tab also reaches the suggestion buttons in DOM order"), the `agent-config/CLAUDE.md` § Weather sentence "ArrowDown/ArrowUp move through the list (Tab reaches it too)", `docs/docked-list-focus-ring.md` AS-FR-04 (marked "amended by run 45") and the 4 px padding line of `docs/city-modal-focus-copy.md` (Decision 7 of run 44, beside AS-CMF-20) get the new order; the DOM-contract sentence for the list.

## Acceptance scenarios

Common setup of `dg-85`: the harness as in `dg-84` (clean profile, six system tiles seeded, Open-Meteo geocoding routed by `setNet` to N canned suggestions `Tbilisi 1..N` or an empty result), both hosts (the wizard's step 1 and the change modal opened from the "Set a city" hint; one scenario also stacked over the weather dialog), widths 500 and 320, 1280×800 unless stated.

### AS-CSL-01 Roles and states, closed
- Given: a host open, the field empty or prefilled, no suggestions.
- When: read the field and the list.
- Then: the input has `role=combobox`, `aria-autocomplete=list`, `aria-haspopup=listbox`, `aria-expanded=false`, `aria-label="City"`, and `aria-controls` equal to `weather-city-suggestions`, the id of an element that exists and has `role=listbox`, `tabindex=-1` and the name `City suggestions`; the list has no options; its box is `display: none`.
- Verified by: E2E `dg-85`.

### AS-CSL-02 Roles and states, open
- Given: typing a prefix returns N = 1, 3 and 6 suggestions (6 is the product maximum, `searchCities` asks `count = 6`); N = 8 is a stress case beyond the product, reachable only through `setNet`.
- When: the list renders.
- Then: `aria-expanded=true`; the list holds N elements with `role=option`, each a `button`, each with `tabindex=-1`, the accessible name equal to its visible text `Name, Region, Country` (parts that exist, as today), `data-weather-action=select-city` and the coordinates unchanged; the list's bounding box and the options' boxes equal those measured on `origin/main` (±0.5 px: same overlay or docked placement); when the list closes, `aria-expanded` returns to `false`: for a choice, Escape and Clear in the same frame; for focus leaving the wrapper within one task (the close runs from `setTimeout(closeListIfFocusLeft, 0)`, `newtab.js:993`, `:1007`), checked with `expect.poll`, never a fixed sleep; for an empty result, use my location, busy and the modal closing the same way.
- Verified by: E2E `dg-85`; `dg-53`/`dg-52` keep their metric assertions green.

### AS-CSL-03 Keyboard inside the list
- Given: 3 suggestions open, focus in the field.
- When: ArrowDown, ArrowDown, ArrowUp, ArrowUp, ArrowUp; then ArrowDown, Enter.
- Then: focus goes option 1, option 2, option 1, field, field (no wrap, no move past the field); then Enter on option 1 chooses it exactly as a click does (field filled, list closed, `aria-expanded=false`, Save enabled, no second geocoding, no storage write before Save); focus is in the field after a choice by Enter on an option and by click (`choose()` calls `input.focus()`, `newtab.js:1083`; `15-city-modal-layout.mjs:285` already checks it for Enter); not changed by this run.
- Verified by: E2E `dg-85`.

### AS-CSL-04 Tab does not walk the options
- Given: 1, 3 and 6 suggestions open (and 8 as the stress case); with 6 and 8 rows in overlay mode (800 px high window) the list really scrolls (premise: `scrollHeight > clientHeight`); focus in the field; change modal (Cancel | Save) and wizard step 1 (Skip | Continue).
- When: Tab repeatedly.
- Then: the stops are the clear button, then Cancel (Skip), then Save (Continue), in the same number of presses for every N, including the scrolling list (the listbox is not a Tab stop); no option is reached by Tab; when focus leaves the field wrapper (on Cancel) the list closes and `aria-expanded=false`. Shift+Tab from Cancel returns to the clear button with the list still closed. Focus placed on an option by ArrowDown and then Tab goes to Cancel (Skip), and the list closes. A pointer press on an option (mousedown) leaves focus in the field (premise `document.activeElement` is the input after the press and before the click), and Tab afterwards behaves as above.
- Verified by: E2E `dg-85`; source pin: `tabTrapFocusables` (`newtab.js:3232-3253`, selects `input, button` without `tabindex`) never has an option as its first or last stop.

### AS-CSL-05 Escape and choosing while the list is open
- Given: 3 suggestions open, focus on option 2 (arrows) and, separately, in the field.
- When: Escape.
- Then: the first Escape closes only the list (the modal stays open, the order of `escapeLayer` is unchanged), `aria-expanded=false`, focus is in the field; a second Escape closes the modal. Choosing an option by click: list closed, field filled.
- Verified by: E2E `dg-85`; `dg-84` AS-CMF-20 stays green.

### AS-CSL-06 The overlay is unchanged (Ruling 2)
- Given: 1, 3 and 6 suggestions, windows 800 px high (overlay) and 600 px high (docked, the height of `.private/design-review/TEMPLATES.md`; the flip heights are re-measured) at widths 500 and 320.
- When: measure the list and the footer.
- Then: the overlay/docked decision, the flip heights (re-measured as in `docs/dialog-threshold-jump.md`, never typed) and every edge of the dialog are those of `origin/main`; in overlay mode the list may cover Save/Cancel; pressing Escape or choosing an item uncovers them and a click on Save then works (a pointer click within 350 ms of a choice is ignored by `recentlyChosen`, `newtab.js:1355-1362`; the step waits for that window to pass by an observed time from `choose()`, as in decision 6, never a bare sleep, and asserts that Save took effect); the same Save is reachable with the keyboard by Tab without touching an option (AS-CSL-04).
- Verified by: E2E `dg-85`; `dg-53`.

### AS-CSL-07 Both hosts, stacked and narrow
- Given: wizard step 1 at 500 and 320 px; the change modal at 500 and 320 px; the change modal stacked over the weather edit dialog.
- When: AS-CSL-01, 02 and 04 are repeated.
- Then: the same roles, states and Tab walk; the stacked case also keeps the dialog under the modal inert; no horizontal overflow and no new tab stop outside the wizard's locked starter list.
- Verified by: E2E `dg-85`.

### AS-CSL-08 Screen reader names and texts
- Given: the modal in the open state with 3 suggestions.
- When: the accessibility tree (Playwright `ariaSnapshot`) is read.
- Then: it contains `combobox "City"` (expanded), `listbox "City suggestions"` with `option` children named by their text, and no other new text appears anywhere: no visible string changes in this run, and one new accessible name (`City suggestions`).
- Verified by: E2E `dg-85`; design review (accessibility lens).

### AS-CSL-09 A reopened modal does not swallow its own click (backlog 101)
- Given: the change modal open from the weather dialog's city field and, in a separate pass, from the hint tile (both openers are covered).
- When: click Cancel with the mouse; reopen at once with the keyboard activation of the opener (`detail 0` is not guarded); inside 300 ms of the first close deliver the second click on Cancel (the mechanics and the in-page timing of decision 4).
- Then: premises first: the in-page `delta` between the close and the second click `< 300` ms, and `document.activeElement` is the opener before the Enter variant; then the second modal exists after the reopening, and the second mouse click closes it (delivered); with `clearPostCloseClickGuard();` removed from `showCityModal` the step fails (the executor runs this mutation three times in a row and quotes the FAIL line of each).
- Verified by: E2E `dg-85` (a step in addition to `dg-82`'s AS-OWP-03); mutation check at stage 4 (three runs).

### AS-CSL-10 Tab walk text (backlog 108)
- Given: `docs/city-modal-focus-copy.md` after this run.
- When: AS-CMF-20 is read.
- Then: it states the order link, field, clear, Cancel, Save; `dg-84`'s assertion (cycle `clear, cancel, save, link, input` from the field) is unchanged and green.
- Verified by: review of the diff of `docs/city-modal-focus-copy.md`; E2E `dg-84`.

### AS-CSL-11 Clicking the city field right after the modal closes (backlog 110)
- Given: the city modal opened from the weather dialog's city field.
- When: the modal closes (Escape, Cancel, Save) and the scenario clicks the dialog's `button.city-field` through `clickWhenActionable` (decision 6: it waits for the observed 300 ms of the post-close click guard plus a margin, then the real pointer click).
- Then: the click is a real pointer click (no `evaluate(click)`, no bare sleep) and it took effect: the city modal opened again (asserted, not only "no exception"), in 10 consecutive runs of the step without a timeout; the scenarios that worked around the problem use the helper; the probe's first hypothesis is the guard (a real click in the first 300 ms must be shown to do nothing); if the probe finds a product cause other than the intended guard the run records a backlog line instead (decision 6).
- Verified by: E2E `dg-85` and the converted scenarios.

### AS-CSL-12 Focus ring of "use your location" (backlog 113)
- Given: the description at rest, the link focused with the keyboard (`:focus-visible`), in the change modal and on wizard step 1, at 500 and 320 px, light and dark.
- When: the ring box (link box plus padding plus 2 px) is compared with `Range` rects of single characters: the last non-space character of the preceding text (the text node `Search for a city or ` / `Enter a city, ` ends with a space whose rectangle touches the link, so it is not used), and the first character after the link; if the link wraps to a new line at 320 px, the last rectangle of `getClientRects()` of the link is used.
- Then: the ring does not overlap the last non-space character of the preceding text, with the measured width of the space (§ Live measurement) printed as a premise; it may overlap the directly following `.` or `,` only; the computed `padding-inline` is 1px and `margin-inline` -1px, the radius still equals `--radius-control` (AS-CMF-17), the text does not move (paragraph and text-left-of-link rects equal within 0.5 px with and without focus), the ring is not clipped at 320 px, ring contrast against the panel ≥ 3:1 in both themes; while locating (AS-CMF-13) nothing changes.
- Verified by: E2E `dg-85`; design review (visual lens). Only the comment of `dg-84` about "4px padding" (`dg-84:1399`) is updated: the `dg-84` assertions (`dg-84:1117`: padding > 0 and an equal negative margin; `dg-84:1399`: margin left − 6) are already satisfied by `0 1px`, and AS-CMF-17's text has no padding number to amend.

### AS-CSL-13 No storage and no network change
- Given: any of the scenarios above.
- When: storage and requests are recorded.
- Then: the stored shapes, the number and timing of geocoding and forecast requests and the debounce are those of `origin/main`; nothing in this run writes to storage.
- Verified by: E2E `dg-85`; `npm test`.

### AS-CSL-14 A slow successful response does not reopen a list that has been closed or left
- Given: the geocoding response is delayed by 3 s (above the 250 ms debounce and any Playwright step) and then succeeds with N = 3; premise before the response: `aria-expanded=false`, the list has no options and the request is in flight (the delayed route has not been fulfilled).
- When: (a) the user presses Clear, then the response arrives; (b) focus moves to Cancel (Skip), then the response arrives; (c) with an earlier list, an option is chosen, then the late response of the newer request arrives.
- Then: in all three `aria-expanded=false`, the list has no options and is not displayed; in the normal case (field focused, response arrives) `aria-expanded` becomes `true` exactly when the options appear, not earlier.
- Verified by: E2E `dg-85` (group G9); covers `signal.aborted`, `formGeneration`, the `suggestionsList.contains(document.activeElement)` return (`newtab.js:948`) and the `focusin` cancel.

## Affected earlier scenarios

The executor greps and updates before the implementation task, by the rule "replace, not weaken": every scenario that counts Tab stops through the suggestions or selects `button.weather-form__suggestion` by role `button` (`getByRole("button", …)` becomes `getByRole("option", …)` or a class selector). A check of "Tab reaches the rows" is replaced by a check of the new order (clear → Cancel/Skip → Save) and the earlier AS is marked "amended by run 45", never deleted; the row ring from the keyboard stays covered by the arrow walk.
- `15-city-modal-layout.mjs:315-322` (AS-10 "Tab then enters the open list", the cycle `clear, six items, dismiss, save, link`);
- `dg-52-docked-list-focus-ring.mjs` (the Tab walk `stops = 1 + n + 2 + 1`, `expectedOrder`, `tabOrderFromField`; AS-FR-04 of `docs/docked-list-focus-ring.md` and the "by Tab" part of AS-FR-03; the arrow walk stays);
- `dg-53-dialog-threshold-jump.mjs:342-352` (group 6, the same length `1 + ROWS + 2 + 1`; AS-CSL-06 cites `dg-53` as confirming, so it is updated first);
- `dg-47`, `dg-48`, `dg-49`, `dg-58`, `13-city-modal`, `dg-62` (ring padding), `dg-84` (the comment about 4 px padding only);
- the source pins in `test/newtabSource.test.js` for `createCityForm` and `.city-location-link:focus-visible`.

## Review focus

1. Scenarios: Tab through the list with 1/3/6 items (8 as a stress case), including the scrolling list, and after a pointer press on an option (focus stays in the field); focus after Enter on an option versus a click; Escape layer order with the list open; `aria-expanded` right after Clear, an empty result and a slow successful response (AS-CSL-14); the wizard and the stacked modal.
2. Visual: no change of the list's geometry (compare boxes with `origin/main`); the link ring at both widths and themes, never over a word character.
3. Accessibility/texts: the combobox/listbox/option tree in a real screen-reader-like snapshot; option names; the `aria-controls` target; the `aria-label` of the list; that `tabindex=-1` options remain reachable by arrows and by pointer; that Save is reachable without the pointer while the list is open.

## Accepted exceptions

- Ruling 2: the overlay list can cover Cancel/Save while open (kept from runs #9, #10, #16).
- Ruling 1: real focus moves onto options; no `aria-activedescendant` (screen readers may announce the move out of the text field).
- Ruling 3: the ring is tighter than run 44's 4 px padding.
- Ruling 4: Tab skips the suggestions (reverses "Tab reaches the rows" of runs #9/#10); arrows are the keyboard way into the list.
- The list-flip step of `docs/dialog-threshold-jump.md` stays.
- No live-region announcement of the number of suggestions (the expanded combobox is announced by the roles).

## Non-goals

- Layout of the list, the flip, the docked metrics, z-order, `scroll-margin`.
- The stack of the city modal over the weather dialog (41 L2-02, 60 V2-04), the status chip, the starter list's ring (R46); weather reliability (R48).
- Suggestion ranking, debounce, network behaviour, geocoding errors, copy of any visible string (the one new accessible name `City suggestions` is the exception).
- Any storage change or migration; any other backlog item.

## Process

Stage 0 package: this spec, the plan `superpowers/plans/2026-10-17-city-suggestion-list.md`, the kickoff `pipeline/kickoffs/run-45-city-suggestion-list.md`, `inflight/city-suggestion-list.md`. No visual reference: semantics and a one-pixel ring change, described in text. Spec branch `docs/city-suggestion-list-spec`; E2E `dg-85-city-suggestion-list.mjs`. The four Rulings are listed for the owner in `backlog.md` ("Проверить Ruling марафона в `docs/city-suggestion-list.md`").

## Changes after review 1

Revision 2 closes the findings of `pipeline/reports/city-suggestion-list-spec-review.md` and the Minor of the spec gate `design-review/runs/2026-10-17-cc6171a-spec-r1/report.md`. Reviewer defaults accepted where noted.
- **I1** (Tab stop on the scrolling list): `tabindex=-1` on the listbox (decision 1), AS-CSL-01, AS-CSL-04 with 6/8 rows in overlay mode and the scroll premise, kickoff step 1 probe. Default accepted.
- **I2 / L0-01** (post-close guard behind `clickWhenActionable`): decisions 6 and 4, triage 110, AS-CSL-11 (wait from the observed close, assert the effect). Default accepted; the guard is named as the first hypothesis and as a feature.
- **I3** (affected scenarios and documents; reverses documented behaviour): rule "replace, not weaken", `15-city-modal-layout`, `dg-52`, `dg-53` named, Scope extended to `docs/architecture.md:272-273`, `agent-config/CLAUDE.md`, `docs/docked-list-focus-ring.md` AS-FR-04, the 4 px padding line; decision 2 is Ruling 4 (backlog line 118).
- **I4 / L0-02** (slow response): new AS-CSL-14, group G9. Default accepted.
- **I5** (AS-CSL-09 nondeterministic): decision 4 and AS-CSL-09: in-page `delta`, `activeElement` premise, one-task delivery of the second click, mutation run three times. Default accepted. **L0-08** (both openers) taken in the same AS.
- **I6 / L0-06** (AS-CSL-12): last non-space character, `getClientRects()` for a wrapped link, the measured space width as a premise and a table row, fallback to `0 0` (decision 7). Default accepted.
- **M1** one new accessible name instead of "no new text" (AS-CSL-08, Non-goals). **M2 / L0-03** closing is asynchronous for focus leaving, `expect.poll`; the full list of close paths. **M3 / L0-04** focus after a choice is the field. **M4** N = 1, 3, 6; 8 only a stress case. **M5** a pointer press leaves focus in the field (decision 2, AS-CSL-04). **M6** only the `dg-84` comment is updated. **M7** source pin for `tabTrapFocusables` (AS-CSL-04). **M8** id `weather-city-suggestions`. **M9** "estimated from backlog 113 until step 1".
- **L0-05** the 350 ms `recentlyChosen` window in AS-CSL-06. **L0-08** the low window is 600 px high.
- **L0-07** rejected by the gate (not changed).
- Left open: the live measurements of § Live measurement (executor step 1), including the width of the space before the link, which may turn decision 7 into `0 0`.
