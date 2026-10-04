# Placeholder contrast (WCAG 1.4.3)

## Status

`ready for spec gate`

## Intake log

| Date | Raw note (backlog item 3) | Verdict | Reference |
|------|---------------------------|---------|-----------|
| 2026-10-04 | Placeholder of the link form fields (Add/Edit link: URL, Name, Custom icon URL) and of the city field (`src/surfaces.css:114`) uses the browser default color and does not reach 4.5:1 in light and dark. | `partly confirmed` | The three link form fields are confirmed (AS-PH-02, AS-PH-03). The city field is **not** affected: `.city-modal .favorite-input::placeholder` already sets `color: var(--muted); opacity: 1` (`src/surfaces.css:114`, pinned by `test/newtabSource.test.js:531`) and measures 5.84:1 / 7.30:1. The note was written before that rule was read. The city rule only works because it is scoped to `.city-modal`; the link form fields have no rule at all, which is the defect. |
| 2026-10-04 | Measured on the real extension page (Chromium, Playwright, the E2E harness, `.favorite-input` placeholders in the Add link dialog). | `confirmed` | See "Measurements". Default placeholder color is `rgb(117, 117, 117)` (`#757575`), `opacity: 1`, in both themes. |
| 2026-10-04 | Root cause. | `confirmed` | `.favorite-input` (`src/controls.css:155`) sets `color`, `background`, border and padding, but no `::placeholder`. The only `::placeholder` rule in `src/` is the `.city-modal`-scoped one. `#757575` is a fixed gray that ignores the theme: in light it is borderline on white and fails on the focused fill, in dark it fails on both fills. |

Reading of the criterion. A placeholder is text, so WCAG 1.4.3 (Contrast Minimum, AA) applies: 4.5:1 against the field background (the text is 13/14 px, not "large"). The placeholder here carries the only hint of what the field takes ("https://example.com", "Optional", the site domain), so it is not decoration. A placeholder that is a stand-in for a label is a separate WCAG concern (3.3.2); the dialog rows have visible labels ("Link", "Name", "Custom icon"), so only contrast is in scope.

## Measurements

Taken by `.private/e2e` against `HEAD` `0523e06`: the Add link dialog opened from the Add tile, `getComputedStyle(field, "::placeholder")` composited over the field's own `background-color`, WCAG relative luminance, unrounded. The URL field takes focus when the dialog opens, so it is measured on the focused fill (`--color-fill-soft`); the other two are at rest on the panel.

| Theme | Field (state) | Field background | Placeholder color (today) | Ratio today | Fails 4.5? |
|-------|---------------|------------------|---------------------------|-------------|------------|
| light | URL (focused) | `#eef1f5` | `#757575` | 4.07 | yes |
| light | Name, Custom icon (rest) | `#ffffff` | `#757575` | 4.61 | no (margin 0.11) |
| dark | URL (focused) | `#2a313b` | `#757575` | 2.85 | yes |
| dark | Name, Custom icon (rest) | `#1d2229` | `#757575` | 3.47 | yes |
| forced colors | all | `#000000` (system) | system color (`rgb(63, 242, 63)` in the emulated palette) | 13.98 | no |

Candidate `--color-text-muted` (`#5c6672` light, `#a8b0ba` dark; the token the city modal already uses):

| Theme | on panel | on `--color-fill-soft` | on `--color-fill-soft-strong` (margin only; no field uses it) |
|-------|----------|------------------------|---------------------------------------------------------------|
| light | 5.84 | 5.15 | 4.65 |
| dark | 7.30 | 5.99 | 5.08 |

All six pairs clear 4.5:1. Muted text against the typed-value color: light `#5c6672` vs `#111318` is only 3.18:1 and dark `#a8b0ba` vs `#f4f6f8` only 2.02:1, so the placeholder is distinguishable from a typed value by a different gray, not by a large step. This is accepted (see Accepted exceptions): a placeholder must not read as an entered value, and at 5.84:1 against its background it is already as dark as the design system allows for secondary copy.

## Default decisions (owner can override)

Applied as defaults so the pipeline does not wait.

1. **Token:** reuse `--color-text-muted` (alias `--muted`). No new token. It is the design system's "secondary copy" color, the city modal already uses it for exactly this, and all six pairs clear 4.5:1 with margin (see Measurements). A dedicated `--color-placeholder` is rejected: it would be a second gray with the same value, and `design-system-followup.md` still discourages new tokens.
2. **One rule:** `.favorite-input::placeholder { color: var(--muted); opacity: 1; }` in `src/controls.css`, next to `.favorite-input`. `opacity: 1` is required because Firefox applies `opacity: 0.54` to placeholders by default; the extension is Chrome-only today, the line keeps the contrast number true if that changes (it is already in the city rule). The `.city-modal`-scoped rule in `src/surfaces.css:114` is **removed** (merged into the single rule), and the source assertion in `test/newtabSource.test.js:531` moves to the new rule. After the change there is exactly one `::placeholder` rule in `src/`.
3. **Which fields:** every `.favorite-input` (Add link: Link, Name, Custom icon; Edit link: the same three, where the Name placeholder is the site domain; the city field in both first-run and change mode). `.favorite-color-input` has no text. No other text input exists.
4. **States:** the rule has no state selectors. A placeholder is only visible while the field is empty, so: rest, hover and focus all use the same color (focus changes only the field background, to `--color-fill-soft`, and AS-PH-04 measures that pair); an error does not change the field or its placeholder (errors go to the `[data-dialog-error]` / city feedback alert slot, AS-PH-06); a `:disabled` field (the city field while `weatherBusy`) keeps the same placeholder color. WCAG exempts inactive components, and `.favorite-input` has no disabled dimming today, so staying at 4.5:1 is the safe choice and no `:disabled` branch is added.
5. **Forced colors:** not changed. The browser replaces author colors with system colors; today that measures 13.98:1 (see Measurements) and the new rule must not reduce it. The scenario guards it (AS-PH-08), no `forced-color-adjust` is added.
6. **Theme coverage:** both themes in the same change, by the token's own light/dark values; the rule has no `@media (prefers-color-scheme)` branch.
7. **Placeholder text is not changed** ("https://example.com", "Optional", domain, "https://example.com/icon.png", "Search for a city").

## Scope

- `src/controls.css`: add the single `.favorite-input::placeholder` rule; `src/surfaces.css`: delete `.city-modal .favorite-input::placeholder`.
- `test/newtabSource.test.js`: the line asserting the city-scoped rule now asserts the rule in `controls.css` and that no `::placeholder` rule is left in `surfaces.css`.
- `docs/design-system.md`: one line in the `### .favorite-input` list ("Placeholder: `var(--color-text-muted)`, `opacity: 1`, >= 4.5:1 on the panel and on the focused fill"), and the `--color-text-muted` row gains "field placeholder".
- `CHANGELOG.md`: entry under `[Unreleased]` / `Fixed`.
- New unit test `test/placeholderContrast.test.js`; new E2E `dg-50-placeholder-contrast.mjs` (E2E number: the last existing scenario is `dg-49`).
- README screenshot: not refreshed (a placeholder is not visible on it).

## Process

This changes what the user sees, so it follows the full UI-phase cycle: spec, plan in `quiet-tab-notes/superpowers/plans/`, independent design review (`design-review/PROTOCOL.md`, visual lens in both themes), E2E, then merge only after the owner confirms.

## Non-goals

- Making the typed value, labels or any other text meet a higher ratio; only the placeholder.
- A new token, a palette change, or changing `--color-text-muted` (it is shared by labels and secondary copy; its value is untouched).
- Replacing placeholders by visible hints, floating labels, or changing placeholder strings.
- Other design-review findings (combobox semantics, keyboard alternative for drag, "Add link" naming) and backlog items 4-7 (`.button` border, docked-list focus ring, dialog 39 px jump, weather retry).
- Firefox or Safari verification (the extension is Chrome-only), touch and pen.
- Forced-colors behavior beyond "not reduced".

## Accepted exceptions

- **Placeholder vs typed value is 3.18:1 in light** (`#5c6672` vs `#111318`) **and 2.02:1 in dark** (`#a8b0ba` vs `#f4f6f8`): the placeholder disappears the moment the user types, so the two never share a field (dark is the weaker pair: the two grays are close, the difference rests on disappearance when typing); the muted token is kept for consistency with the city modal and labels.
- **A disabled field** (the city field while a request runs) keeps the placeholder at full muted contrast instead of dimming: WCAG 1.4.3 exempts inactive components, and the stricter state is harmless.
- **Long placeholders at 320 px** (for example "https://example.com/icon.png" in a narrow field) are clipped by the field, as today. This change is color-only: no metric moves, so truncation is neither introduced nor fixed here.
- **Forced colors:** the system color is trusted, the author color is not asserted.
- **No mid-phase checkpoint:** the plan has a single small group of tasks (one CSS rule, tests, docs), so the checkpoint design review is replaced by a "not needed" note in the plan; the spec gate and the final gate still run.

## Acceptance scenarios

### AS-PH-01 One placeholder rule on the muted token, clearing 4.5:1 in both themes

- Given: `src/controls.css`, `src/surfaces.css`, `src/newtab.css` and `src/design-tokens.css`.
- When: every `::placeholder` rule in `src/*.css` is collected; `--color-text-muted` is read from the `:root` block and from the `prefers-color-scheme: dark` block, with that block's `--color-surface`, `--color-fill-soft` and `--color-fill-soft-strong`.
- Then: exactly one `::placeholder` rule exists, it is `.favorite-input::placeholder` in `controls.css`, with `color: var(--muted)` and `opacity: 1`; none in `surfaces.css` or `newtab.css`. In both blocks the muted token against `--color-surface` and `--color-fill-soft` is >= 4.5 (unrounded; 4.50 rounds, 4.4999 fails), and against `--color-fill-soft-strong` as well (margin check). `--muted` is an alias of `--color-text-muted`, whose values are unchanged (`#5c6672` light, `#a8b0ba` dark).
- Verified by: new `test/placeholderContrast.test.js` (luminance helpers copied from `test/focusTokens.test.js`, test files do not export) and the amended assertion in `test/newtabSource.test.js`. Expected before the change: red (no rule in `controls.css`, one in `surfaces.css`).

### AS-PH-02 Add link placeholders are readable at rest and on open, in both themes

- Given: viewport 1280×800; a city stored (default metrics and chrome tiles); both themes (`page.emulateMedia({ colorScheme })`, wait for the media change to apply as `dg-46` does); the Add link dialog opened from the Add tile, all three fields empty.
- When: for each of the Link, Name and Custom icon fields, the computed `::placeholder` color is read (alpha composited over the field's own `background-color`) together with the computed `opacity` of the pseudo-element.
- Then: color equals the resolved `--muted` (as an `rgb()` string); opacity is `1`; contrast against the field's own background is >= 4.5 (unrounded). The Link field is measured as opened (focused, `--color-fill-soft` fill); Name and Custom icon at rest on `--color-surface`. The Custom icon row is measured only with Icon set to "Custom" (the row is `display: none` otherwise, `src/controls.css:59-66`, and the computed style of a hidden element is not reliable).
- Verified by: new E2E `dg-50-placeholder-contrast.mjs`. Expected before the change: red, color `rgb(117, 117, 117)`, ratios 4.07 / 4.61 (light), 2.85 / 3.47 (dark).

### AS-PH-03 Edit link placeholders match, including the domain placeholder

- Given: viewport 1280×800; a stored favorite with an empty Name (so the Name placeholder shows its domain) and empty Custom icon; edit mode on; both themes.
- When: the favorite tile is tapped (dialog `edit-link`), and the same computed values as AS-PH-02 are read for Link (filled, so no placeholder: not asserted), Name (placeholder = domain) and Custom icon. If the seed cannot hold an empty label, the Name field is cleared inside the dialog.
- Then: Name's placeholder text equals the favorite's domain; both visible placeholders equal the resolved `--muted`, opacity `1`, contrast >= 4.5 against the field background; the focused Name field (click into it) also >= 4.5 against `--color-fill-soft`.
- Verified by: `dg-50-placeholder-contrast.mjs` (seeds as in `dg-04-edit-favorite.mjs`). Expected before the change: red.

### AS-PH-04 Focused field keeps 4.5:1 on the focused fill

- Given: the Add link dialog and the city modal (first-run mode, no city stored, field empty), both themes.
- When: each empty `.favorite-input` receives keyboard focus (Tab, `:focus-visible`), and the computed `background-color` and `::placeholder` color are read.
- Then: the background is `--color-fill-soft` (the existing AS-DS-6 behavior, unchanged) and the placeholder contrast against it is >= 4.5 (5.15 light, 5.99 dark with the planned token). Blur returns to the panel background with >= 4.5.
- Verified by: `dg-50-placeholder-contrast.mjs`. Expected before the change: red for the link fields (4.07 light, 2.85 dark); green for the city field (characterization).

### AS-PH-05 The city field is unchanged in value, rule location and behavior

- Given: the first-run city modal (no city stored, field empty) and the change-mode modal (city stored, opened from the weather edit dialog's "Change city" button), both themes.
- When: the computed `::placeholder` color, its opacity and the contrast against the field's own background are read; the layout metrics of the dialog and field are read as before.
- Then: color equals the resolved `--muted`, opacity `1`, contrast >= 4.5; the placeholder text is "Search for a city". Field and dialog rects are identical to the base build (`ctx.base`, the ref passed as `--base`, run with `--base 0523e06`; only a rule moved; no metric changes). `13-city-modal`, `15-city-modal-layout`, `dg-47`, `dg-48`, `dg-49` pass unchanged.
- Verified by: `dg-50-placeholder-contrast.mjs` (colors) and the existing scenarios as regression. Expected before the change: green (characterization; the point is that moving the rule does not regress it).

### AS-PH-06 Error and disabled states do not change the placeholder

- Given: the Add link dialog, both themes; (a) submitting with an empty Link; (b) the Name field with `disabled` set from the test (the city field is disabled only for a moment while a request runs, so the test forces the state on an empty `.favorite-input`).
- When: (a) Save is pressed, the dialog shows its error in `[data-dialog-error]` (`role="alert"`); the Link field's placeholder color and the empty Name/Custom icon placeholders are read again. (b) The disabled Name field's placeholder is read.
- Then: (a) the error text is shown; the placeholder color is the same `--muted` and still >= 4.5; the field border stays `--color-border-control` (`dg-46` regression). (b) The placeholder color is still `--muted` and >= 4.5 (no dimming; Accepted exceptions). No field has a red border or red placeholder in either state.
- Verified by: `dg-50-placeholder-contrast.mjs`. Expected before the change: red for the placeholder values, green for the error text.

### AS-PH-07 Narrow windows and a low window do not change the color

- Given: viewport 500×800, 320×800 and 1280×600 (low window), both themes; the Add link dialog and the first-run city modal open.
- When: the placeholder color and contrast are read for every empty `.favorite-input`; the dialog is scrolled to its end if it scrolls.
- Then: color equals `--muted`, contrast >= 4.5, in every size; each field's `getBoundingClientRect()` lies inside the viewport horizontally (no new overflow); the Save and Cancel buttons are reachable as before (`dg-39`, `dg-48` regression).
- Verified by: `dg-50-placeholder-contrast.mjs`; existing `dg-39-dialog-narrow.mjs`, `dg-48-city-modal-low-window.mjs` as regression.

### AS-PH-08 Forced colors are not worse than today

- Given: `page.emulateMedia({ forcedColors: "active" })`, the Add link dialog and the city modal, empty fields.
- When: the placeholder color is composited over the field background and the contrast is computed, in both the Add link dialog and the city modal, before and after the change.
- Then: contrast >= 4.5 in both dialogs (13.98 measured today for Add link; the city modal number is taken from the same run; the system palette decides). Both numbers go to the run record; a before/after difference fails the scenario on purpose. The color is whatever the browser forces; the scenario does not assert it equals `--muted`. The emulation is reset to `none` afterwards.
- Verified by: `dg-50-placeholder-contrast.mjs`. Expected before the change: green (characterization). The emulation is already used by the harness (`13-city-modal.mjs:689`, `15-city-modal-layout.mjs:344`), so no skip fallback is planned.

### AS-PH-09 A typed value stays distinct from the placeholder

- Given: the Add link dialog, both themes, an empty Name field, then the text "x" typed.
- When: the computed `color` of the field with a value and its `::placeholder` color are read.
- Then: the field's `color` equals the resolved `--text` and differs from the placeholder color; the placeholder is no longer rendered (`:placeholder-shown` does not match) once the value is non-empty; clearing the field brings the placeholder back with `--muted`.
- Verified by: `dg-50-placeholder-contrast.mjs`.

### AS-PH-10 Docs, changelog and backlog reflect the change

- Given: the repository after the change.
- When: `docs/design-system.md`, `CHANGELOG.md` and `src/*.css` are read.
- Then: the `### .favorite-input` section of `design-system.md` states the placeholder token and the 4.5:1 requirement, and the `--color-text-muted` row mentions the field placeholder; `CHANGELOG.md` has a `Fixed` entry under `[Unreleased]` in plain words (hint text in the link form fields is darker so it is readable in light and dark), ending with "E2E: `dg-50-placeholder-contrast.mjs`"; a grep over `src/*.css` finds no `::placeholder` outside `controls.css`.
- Verified by: source assertions in `test/placeholderContrast.test.js` (docs mention of the rule and of the token; no `::placeholder` in `surfaces.css`/`newtab.css`); design review (copy lens) reads the CHANGELOG line.

## Review focus

- **Scenarios and states:** the focused URL field is the worst pair (`--color-fill-soft` background; 4.07 / 2.85 today). Check that the planned token holds on exactly the fill a keyboard user sees when the dialog opens, in both themes, and that the Edit dialog's domain placeholder (a long host name in a narrow field) is still readable.
- **Visual and layout:** the placeholder becomes noticeably darker in dark mode (gray `#757575` to `#a8b0ba`) and a little darker in light. Look at the three fields next to the row labels (also muted, `--font-size-sm`): does the empty field now read as filled? Distinguishing a placeholder from a typed value rests on the lighter gray and on disappearance when typing (Accepted exceptions), judge it by eye in both themes.
- **Accessibility and texts:** 3.18:1 (light) and 2.02:1 (dark) between muted and text is the consciously accepted gap; check nothing else relies on that pair. Confirm forced-colors still shows a visible placeholder, and that `opacity: 1` is not hiding a Chrome UA state (disabled).
- **Regression:** `13-city-modal`, `15-city-modal-layout`, `dg-04`, `dg-39`, `dg-40`, `dg-46`, `dg-47`, `dg-48`, `dg-49`; `test/focusTokens.test.js`, `test/designSystem.test.js`, `test/newtabSource.test.js`.

## Changes after review

Review `placeholder-contrast-spec-review.md` (stage 1): no Critical or Important; five Minor, reviewer defaults accepted.

- **M1:** AS-PH-02 measures Custom icon only with Icon = Custom; the "also read with the row hidden" clause is removed.
- **M2:** AS-PH-08 names both dialogs (Add link, city modal), before and after; both numbers go to the run record; the skip fallback is removed (harness already emulates forced colors).
- **M3:** the dark pair placeholder vs typed value, 2.02:1, is added to Accepted exceptions and to the paragraph after the candidate table.
- **M4:** AS-PH-10 grep is limited to `src/*.css`.
- **M5:** AS-PH-05 compares against `ctx.base` with `--base 0523e06`; the "compare to constants" fallback is removed (also in the plan).
- Added to Accepted exceptions: no mid-phase checkpoint (replaces nothing in scope).
