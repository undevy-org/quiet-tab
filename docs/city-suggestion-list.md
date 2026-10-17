# City suggestion list: combobox semantics, Tab order, and the leftovers of run 44

## Status

`draft` — revision 1 (2026-10-17, stage 0). Run №45 (`city-suggestion-list`), row Р45 of the roadmap ("Список подсказок города", marathon `kickoffs/marathon-45-51.md`). Backlog: the "no ARIA on the suggestion list" nit of run #10 (`backlog.md`, section "Мелочи от проверяющих"), 41 (overlay list covers Save/Cancel; the L2-02 stack part is R46), 101, 108, 110, 113. The facts under § Triage come from reading `origin/main` at `289ea8d`; the executor's first step is to reproduce every item live and record the result there (an item that does not reproduce is closed with a backlog line and its AS and tasks are dropped by a spec fix).

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

- **ARIA.** `createCityForm` (`newtab.js:~780-900`): `input` has `aria-label="City"` only; `suggestionsList` is a bare `div.weather-form__suggestions`; each item is a `button.weather-form__suggestion` with `data-weather-action="select-city"`. No `role`, `aria-expanded`, `aria-controls`, `aria-autocomplete`, `aria-haspopup`. ArrowDown in the field focuses the first item (real focus), ArrowUp/ArrowDown move through items (`suggestionsList` keydown), ArrowUp on the first item returns to the field. Every item is a Tab stop (the list is inside the `field` wrapper, so `closeListIfFocusLeft` does not close it while focus walks the items), so with N suggestions Tab goes field → clear → N items → Cancel.
- **41 overlay.** `.weather-form__suggestions { position: absolute; top: calc(100% + gap) }` (`surfaces.css:1-16`) while `free >= POPOVER_MIN_FREE` (96 px, `placePopover`); the footer sits in the flow below the field, so the list covers the (empty-height) feedback slot and the Cancel/Save row. This is the accepted design of `docs/modal-overlay-design.md` and `docs/dialog-threshold-jump.md` (accepted exception "the list flip"); a pointer press on the covered area hits an item.
- **101.** `showCityModal` calls `clearPostCloseClickGuard()` (`newtab.js:1443`) and `test/newtabSource.test.js:2168` pins that text. No E2E step reopens the modal inside the 300 ms window of a close and then clicks with the mouse, so removing the call keeps `dg-82` green.
- **108.** `buildCityModal` (`:1091-1107`) appends title, `createCityLocationDescription` (the paragraph with the link), then the form (field, clear, footer). DOM order: link, field, clear, Cancel, Save. `dg-84` (`:1360`) already asserts the cycle `clear, cancel, save, link, input` from the field, which is the same DOM order; only the sentence in `docs/city-modal-focus-copy.md` AS-CMF-20 is wrong.
- **110.** Seven scenarios touch `button.city-field` (`13-city-modal`, `dg-29`, `dg-58`, `dg-62`, `dg-84`, …) and some click it through `page.evaluate`. Cause not measured: either the dialog or its tiles still animate under the closing modal, or the click guard/post-close layout shift delays actionability. The executor measures it (decision 6).
- **113.** `surfaces.css:112-118`: `.city-location-link:focus-visible { padding: 0 4px; margin: 0 -4px; box-shadow: 0 0 0 2px … }` so the ring extends 6 px to each side of the text; the space before the link is ≈3.5 px, the full stop/comma after it has no space.

### Live measurement (executor, step 1; fill in)

| Item | Result | Measured |
|------|--------|----------|
| ARIA | | |
| 41 overlay | | |
| 101 | | |
| 108 | | |
| 110 | | |
| 113 | | |

## Decisions

Technical defaults of the stage-0 author unless marked. No owner question was asked (marathon rule); two UX forks carry a Ruling.

1. **Combobox semantics (technical default; Ruling 1).** The field becomes an ARIA 1.2 combobox with a listbox popup, in both hosts (wizard step 1 and the city modal, they share `createCityForm`):
   - input: `role="combobox"`, `aria-autocomplete="list"`, `aria-haspopup="listbox"`, `aria-controls=<list id>`, `aria-expanded="true"` while the list has items (`isSuggestionsOpen`), `"false"` otherwise; the existing `aria-label="City"` stays;
   - list: `role="listbox"`, a stable id, `aria-label="City suggestions"`; it stays in the DOM when empty (hidden by `:empty { display: none }`), so `aria-controls` always resolves;
   - each item: `role="option"` on the existing `button` (class, `data-*`, text and click handler unchanged), `tabindex="-1"`;
   - **focus model is the one that exists: real focus moves into the list** (ArrowDown from the field to the first option, ArrowUp/ArrowDown between options, ArrowUp on the first returns to the field, Enter/Space/click on an option chooses it). `aria-activedescendant` is not used.
   Ruling (марафон, на проверку Киру): real focus moves onto the options (the existing roving behaviour, with listbox/option roles added), the field does not keep focus while arrowing; альтернатива: focus stays in the input and `aria-activedescendant` points at the highlighted option (typing continues while arrowing); цена ошибки: with the chosen model a screen reader user leaves the text field to browse (Escape or ArrowUp returns), with the alternative a larger rewrite of keyboard handling, the focus ring and the dg-47/48/49/52/53 pins.
2. **Tab leaves the list out (technical default).** Options are arrow-only (`tabindex="-1"`): Tab from the field goes clear → Cancel (or Skip) → Save, never through the suggestions, so the number of Tab presses to reach Save does not depend on the number of suggestions. Focus entering the list by arrow keys or a click still cancels the pending request (`focusin` handler, unchanged). Shift+Tab from an option goes to the field's previous stop in DOM order (the clear button when visible, else the field), and the list stays open while focus is inside the `field` wrapper (unchanged).
3. **The overlay stays an overlay (Ruling 2).** The list keeps its geometry: overlay while `free >= 96`, docked below; flip heights, metrics, z-order and `scroll-margin` unchanged. What changes is access: with decision 2 a keyboard user is no longer forced through the items to reach Save, and the list closes by choosing an item, Escape (`escapeLayer`, unchanged), focus leaving the field wrapper or a pointer release outside it (unchanged). Ruling (марафон, на проверку Киру): keep the overlay list that can cover Cancel/Save while it is open (accepted by runs #9, #10, #16, `docs/dialog-threshold-jump.md`); альтернатива: always dock the list in the flow, or stop the overlay above the footer (the dialog grows, the flip exception disappears, dg-47/48/49/52/53 are rewritten); цена ошибки: a pointer user sees Save hidden under the list until they choose an item, press Escape or click outside the list.
4. **Guard reopen scenario (technical default).** `dg-85` gets a step "Cancel with the mouse, reopen at once by the keyboard, Cancel with the mouse again inside 300 ms of the first close"; the second click must be delivered (the modal closes). The executor proves the step catches the mutation by deleting `clearPostCloseClickGuard();` from `showCityModal`, running the scenario (FAIL line quoted) and restoring it. The source pin stays.
5. **AS-CMF-20 text (technical default).** `docs/city-modal-focus-copy.md` AS-CMF-20 and its sentence in § Decisions (if any) say "location link, field, clear, Cancel, Save" (the DOM order); no code, no `dg-84` change (it already asserts the cycle).
6. **Click after close in E2E (technical default).** The executor first finds the cause with a probe (which element is reported unstable or covered, `locator.click({ trial: true })` timing after the modal closes). If it is the harness only (a transition or the guard layer under the pointer), add one helper `clickWhenActionable(page, locator)` to `.private/e2e/lib/harness.mjs` (waits for `ready` via the actionability the page itself reports: the locator visible, enabled, bounding box stable over two frames; no fixed `sleep`) and use it in the scenarios that currently work around the problem; the workaround `evaluate(click)` calls on `city-field` are replaced, not weakened. If a product element still animates under a closed modal (a real bug), stop and record it as a backlog line (no product change in this run).
7. **Focus ring of the location link (Ruling 3).** The ring never covers a neighbouring word character. Padding becomes `0 1px` with margin `0 -1px` (text does not move), the 2px ring and radius stay, so the ring reaches 3 px beyond the text; the space before the link (≈3.5 px at the modal's text size, measured) is wider than that, and only a directly adjacent `,` or `.` after the link may be touched. Ruling (марафон, на проверку Киру): reduce the ring's reach to 3 px per side (was 6 px, decision 7 of run 44 set 4 px padding); альтернатива: keep 4 px padding and add an equal margin of space around the link (changes the sentence's measure and the field position); цена ошибки: a tighter, less airy ring around the link text, still ≥ 3:1 against the panel.

## Scope

- Roles and states of the field and list (decision 1), Tab order (decision 2), both hosts; no pixel change of the list, field or dialog.
- Items 101, 108, 110, 113 as above; E2E `dg-85-city-suggestion-list.mjs` (the next free number after `dg-84`).
- Updates (never weakening) of earlier scenarios that pin the Tab walk through items or the list's markup: the executor greps `.private/e2e/scenarios/` for `weather-form__suggestion`, `ArrowDown` and Tab walks (`dg-47`, `dg-48`, `dg-49`, `dg-52`, `dg-53`, `dg-58`, `13-city-modal`, `dg-84`) and `test/newtabSource.test.js` / `test/weatherSource.test.js`.
- `CHANGELOG.md` `[Unreleased]`; `docs/architecture.md` / `agent-config/CLAUDE.md` DOM-contract sentence for the list.

## Acceptance scenarios

Common setup of `dg-85`: the harness as in `dg-84` (clean profile, six system tiles seeded, Open-Meteo geocoding routed by `setNet` to N canned suggestions `Tbilisi 1..N` or an empty result), both hosts (the wizard's step 1 and the change modal opened from the "Set a city" hint; one scenario also stacked over the weather dialog), widths 500 and 320, 1280×800 unless stated.

### AS-CSL-01 Roles and states, closed
- Given: a host open, the field empty or prefilled, no suggestions.
- When: read the field and the list.
- Then: the input has `role=combobox`, `aria-autocomplete=list`, `aria-haspopup=listbox`, `aria-expanded=false`, `aria-label="City"`, and `aria-controls` equal to the id of an element that exists and has `role=listbox` and the name `City suggestions`; the list has no options; its box is `display: none`.
- Verified by: E2E `dg-85`.

### AS-CSL-02 Roles and states, open
- Given: typing a prefix returns N = 1, 3 and 8 suggestions.
- When: the list renders.
- Then: `aria-expanded=true`; the list holds N elements with `role=option`, each a `button`, each with `tabindex=-1`, the accessible name equal to its visible text `Name, Region, Country` (parts that exist, as today), `data-weather-action=select-city` and the coordinates unchanged; the list's bounding box and the options' boxes equal those measured on `origin/main` (±0.5 px: same overlay or docked placement); when the list closes (choice, Escape, focus leaves, Clear, an empty result) `aria-expanded` returns to `false` in the same frame.
- Verified by: E2E `dg-85`; `dg-53`/`dg-52` keep their metric assertions green.

### AS-CSL-03 Keyboard inside the list
- Given: 3 suggestions open, focus in the field.
- When: ArrowDown, ArrowDown, ArrowUp, ArrowUp, ArrowUp; then ArrowDown, Enter.
- Then: focus goes option 1, option 2, option 1, field, field (no wrap, no move past the field); then Enter on option 1 chooses it exactly as a click does (field filled, list closed, `aria-expanded=false`, Save enabled, no second geocoding, no storage write before Save); focus is where it is today after a choice (the executor records it in the triage; the scenario asserts that value, which is not changed by this run).
- Verified by: E2E `dg-85`.

### AS-CSL-04 Tab does not walk the options
- Given: 1, 3 and 8 suggestions open; focus in the field; change modal (Cancel | Save) and wizard step 1 (Skip | Continue).
- When: Tab repeatedly.
- Then: the stops are the clear button, then Cancel (Skip), then Save (Continue), in the same number of presses for every N; no option is reached by Tab; when focus leaves the field wrapper (on Cancel) the list closes and `aria-expanded=false`. Shift+Tab from Cancel returns to the clear button with the list still closed. Focus placed on an option by ArrowDown and then Tab goes to Cancel (Skip), and the list closes.
- Verified by: E2E `dg-85`.

### AS-CSL-05 Escape and choosing while the list is open
- Given: 3 suggestions open, focus on option 2 (arrows) and, separately, in the field.
- When: Escape.
- Then: the first Escape closes only the list (the modal stays open, the order of `escapeLayer` is unchanged), `aria-expanded=false`, focus is in the field; a second Escape closes the modal. Choosing an option by click: list closed, field filled.
- Verified by: E2E `dg-85`; `dg-84` AS-CMF-20 stays green.

### AS-CSL-06 The overlay is unchanged (Ruling 2)
- Given: 1, 3 and 8 suggestions, windows 800 px high (overlay) and a low window (docked) at widths 500 and 320.
- When: measure the list and the footer.
- Then: the overlay/docked decision, the flip heights (re-measured as in `docs/dialog-threshold-jump.md`, never typed) and every edge of the dialog are those of `origin/main`; in overlay mode the list may cover Save/Cancel; pressing Escape or choosing an item uncovers them and a click on Save then works; the same Save is reachable with the keyboard by Tab without touching an option (AS-CSL-04).
- Verified by: E2E `dg-85`; `dg-53`.

### AS-CSL-07 Both hosts, stacked and narrow
- Given: wizard step 1 at 500 and 320 px; the change modal at 500 and 320 px; the change modal stacked over the weather edit dialog.
- When: AS-CSL-01, 02 and 04 are repeated.
- Then: the same roles, states and Tab walk; the stacked case also keeps the dialog under the modal inert; no horizontal overflow and no new tab stop outside the wizard's locked starter list.
- Verified by: E2E `dg-85`.

### AS-CSL-08 Screen reader names and texts
- Given: the modal in the open state with 3 suggestions.
- When: the accessibility tree (Playwright `ariaSnapshot`) is read.
- Then: it contains `combobox "City"` (expanded), `listbox "City suggestions"` with `option` children named by their text, and no other new text appears anywhere (no visible string changes in this run).
- Verified by: E2E `dg-85`; design review (accessibility lens).

### AS-CSL-09 A reopened modal does not swallow its own click (backlog 101)
- Given: the change modal open from the weather dialog's city field or the hint tile.
- When: click Cancel with the mouse; immediately (inside 100 ms) press Enter on the focused opener (keyboard activation, `detail 0`, is not guarded) so the modal opens again; inside 300 ms of the first close click Cancel with the mouse again.
- Then: the second modal exists after the Enter, and the second mouse click closes it (delivered); with `clearPostCloseClickGuard();` removed from `showCityModal` the step fails (the executor runs this mutation once and quotes the FAIL line).
- Verified by: E2E `dg-85` (a step in addition to `dg-82`'s AS-OWP-03); mutation check at stage 4.

### AS-CSL-10 Tab walk text (backlog 108)
- Given: `docs/city-modal-focus-copy.md` after this run.
- When: AS-CMF-20 is read.
- Then: it states the order link, field, clear, Cancel, Save; `dg-84`'s assertion (cycle `clear, cancel, save, link, input` from the field) is unchanged and green.
- Verified by: review of the diff of `docs/city-modal-focus-copy.md`; E2E `dg-84`.

### AS-CSL-11 Clicking the city field right after the modal closes (backlog 110)
- Given: the city modal opened from the weather dialog's city field.
- When: the modal closes (Escape, Cancel, Save) and the scenario clicks the dialog's `button.city-field` as soon as the helper reports it ready.
- Then: the click is a real pointer click through `clickWhenActionable` (no `evaluate(click)`), succeeds without a fixed sleep and without a timeout in 10 consecutive runs of the step; the scenarios that worked around the problem use the helper; if the probe finds a product cause the run records a backlog line instead (decision 6).
- Verified by: E2E `dg-85` and the converted scenarios.

### AS-CSL-12 Focus ring of "use your location" (backlog 113)
- Given: the description at rest, the link focused with the keyboard (`:focus-visible`), in the change modal and on wizard step 1, at 500 and 320 px, light and dark.
- When: the ring box (link box plus padding plus 2 px) is compared with the boxes of the text nodes before and after it (`Range` rects).
- Then: the ring does not overlap the last glyph of the preceding text (`Search for a city or ` / `Enter a city, `); it may overlap the directly following `.` or `,` only; the computed `padding-inline` is 1px and `margin-inline` -1px, the radius still equals `--radius-control` (AS-CMF-17), the text does not move (paragraph and text-left-of-link rects equal within 0.5 px with and without focus), the ring is not clipped at 320 px, ring contrast against the panel ≥ 3:1 in both themes; while locating (AS-CMF-13) nothing changes.
- Verified by: E2E `dg-85`; design review (visual lens). AS-CMF-17's numbers for padding are amended to this decision.

### AS-CSL-13 No storage and no network change
- Given: any of the scenarios above.
- When: storage and requests are recorded.
- Then: the stored shapes, the number and timing of geocoding and forecast requests and the debounce are those of `origin/main`; nothing in this run writes to storage.
- Verified by: E2E `dg-85`; `npm test`.

## Affected earlier scenarios

The executor greps and updates (never weakens) before the implementation task: every scenario that counts Tab stops through the suggestions or selects `button.weather-form__suggestion` by role `button` (`getByRole("button", …)` becomes `getByRole("option", …)` or a class selector), `dg-47`, `dg-48`, `dg-49`, `dg-52`, `dg-53`, `dg-58`, `13-city-modal`, `dg-62` (ring padding), `dg-84` (AS-CMF-17's padding assertions: the spec now says `0 1px`), and the source pins in `test/newtabSource.test.js` for `createCityForm` and `.city-location-link:focus-visible`.

## Review focus

1. Scenarios: Tab through the list with 1/3/8 items and after a pointer press on an option; focus after Enter on an option versus a click; Escape layer order with the list open; `aria-expanded` right after Clear, an empty result and a late response; the wizard and the stacked modal.
2. Visual: no change of the list's geometry (compare boxes with `origin/main`); the link ring at both widths and themes, never over a word character.
3. Accessibility/texts: the combobox/listbox/option tree in a real screen-reader-like snapshot; option names; the `aria-controls` target; the `aria-label` of the list; that `tabindex=-1` options remain reachable by arrows and by pointer; that Save is reachable without the pointer while the list is open.

## Accepted exceptions

- Ruling 2: the overlay list can cover Cancel/Save while open (kept from runs #9, #10, #16).
- Ruling 1: real focus moves onto options; no `aria-activedescendant` (screen readers may announce the move out of the text field).
- Ruling 3: the ring is tighter than run 44's 4 px padding.
- The list-flip step of `docs/dialog-threshold-jump.md` stays.
- No live-region announcement of the number of suggestions (the expanded combobox is announced by the roles).

## Non-goals

- Layout of the list, the flip, the docked metrics, z-order, `scroll-margin`.
- The stack of the city modal over the weather dialog (41 L2-02, 60 V2-04), the status chip, the starter list's ring (R46); weather reliability (R48).
- Suggestion ranking, debounce, network behaviour, geocoding errors, copy of any string.
- Any storage change or migration; any other backlog item.

## Process

Stage 0 package: this spec, the plan `superpowers/plans/2026-10-17-city-suggestion-list.md`, the kickoff `pipeline/kickoffs/run-45-city-suggestion-list.md`, `inflight/city-suggestion-list.md`. No visual reference: semantics and a one-pixel ring change, described in text. Spec branch `docs/city-suggestion-list-spec`; E2E `dg-85-city-suggestion-list.mjs`. The three Rulings are listed for the owner in `backlog.md` ("Проверить Ruling марафона в `docs/city-suggestion-list.md`").
