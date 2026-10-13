# Onboarding starter rows polish: hover, quieter "off" row, busy look, forced-colors progress, E2E base build

## Status

`draft` — revision 1 (2026-10-13). Run №33 (`starter-rows-polish`). A follow-up of run 26 (`docs/onboarding-starter-rows.md`); **starts only after run 32 (`favicon-globe-fallback`) is merged**, because both touch the step 2 row styles in `src/surfaces.css` and the E2E scenarios around them.

**Data compatibility: not required** (no storage change).

Related: `docs/onboarding-starter-rows.md` (decisions 3, 4, 5 and `## Accepted exceptions`), `docs/onboarding-wizard.md` (decision 5, step 2 and the progress pills), `src/surfaces.css`, `.private/e2e/lib/harness.mjs`.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-13 | A hover response on the starter row is needed. | `confirmed` | § Decision 1 |
| 2026-10-13 | Make the dark-theme "off" row closer to the dialog colour. | `confirmed` | § Decision 2 |
| 2026-10-13 | Mute the rows while Finish is writing. | `confirmed` | § Decision 3 (backlog 81) |
| 2026-10-13 | Include backlog 83 (E2E base build). Backlog 82 (progress pills under forced colors) rides along. | `confirmed` | § Decisions 4, 5 (backlog 59, 82, 83) |

## Current behaviour (`main` after run 32)

- A starter row has no hover style: `cursor: pointer` is the only affordance (run 26 `## Accepted exceptions`).
- An unchecked row is `filter: grayscale(1)` on the whole surface, icon `opacity` 0.4. In the dark theme the grey of the filtered surface is a neutral `rgb(33,33,33)` while the dialog is `rgb(29,34,41)`, so the off row looks like a grey block on a blue-grey panel.
- While Finish writes (`favoritesBusy`), the 8 checkboxes are `disabled` but the rows look normal; a click is ignored silently.
- Under `forced-colors: active` the two progress pills (`.onboarding-wizard__pill`, `--active`) have no border and disappear into the dialog background.
- `.private/e2e/lib/harness.mjs` `buildFromRef` does not copy `rules/`, so a build from a git ref (`ctx.base`) cannot open a tab (`ERR_BLOCKED_BY_CLIENT`): `01-upgrade` is red on a clean base (backlog 59) and `dg-73` AS-OSR-10 works around it with a private build (backlog 83).

## Default decisions (owner can override)

1. **Hover.** On a device with a hover pointer (`@media (hover: hover)`), `.onboarding-wizard__starter:hover` paints the surface of an ENABLED row with `background: var(--soft-fill)`; border stays. It applies to checked and unchecked rows alike, in both themes. No transition (the wizard has none, `surfaces.css:30`). Not applied while the row is disabled (decision 3). The label stays ≥ 4.5:1 on `--soft-fill` in both themes (checked on the unit test in `test/borderContrast.test.js`: `--text` and `--muted` against `--color-fill-soft`; if `--muted` on `--soft-fill` falls below 4.5:1, the hovered unchecked label uses `--text`).
2. **Quieter "off" row.** The grey no longer comes from a filter on the whole surface. An unchecked row keeps the surface colour of the dialog (`background: var(--panel)`, border `var(--border)`, no `filter`), and reads "off" through the muted label (`var(--muted)`), the empty check (border `--border-control`), and the icon: `filter: grayscale(1)` and `opacity: 0.4` on the ICON only (favicon `img` and the letter icon alike). In the light theme the row looks as before; in the dark theme it takes the dialog colour. Supersedes decision 3 of `docs/onboarding-starter-rows.md`. Contrast stays exact: label ≥ 4.5:1 and check border ≥ 3:1 against `--panel` (5.84 / 7.30 and 3.33 / 3.28 measured in run 26).
3. **Busy look (backlog 81).** While the rows are disabled (Finish writing), each row is muted: surface `opacity: 0.6` and `cursor: default` (on the label and the input); no hover. When the write fails and the rows are enabled again, the rows return to normal. Disabled controls are exempt from the contrast rule (WCAG 1.4.3 inactive components), so the 0.6 is a visual choice. The focus behaviour of run 25 (focus back on Finish after a failed Finish) is unchanged.
4. **Progress pills under forced colors (backlog 82).** In `@media (forced-colors: active)`: `.onboarding-wizard__pill` gets `border: 1px solid CanvasText`, `.onboarding-wizard__pill--active` gets `background: Highlight`. Nothing changes outside forced colors. With decision 2 there is no surface `filter` left, so the `filter: none` rules that run 26 added to the forced-colors block are removed.
5. **E2E base build (backlog 59, 83).** `buildFromRef` copies `rules/` from the ref when the ref has it (`git archive` of the path only if `git ls-tree` finds it; older refs without `rules/` still build). `dg-73` AS-OSR-10 switches back to `ctx.base`, the private `base-73` build is removed. Measure whether `01-upgrade` turns green on a clean base: if so, backlog 59 and 83 are closed and the "known red" wording in the kickoffs and `permissions.md` is not edited (a rights file; the owner decides); the verifier reports the new state.
6. **Unchanged.** Starter table, the checked row, the focus ring (inset, `--focus-ring`), forced-colors outline, check glyph, sizes, tab order, names, Finish, storage.

## Scope

- `src/surfaces.css`: hover rule, unchecked rule (no surface filter), icon filter, disabled rule, forced-colors pills; delete the surface `filter` rules.
- `.private/e2e/lib/harness.mjs` (`buildFromRef`), `.private/e2e/scenarios/dg-73-onboarding-starter-rows.mjs` (AS-OSR-04, 08, 10 amended), a new `dg-75-starter-rows-polish.mjs`.
- `test/borderContrast.test.js`, `test/newtabSource.test.js` (pins of the new rules, each proven by mutation).
- `docs/onboarding-starter-rows.md` (decision 3, `## Accepted exceptions`), `docs/onboarding-wizard.md` (step 2 and pills), `CHANGELOG.md` `[Unreleased]`.

## Acceptance scenarios

Common setup: harness **1280×800**, wizard step 2, eight starters, light theme unless noted; hover is done with `page.mouse.move` to a point inside the row.

### AS-SRP-01 Hover paints the enabled row
- Given: step 2, rows enabled, pointer device.
- When: the mouse moves over a checked row, then over an unchecked row.
- Then: the hovered surface `background-color` equals the resolved `--soft-fill`; the border colour is unchanged; leaving restores `--panel`; no `transition` is declared on the surface. Light and dark theme.
- Verified by: E2E `dg-75`; `newtabSource` pin.

### AS-SRP-02 Hovered label stays readable
- Given: a hovered checked and a hovered unchecked row, both themes.
- When: reading the label colour and the surface background.
- Then: label contrast ≥ 4.5:1 against the hovered surface.
- Verified by: E2E `dg-75` (computed pixels); unit in `test/borderContrast.test.js` (tokens).

### AS-SRP-03 Unchecked row takes the dialog colour
- Given: an unchecked and a checked row, light and dark theme.
- When: reading computed styles.
- Then: the unchecked surface `background-color` equals the resolved `--panel` (the dialog colour) and `filter` is `none`; the unchecked icon has `filter: grayscale(1)` and `opacity` 0.4 (favicon and letter alike); label colour equals `--muted`; check border equals `--border-control`; label ≥ 4.5:1 and check border ≥ 3:1 against `--panel`. The checked row is unchanged.
- Verified by: E2E `dg-75` (amends `dg-73` AS-OSR-04); `borderContrast` units.

### AS-SRP-04 Busy rows are muted and inert
- Given: step 2, Finish writing (delayed `sync.set` by the harness).
- When: the write is in flight.
- Then: all 8 checkboxes are `disabled`; each surface has `opacity` 0.6, the label and input `cursor` is `default`; hovering a row paints nothing; clicking a row changes nothing. After a failed write (`failStorageSetAfter`) the rows are enabled again with `opacity` 1, `cursor` pointer, and hover works.
- Verified by: E2E `dg-75`; `newtabSource` pin.

### AS-SRP-05 Forced colors: progress pills and focus
- Given: `forced-colors: active` emulated, step 1 and step 2.
- When: reading the pills and the focused unchecked row.
- Then: each pill has a solid 1px border (not transparent) and the active pill's `background-color` differs from the inactive one; the focused unchecked row's outline is `solid 2px` with `-2px` offset and a non-grey colour (no surface filter exists any more).
- Verified by: E2E `dg-75` (amends `dg-73` AS-OSR-08).

### AS-SRP-06 No hover on touch
- Given: `(hover: none)` emulation (touch).
- When: a tap lands on a row.
- Then: the row toggles and no hover background remains painted on it.
- Verified by: E2E `dg-75` (media emulation); `newtabSource` pin of the `@media (hover: hover)` wrapper.

### AS-SRP-07 `ctx.base` opens a tab
- Given: a build from `origin/main` through `buildFromRef`.
- When: the harness opens the new tab page.
- Then: the page loads (no `ERR_BLOCKED_BY_CLIENT`); `dg-73` AS-OSR-10 uses `ctx.base` without a private build; the state of `01-upgrade` on a clean base is recorded in the verification report.
- Verified by: E2E `dg-73` / `dg-75` (a check that opens `ctx.base`); harness self-test where one exists.

## Review focus

- Dark-theme "off" row: does it still read "off" without the grey block (label, empty check, grey icon)? (AS-SRP-03)
- Hover/busy interplay: no hover on a disabled row, no stuck hover after a tap (AS-SRP-04, 06).
- Contrast of the hovered label on `--soft-fill` in both themes (AS-SRP-02).
- Forced colors: pills and focus ring (AS-SRP-05).

## Accepted exceptions

- No transition on hover (the wizard has none).
- The busy `opacity: 0.6` is below the contrast thresholds by design (disabled controls are exempt).
- If `01-upgrade` turns green, `permissions.md` keeps its wording until the owner changes it.

## Non-goals

- A different layout, size or type of the row, or the favicon handling (run 32).
- Changing the busy flow itself (guards, focus return), or backlog 80.
- Editing `permissions.md`.

## Process

Full UI pipeline (`quiet-tab-pipeline`); design checkpoint on step 2 in both themes with hover and busy states.
