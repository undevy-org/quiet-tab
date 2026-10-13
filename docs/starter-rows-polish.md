# Onboarding starter rows polish: hover, quieter "off" row, busy look, forced-colors progress, E2E base build

## Status

`implemented` — revision 4 (2026-10-13, after spec review rounds 1–4 and spec gate rounds 1–2 (`2026-10-13-9aaf0dd-spec-r2`)). Run №33 (`starter-rows-polish`). A follow-up of run 26 (`docs/onboarding-starter-rows.md`); run 32 (`favicon-globe-fallback`) is merged (`ab7b415`), both touched the step 2 row styles in `src/surfaces.css` and the E2E scenarios around them.

**Data compatibility: not required** (no storage change).

Related: `docs/onboarding-starter-rows.md` (decisions 3, 4, 5 and `## Accepted exceptions`), `docs/onboarding-wizard.md` (decision 5, step 2 and the progress pills), `src/surfaces.css`, `.private/e2e/lib/harness.mjs`.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-13 | A hover response on the starter row is needed. | `confirmed` | § Decision 1 |
| 2026-10-13 | Make the dark-theme "off" row closer to the dialog colour. | `confirmed` | § Decision 2 |
| 2026-10-13 | Mute the rows while Finish is writing. | `confirmed` | § Decision 3 (backlog 81) |
| 2026-10-13 | Include backlog 83 (E2E base build). Backlog 82 (progress pills under forced colors) rides along. | `confirmed` | § Decisions 4, 5 (backlog 59, 82, 83) |
| 2026-10-13 | Backlog 85 (letter glyph too faint in an unchecked row, found by run 32) joins: it is the same CSS rule that decision 2 rewrites. | `added by the orchestrator` after run 32 merged; the owner can drop it | § Decision 2 (backlog 85) |
| 2026-10-13 | Review round 1: busy look follows the design-system disabled tokens (0.62, `wait`) instead of the first-draft 0.6 / `default`. | `reviewer finding I7`, default changed; the owner can override | § Decision 3 |
| 2026-10-13 | Review rounds 2–4 and spec gate rounds 1–2: the held write is keyed on `quietTabWidgetsMeta`, `aria-busy` sits on the dialog, the letter opacity is fixed at 0.6 (no 0.5 floor), AS for hover transitions and the hybrid-pointer case added. | `reviewer and gate findings`, applied | § Decisions 2, 3; AS-SRP-01, 06, 08 |

## Current behaviour (`main` after run 32, `ab7b415`)

- Since run 32 a starter icon that is Chrome's default globe is replaced by the letter (`.onboarding-wizard__starter-icon--letter`), after a pending state (`[data-icon-check="pending"]`, `visibility: hidden`); this run does not touch that logic. The letter is now the common look of an icon, so its contrast in an unchecked row matters (backlog 85).
- A starter row has no hover style: `cursor: pointer` is the only affordance (run 26 `## Accepted exceptions`). The hit target is the transparent checkbox `input` laid over the row; the visible surface has `pointer-events: none`.
- An unchecked row is `filter: grayscale(1)` on the whole surface, icon `opacity` 0.4 (favicon `img` and letter alike, one rule `.onboarding-wizard__starter-icon`). In the dark theme the grey of the filtered surface is a neutral `rgb(33,33,33)` (the painted pixel: the computed `background-color` of the surface stays `rgb(29,34,41)`) while the dialog is `rgb(29,34,41)`, so the off row looks like a grey block on a blue-grey panel.
- While Finish writes (`favoritesBusy`), the 8 checkboxes are `disabled` but the rows look normal; a click is ignored silently. No timer ends the busy phase: it lasts as long as the write.
- Under `forced-colors: active` the two progress pills (`.onboarding-wizard__pill`, `--active`) have no border and disappear into the dialog background. Both pills are active on step 2 (`index < activeCount`).
- `.private/e2e/lib/harness.mjs` `buildFromRef` archives only `manifest.json src icons`, so a build from a git ref (`ctx.base`) lacks `rules/` (the manifest declares `rules/nominatim-user-agent.json`) and cannot open a tab (`ERR_BLOCKED_BY_CLIENT`): `01-upgrade` is red on a clean base (backlog 59) and `dg-73` AS-OSR-10 works around it with a private build (backlog 83).

## Default decisions (owner can override)

1. **Hover.** On a device with a hover pointer, inside `@media (hover: hover)`, the rule
   `.onboarding-wizard__starter input[type="checkbox"]:not(:disabled):hover + .onboarding-wizard__starter-surface` paints `background: var(--soft-fill)` on the surface of an ENABLED row (the overlay `input` is the hit target, and `label:hover` is also true over a disabled input, so the selector keys on the input). The border stays. It applies to checked and unchecked rows alike, in both themes. No transition (the wizard has none, `surfaces.css:30`). The letter chip (`.onboarding-wizard__starter-icon--letter`, `background: var(--soft-fill)`) would vanish on the same fill, so on hover it takes `var(--soft-fill-strong)`. The letter glyph on the hovered chip (`--soft-fill-strong`) stays ≥ 3:1 at `opacity: 0.6` (4.39 light / 4.93 dark, computed over `--soft-fill`, 4.25 / 5.02 over `--panel`). The checkbox fill stays `--panel`; the inset focus ring (`box-shadow` on the surface) is unchanged and stays visible over the hover fill because hover changes only `background`. Contrast (measured by token in review; `--soft-fill` is the alias of `--color-fill-soft`, the unit tests read the latter): `--muted` on `--soft-fill` 5.15 (light) / 5.99 (dark), `--text` on it 16.40 / 12.11; both labels pass 4.5:1 with no fallback. The empty-check border `--border-control` against its own `--panel` fill stays ≥ 3:1 (3.33 / 3.28); against the outer hover fill it is 2.94 / 2.69 (accepted, `## Accepted exceptions`). Under `forced-colors: active` there is no hover response (the browser replaces the fill).
2. **Quieter "off" row.** The grey no longer comes from a filter on the whole surface. An unchecked row keeps the surface colour of the dialog (`background: var(--panel)`, border `var(--border)`, no `filter`), and reads "off" through the muted label (`var(--muted)`), the empty check (border `--border-control`), and the icon: `filter: grayscale(1)` on the ICON only. **Opacity per icon kind** (the selectors are separate, so specificity does not decide silently): the favicon `img.onboarding-wizard__starter-icon` keeps `opacity: 0.4`; the letter `.onboarding-wizard__starter-icon--letter` gets `opacity: 0.6` (backlog 85). Computed from the tokens (glyph over chip, both mixed with `--panel` at α; forced colours: chip = Canvas): α 0.4 gives 2.47 / 3.28 / 2.85 (light / dark / forced), α 0.5 gives 3.29 / 4.30 / 3.98, α 0.6 gives 4.51 / 5.51 / 5.74, so 0.6 keeps ≥ 3:1 in all three with margin in the light theme (the weakest) and still reads "off" next to the full-strength checked row. The value is fixed: **0.6**. The letter is the row's identity glyph (information, not decoration), so the test is the non-text contrast threshold **3:1** (WCAG 1.4.11) against its chip, in all three modes; 0.6 passes it with margin (4.51 light, the weakest) and also holds against the hovered chip (see decision 1). The plan probe measured the real pixels (4.56 / 5.56 / 5.74 at 0.6, never below 3:1); the computed contrast is the assertion, the pixel sample (the pixel farthest from the chip, so an upper estimate) is a sanity check. In the light theme the row looks as before; in the dark theme it takes the dialog colour. Supersedes decision 3 of `docs/onboarding-starter-rows.md`. Contrast stays exact: label ≥ 4.5:1 and check border ≥ 3:1 against `--panel` (5.84 / 7.30 and 3.33 / 3.28 measured in run 26). The measurement method for the letter is computed contrast of `over(colour, --panel, α)` for glyph and chip (chip = Canvas under forced colours, resolved with a probe element as in `dg-73`), cross-checked by a screenshot pixel sample in the probe.
3. **Busy look (backlog 81).** While the rows are disabled (Finish writing), each row is muted by the design-system disabled tokens: the surface gets `opacity: var(--control-disabled-opacity)` (0.62) and the `input:disabled` overlay gets `cursor: wait` (`docs/design-system.md`: disabled controls are 0.62 and `wait` while busy; Finish and Back in the same phase already do this). The base `cursor: pointer` of the enabled input rule is not touched. No hover (decision 1 excludes `:disabled`). When the write fails and the rows are enabled again, the rows return to normal. Disabled controls are exempt from the contrast rule (WCAG 1.4.3 inactive components), so the 0.62 is a visual choice; the favicon `img` is nested (0.4 × 0.62) and the tests read the surface `opacity`, not the product. The focus behaviour of run 25 (focus back on Finish after a failed Finish) is unchanged. The owner can ask for `cursor: default` instead; that is a one-line change.
4. **Progress pills under forced colors (backlog 82).** In `@media (forced-colors: active)`: `.onboarding-wizard__pill` gets `border: 1px solid CanvasText`, `.onboarding-wizard__pill--active` gets `background: Highlight`. The pill height stays 5px (`box-sizing: border-box` is global). Nothing changes outside forced colors. With decision 2 there is no surface `filter` left, so the `filter: none` rule (and its comment) that run 26 added to the forced-colors block is removed.
5. **E2E base build (backlog 59, 83).** `buildFromRef` copies `rules/` from the ref when the ref has it (`git ls-tree` via `execFileSync` first, then `git archive` of the `rules` path only; older refs without `rules/` still build as before). `dg-73` AS-OSR-10 switches back to `ctx.base`, the private `base-73` build is removed (and `fs`/`path` imports if they become unused). Record the run status of `01-upgrade` on a clean base before and after the fix (its check is the base meta version `[2,3]`, so "a tab opens" alone does not make it green): if it turns green, backlog 59 and 83 are closed and the "known red" wording in the kickoffs and `permissions.md` is not edited (a rights file; the owner decides); the verifier reports the new state.
6. **Unchanged.** Starter table, the checked row, the focus ring (inset, `--focus-ring`), forced-colors outline, check glyph, sizes, tab order, names, Finish, storage, the run 32 default-icon logic.

## Scope

- `src/surfaces.css`: hover rule (and the letter chip hover), unchecked rule (no surface filter), icon filter/opacity per kind, busy rule, forced-colors pills; delete the surface `filter` rules and the forced-colors `filter: none` rule with its comment.
- `.private/e2e/lib/harness.mjs` (`buildFromRef`; no new storage helper: `failStorageSetAfter` with `ms` 0 rejects at once and with `ms` > 0 answers with success after the delay), `.private/e2e/scenarios/dg-73-onboarding-starter-rows.mjs` (AS-OSR-04, 08, 09, 10 amended: the surface `filter === "grayscale(1)"` check, the `opacity === "0.4"` check for any icon, the AS-OSR-09 letter opacity, the empty AS-OSR-08 `filter: none` check, `base-73`), a new `dg-75-starter-rows-polish.mjs`.
- `test/borderContrast.test.js`, `test/newtabSource.test.js` (pin 5 about `filter` and forced colours is rewritten; pins of the new rules; each proven by mutation).
- `docs/onboarding-starter-rows.md` (decision 3 line 54, decision 5 line 58, `## Accepted exceptions` lines 141, 145, 147), `docs/onboarding-wizard.md` (step 2 line 39 and pills), `CHANGELOG.md` `[Unreleased]`, this spec (`implemented`). Every remaining sentence of `docs/onboarding-starter-rows.md` that describes the grey filtered surface, the 0.4 letter, or "no hover" (AS-OSR-04 and AS-OSR-09 included) is marked superseded by this spec in the docs task.

## Acceptance scenarios

Common setup: harness **1280×800**, wizard step 2, eight starters, light theme unless noted; hover is done with `page.mouse.move` to a point inside the row; each group parks the pointer first (`page.mouse.move(2, 2)`), and a group without hover leaves it away from the rows.

### AS-SRP-01 Hover paints the enabled row
- Given: step 2, rows enabled, `matchMedia("(hover: hover)").matches === true` (entry probe; if false the group reports ERROR, not pass), not forced colors.
- When: the mouse moves over a checked row, then over an unchecked row.
- Then: the hovered surface `background-color` equals the resolved `--soft-fill`; the border colour is unchanged; a letter chip in that row equals the resolved `--soft-fill-strong` (differs from the hovered surface) and the glyph on it is ≥ 3:1; the focused hovered row still shows the inset `--focus-ring` shadow; leaving restores `--panel` (and the chip `--soft-fill`); no `transition` is declared on the surface. Light and dark theme.
- Verified by: E2E `dg-75`; `newtabSource` pin.

### AS-SRP-02 Hovered label and empty check stay readable
- Given: a hovered checked and a hovered unchecked row, both themes.
- When: reading the label colour, the surface background and the empty-check border.
- Then: label contrast ≥ 4.5:1 against the hovered surface; the empty-check border is ≥ 3:1 against its own `--panel` fill.
- Verified by: E2E `dg-75` (computed pixels); unit in `test/borderContrast.test.js` (tokens: `--text` and `--muted` against `--color-fill-soft`, `--border-control` against `--panel`).

### AS-SRP-03 Unchecked row takes the dialog colour
- Given: an unchecked and a checked row, light and dark theme, and forced colors for the letter.
- When: reading computed styles.
- Then: the unchecked surface `background-color` equals the resolved `--panel` (the dialog colour) and `filter` is `none`; the unchecked icon has `filter: grayscale(1)`; a favicon `img` has `opacity` 0.4; the letter icon has `opacity` 0.6 (decision 2) and its glyph contrast against its chip, computed as in decision 2, is ≥ 3:1 in light, dark and forced colors; label colour equals `--muted`; check border equals `--border-control`; label ≥ 4.5:1 and check border ≥ 3:1 against `--panel`. The checked row is unchanged.
- Verified by: E2E `dg-75` (amends `dg-73` AS-OSR-04 and 09); `borderContrast` units.

### AS-SRP-04 Busy rows are muted and inert
- Given: step 2, Finish writing: every `sync.set` that carries the key `quietTabWidgetsMeta` (meta and items are written in one batched call) is held for 9000 ms (longer than the 8 s status timer and every guard window) and then succeeds.
- When: the write is in flight, sampled at 0.5 s, 4 s and 8.5 s counted from the Finish click.
- Then: at each sample all 8 checkboxes are `disabled`, each surface has `opacity` equal to the resolved `--control-disabled-opacity`, the `input` `cursor` is `wait`, `aria-busy="true"` is still set on the `[role=dialog]`, hovering a row paints nothing, and clicking a row changes no `checked`. After the answer the wizard is closed.
- Verified by: E2E `dg-75`; `newtabSource` pin.

### AS-SRP-04b Busy rows after a failed write
- Given: step 2, a failing Finish write (`failStorageSetAfter`).
- When: the write is rejected.
- Then: the rows are enabled again with surface `opacity` 1, `input` `cursor` pointer, hover works, and focus is on Finish (run 25). The short busy window of a failed write is covered by the source pin and a `MutationObserver` on `disabled` (a live window of a failed write is not made visible; no extra helper).
- Verified by: E2E `dg-75`; `newtabSource` pin.

### AS-SRP-05 Forced colors: progress pills and focus
- Given: `forced-colors: active` emulated, step 1 and step 2.
- When: reading the pills and the focused unchecked row.
- Then: each pill has a solid 1px border (not transparent) and keeps height 5px; on step 1 the active pill's `background-color` differs from the inactive one; on step 2 both pills have `background-color` equal to the probe-resolved `Highlight` (the keyword itself cannot be compared, the harness resolves it, `dg-73`); the focused unchecked row's outline is `solid 2px` with `-2px` offset and the probe-resolved `Highlight` colour (no surface filter exists any more).
- Verified by: E2E `dg-75` (amends `dg-73` AS-OSR-08).

### AS-SRP-06 No hover on touch
- Given: the hover rule sits inside `@media (hover: hover)`.
- When: reading the stylesheet; and, loading the wizard and, on the open page, switching `(hover: hover)` to false with CDP `Emulation.setTouchEmulationEnabled { enabled: true, maxTouchPoints: 5 }` (the probe found that `page.emulateMedia({ hover })`, CDP `Emulation.setEmulatedMedia` and context `hasTouch`/`isMobile` do not flip it); the tap is CDP `Input.dispatchTouchEvent`.
- Then: (a) the hover rule and the chip hover rule are rules whose parent is a `CSSMediaRule` with `(hover: hover)`, and no hover rule of `.onboarding-wizard__starter` selectors exists outside it, with at least two found inside (always asserted: source pin and a stylesheet walk in `dg-75`); (b) where the emulation works, a tap toggles the row and no hover background remains. A hybrid device (touch screen with a mouse) matches `(hover: hover)` and may keep a hover fill under the last touch point: this is browser behaviour and an accepted exception.
- Verified by: `newtabSource` pin; E2E `dg-75` stylesheet walk (and the emulation where it works).

### AS-SRP-07 `ctx.base` opens a tab
- Given: a build from `origin/main` through `buildFromRef`, and a build from the first commit that has `manifest.json`, `src` and `icons` but no `rules/` (`30084c299324a746fcf6b9c00669b8be7318878f`, the 0.1.0 release).
- When: the harness opens the new tab page.
- Then: the page loads (no `ERR_BLOCKED_BY_CLIENT`) for the first; the second still builds; `dg-73` AS-OSR-10 uses `ctx.base` without a private build; the run status of `01-upgrade` on a clean base before and after is recorded as a fact in the verification report (green or red, either outcome satisfies this AS; measured in run 33: before ERROR `net::ERR_BLOCKED_BY_CLIENT` with 0 checks, after green).
- Verified by: E2E `dg-73` / `dg-75` (a check that opens `ctx.base`); harness self-test.

### AS-SRP-08 Hover and busy interplay
- Given: step 2, the pointer resting over an enabled row (a hover fill is painted), Finish (with at least one link, k ≥ 1) started with the 9000 ms held write of AS-SRP-04.
- When: the write is in flight; then (second run) the write fails.
- Then: while busy the row under the resting pointer paints `--panel` (no hover fill) with surface `opacity` 0.62; after the failed write the rows are enabled, and the hover fill is painted again under the resting pointer (the probe saw it return without a mouse move) and on a `page.mouse.move` to another row. Scrolling the list with the wheel while the pointer rests is not asserted by E2E (Chromium refreshes `:hover` after a short timer): it is a checkpoint-lens item (`## Review focus`).
- Verified by: E2E `dg-75`; checkpoint lens 1.

## Paint-only

The change is colour, opacity, cursor and border only: row geometry, sizes, text, DOM, tab order and animations are untouched (no new string, no new animation, so `prefers-reduced-motion` is not affected), at every window width; `dg-73` AS-OSR-10 geometry checks must stay green. Finish with zero starters (k = 0) and every other path that disables the boxes share the same `finishBusy` look; a failed flag write after the links were added is backlog 80, out of scope.

## Review focus

- Dark-theme "off" row: does it still read "off" without the grey block (label, empty check, grey icon)? The letter at 0.6 is brighter than the 13px / 600 `--muted` label: does the off row still look off? (AS-SRP-03)
- Hover/busy interplay: no hover on a disabled row, no stuck hover after a tap, a slow successful write stays muted (AS-SRP-04, 06).
- Contrast of the hovered label on `--soft-fill` in both themes and the letter chip on hover (AS-SRP-01, 02). The chip on hover (`--soft-fill-strong` against `--soft-fill`, about 1.1:1) is barely visible; accepted, the glyph on it stays ≥ 3:1 (4.39 / 4.93).
- Forced colors: pills and focus ring (AS-SRP-05).
- Wheel scroll with a resting pointer: does the hover follow the row under the pointer (not asserted by E2E)? (AS-SRP-08)

## Accepted exceptions

- No transition on hover (the wizard has none).
- No hover response under forced colors (the browser replaces the fill).
- The empty-check border against the outer hover fill is 2.94 / 2.69 (below 3:1); against its own `--panel` fill it is 3.33 / 3.28.
- The busy `opacity` 0.62 is below the contrast thresholds by design (disabled controls are exempt).
- If `01-upgrade` turns green, `permissions.md` keeps its wording until the owner changes it.

## Non-goals

- A different layout, size or type of the row, or the favicon handling (run 32).
- Changing the busy flow itself (guards, focus return), or backlog 80.
- Backlog 84 (letters hidden from assistive technology) and 86 (empty 1×1 tile while the default-icon check is pending): both are about the run 32 logic, not the starter row styles.
- Editing `permissions.md`.

## Process

Full UI pipeline (`quiet-tab-pipeline`); design checkpoint on step 2 in both themes with hover and busy states.
