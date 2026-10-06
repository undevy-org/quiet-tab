# Button border contrast (WCAG 1.4.11)

## Status

**Amended by `docs/modal-overlay-design.md`:** `.text-button` is removed (the weather dialog's city row is the `.city-field`, which has the control border like `.favorite-input`), the Edit link dialog has no Delete button (so no stacked full-width Delete at narrow widths), and every modal footer is two 50/50 buttons. The mentions of `.text-button`, Delete in Edit link and the stacked footer below describe the earlier state.

`implemented` (spec gate and final design review passed; merged in `9fa8690`)

Decision: **do it** (the `.button` border moves to `--color-border-control`). Backlog item 4. This spec supersedes one line of `docs/border-contrast.md` (the `.button` exclusion); see "What changes in the earlier decision".

## Intake log

| Date | Raw note (backlog item 4) | Verdict | Reference |
|------|---------------------------|---------|-----------|
| 2026-10-04 | The border of `.button` (`src/controls.css:192`, the rule starts at `:185`) uses `--border` and measures 1.35:1 (light) against the panel, while fields and chrome tiles use `--border-control` (>= 3:1). | `confirmed` | See "Measurements". Light 1.35:1, dark 1.41:1, against `--color-surface`; `.button` always sits on the panel (`--panel`) of the city modal and of `.desktop-dialog`, so the page is never its neighbour. |
| 2026-10-04 | Why `.button` stayed on `--border` in `docs/border-contrast.md`. | `read, reason is weak` | Scope item 3 and Review focus of that spec: "`.button` (has a text label)" is excluded because a control identified by its text is "not forced by the criterion". That is a reading of 1.4.11, not a design constraint, and the spec itself listed "whether `.button` (text-labelled) should follow for consistency" as an open Review-focus question. The final review of that run did not rule on it. No technical obstacle (no neighbouring rule depends on the faint border). |
| 2026-10-04 | Where `.button` is used. | `confirmed` | `grep` over `src/`: `.button` is created only in `src/newtab.js` (`createIconButton("button ...")`): Cancel (a separate constructor in the add/edit link form, `newtab.js:435`; `createDialogCancel`, `:1185`, only in delete confirm `:1262` and the edit-weather dialog `:1305`), Save (`button button--primary`: add/edit link, edit weather, city modal; in Add link the primary is labelled "Add", `newtab.js:440-444`), Delete (`button button--danger`: edit link, delete confirm), city modal "Not now" / "Cancel". CSS: `.button` family in `controls.css:185-232`, dialog overrides in `surfaces.css` (:72, :126-132, :205-210, :246-251, :292), the mobile `width: 100%` rule (`controls.css:335`). Not a `.button`: `.icon-button` (transparent border for the clear button), `.text-button` (no border), `.tile-remove`, `.add-menu__item`, tiles. |

## Why we change it (the reading that decides)

The criterion (1.4.11, non-text contrast, AA) asks 3:1 for the parts of a control "required to identify" it. The earlier spec read a text button as identified by its label. Three things make that reading the wrong default here:

1. **The label is not a cue that this is a button.** The default `.button` ("Cancel", "Not now") has no fill, its text is the page text color (`--text`) in the same weight as the dialog title row, and the glyph (x) is decoration. The outline is the only thing that separates it from a label or a line of copy. The fix for a text link would be an underline (`.text-button` has one); `.button` has no underline, so the edge is its affordance, as it is for a field.
2. **The dialog footer now has two weights next to each other.** After border-contrast, a field above the footer has a 3:1 border while Cancel under it has 1.35:1. The primary Save and the danger Delete are fills or a red border at 6.6:1+; only the secondary button is faint, which is the one that most needs to look pressable (it is the "safe" way out of every dialog).
3. **It is cheap and local.** One declaration (the color), no layout, no new token. The 1 px width stays, so dg-41/dg-42 and the focus ring geometry do not move.

**Against, stated for the record.** WCAG 1.4.11 does not require a border on a button whose visible text already identifies it, and Cancel is meant to be quiet; the "label is not a cue" argument (point 1) is a design judgement (a 14 px / 600 label with an icon next to an 18 px dialog title), not something the criterion forces. The decision stays "do it"; the fallback below is the way out.

If the review finds Cancel reads too heavy next to Save, the fallback is a documented exception for text buttons (not the default, and not a reason to wait): see "Review focus".

## Measurements

WCAG relative luminance, unrounded, computed from the tokens in `src/design-tokens.css` (the E2E scenario re-measures the real rendered pairs).

| Pair | Light | Dark |
|------|-------|------|
| `.button` border today (`--color-border`) vs panel | 1.35 | 1.41 |
| `--color-border-control` vs panel (planned rest border) | 3.33 | 3.28 |
| `--color-border-control` vs `--color-fill-soft-strong` (the focused-button fill) | 2.66 | 2.28 |
| `--color-border` vs the focused fill (today) | 1.08 | 1.02 |
| `--primary` (hover border) vs `--color-border-control` (rest to hover step) | 5.58 | 4.51 |
| `--danger` border vs panel (unchanged) | 6.57 | 7.01 |
| `--primary` fill vs panel (unchanged) | 18.58 | 14.76 |
| `--soft-ring` over panel / over the focused fill | 4.12 / 3.85 | 6.17 / 4.87 |
| Disabled (opacity 0.62) rendered border vs panel: planned / today | 1.98 / 1.20 | 2.08 / 1.23 |

## Default decisions (owner can override)

1. **Token:** reuse `--border-control` (alias of `--color-border-control`, `#838e9a` light, `#68727f` dark). No new token, no value change. `--color-border` keeps its meaning.
2. **One declaration:** `.button { border: var(--control-border-width) solid var(--border-control); }` in `src/controls.css` (was `var(--border)`). The `.button--primary` and `.button--danger` modifiers already override the border color after it and are not touched.
3. **Variants:**
   - default (Cancel, Not now): `--border-control`, as above;
   - `.button--primary` (Save): border and fill `--primary`, unchanged;
   - `.button--danger` (Delete): border `--danger`, text `--danger`, unchanged (6.57 / 7.01 on the panel);
   - the `margin-right: auto` / `flex-basis: 100%` footer layout rules are not touched.
4. **Hover:** unchanged, `border-color: var(--primary)` (`.button:hover:not(:disabled)`); the step from the new rest color is 5.58 / 4.51, still clearly visible. Note for the record: the same rule wins over `.button--danger`'s border on hover (specificity), as today; characterized, not changed.
5. **Active:** there is no `:active` rule for `.button` today and none is added.
6. **Focus-visible:** unchanged. In dialogs a focused default button gets the `--soft-fill-strong` fill plus the 2 px `--focus-overlay-ring` (`surfaces.css`). The border on that fill is 2.66 (light) / 2.28 (dark), below 3:1, exactly like a focused field (`docs/border-contrast.md` decision 5): the soft ring carries the focused boundary (4.12 / 6.17 on the panel, 3.85 / 4.87 on the fill) and is guarded by `test/focusTokens.test.js`. This is an accepted exception, not a new gap: the old border was 1.08 / 1.02 on that fill. A focused primary button keeps its `--primary` fill.
7. **Disabled:** unchanged mechanism, `opacity: var(--control-disabled-opacity)` (0.62). The rendered border is 1.98 / 2.08 (was 1.20 / 1.23): a disabled control is an inactive component and is exempt from 1.4.11; the border color is the same token as enabled so nothing changes when the button becomes enabled except opacity. Disabled states that exist without a network request: city modal Save while the field is empty; edit-weather Save until the size changes. The busy states (`favoritesBusy` / `weatherBusy`) are transient and not driven by the scenario; AS-BB-05 forces the attribute instead.
8. **Forced colors:** not changed. The browser substitutes system colors for author borders; in forced colors the border color is set by the system palette, not by the author token, so the comparison is characterization only: the scenario guards that the button keeps a visible 1 px solid border with a non-transparent color (alpha > 0, at least 3:1 against the forced background) and that it equals the "before" value from `d2c3aad` (AS-BB-08).
9. **Theme coverage:** both themes in the same change by the token's own light/dark values; no `@media (prefers-color-scheme)` branch is added.
10. **Which buttons:** every `.button` (the family listed in the intake log). Not `.icon-button`, `.text-button`, `.tile-remove`, `.add-menu__item`, tiles (unchanged).

## What changes in the earlier decision

`docs/border-contrast.md` is amended in place (not a new paragraph), so a reader is not told two things:

- Intake, "Reading of the criterion" paragraph (`docs/border-contrast.md:16`): drop "or by its text label (`.button--primary`, text buttons)" for the default `.button`; the paragraph keeps only the solid-fill case (`.button--primary`) and `.text-button`, and gets a pointer to this spec. Verify there is no Accepted exception to remove: that file lists only `.weather-tile` and `.favorite-color-input`; the text-label exclusion lives in the Scope 3 list and the Reading paragraph, not in Accepted exceptions.
- Default decision 3: the heading "(the five that draw a control boundary...)" becomes six and the list gains `.button` (default variant; `--primary` and `--danger` keep their own border colors); `.button (has a text label)` is removed from the "Everything else keeps `--border`" sentence; pointer note "(`.button` joined by `docs/button-border-contrast.md`)".
- Scope item "Five rules switched..." becomes six, `.button` in `src/controls.css` added.
- AS-CT-05 (unit and E2E): "Given" no longer lists a default button among the quiet surfaces; the `.button` (default) entry leaves the separators list; the source test's list of control-boundary rules becomes six (`.button` added), including the "five rules" wording in its Verified-by line.
- Review focus, "Which surfaces": the clause "whether `.button` (text-labelled) should follow for consistency" is answered by this spec (a pointer, not a deletion of the history). In the same section (`docs/border-contrast.md:118`) the question "is the five-surface list right?" becomes "six-surface" with the pointer, so no "five" remains for the control-boundary list.
- `docs/design-system.md:70-71`: the definition "a control that has no fill or label of its own to identify it" is rewritten (suggested: "the boundary of a control whose edge is its main affordance: text fields, the color field, the segmented outer edge, chrome tiles, the first-run hint tile and secondary buttons"). The token table row (`:54`) adds "button"; the `### .button` section says `var(--color-border-control)`; "Two border roles" lists buttons.
- These edits are the implementer's work (the docs task of the plan); this spec only fixes what must change. `test/buttonBorderContrast.test.js` source-asserts that neither `docs/border-contrast.md` nor `docs/design-system.md` contains the phrases "(has a text label)" or "no fill or label".

`docs/design-system-followup.md` Non-goals line is not touched again.

## Scope

- `src/controls.css`: `.button` border color token (`--border` to `--border-control`). Nothing else in `src/`.
- `test/borderContrast.test.js`: the "five rules" list (and its wording) becomes six (`.button` added; its border declaration must use `var(--border-control)`), the "no other rule" test follows; `.button--primary` and `.button--danger` keep their own colors.
- `.private/e2e/scenarios/dg-46-control-border-contrast.mjs`: drop `separators[".button"]` (and keep the other separator checks).
- `docs/design-system.md`: `### .button` border line says `var(--color-border-control)`; the "Two border roles" paragraph is rewritten (definition and list, see "What changes in the earlier decision"); the `--color-border-control` row adds "button". `docs/border-contrast.md` amended as above (all listed places).
- `CHANGELOG.md`: `Changed` entry under `[Unreleased]`.
- New unit test `test/buttonBorderContrast.test.js`; new E2E `dg-51-button-border-contrast.mjs` (the last existing scenario is `dg-50`).
- README screenshot: refresh only if a dialog is visible on it (decided at the final gate, per the storefront rule).

## Process

This changes what the user sees, so it follows the full UI-phase cycle: spec, plan in `quiet-tab-notes/superpowers/plans/`, independent design review (`design-review/PROTOCOL.md`, visual lens in both themes; the gate sweep covers every dialog), E2E, then merge only after the owner confirms.

E2E commands: the full run is `node .private/e2e/run.mjs --repo . --base 67b3e32`; the new scenario alone: `node .private/e2e/run.mjs --repo . --only dg-51` with any base. Known on a Mac: `dg-48` AS-LW-03 and `dg-49` AS-LW-06 fail at 360 px on a clean base (`0523e06`) for a reason that is not established; they are not caused by this change (it moves no metric) and are recorded as known, not fixed here (backlog candidate).

### Procedure items (TEMPLATES) that do not apply

N/A, behavior does not change: migration and storage (nothing persisted), empty state, error states, large data, Tab order, Escape layers and focus return. Only a border color changes.

## Non-goals

- Making the primary fill, the danger border or the focused-button fill meet more than they do (they already clear 3:1 or are inactive/ring-carried).
- A hover or active redesign, new focus colors, radii, heights, padding, gaps, or any layout; `.text-button`, `.icon-button`, `.tile-remove`.
- Re-deriving `--color-border-control`, a new token, or touching `--color-border` users.
- Other design-review findings and backlog items 5-7.
- Touch, pen and Firefox/Safari verification.

## Accepted exceptions

- **Focused default button:** border 2.66 / 2.28 on `--color-fill-soft-strong`; the 2 px soft ring carries the boundary (decision 6), same principle as a focused field.
- **Disabled button:** rendered border 1.98 / 2.08, inactive component.
- **Hover on `.button--danger`** switches the red border to `--primary` (existing cascade behavior), not addressed here.

## Acceptance scenarios

### AS-BB-01 `.button` draws its border with the control token; variants keep theirs

- Given: `src/controls.css`, `src/surfaces.css`, `src/newtab.css`, `src/design-tokens.css`.
- When: the rules are parsed (comments stripped); `--color-border-control`, `--color-surface` and `--color-danger` are read from the `:root` block and from the `prefers-color-scheme: dark` block.
- Then: the `.button` rule's `border:` is `var(--control-border-width) solid var(--border-control)` (width token unchanged); `.button--primary` still sets `border-color: var(--primary)`, `.button--danger` `border-color: var(--danger)` and `.button--danger` is declared after `.button` (existing `designSystem` assertion stays green); no `.button*` rule in `surfaces.css` or `newtab.css` changes the border color; `--color-border-control` against `--color-surface` and `--color-danger` against `--color-surface` are >= 3.0 (unrounded) in both blocks (planned values: `#838e9a`, `#b42318` / `#68727f`, `#ff8a80`; the test reads the declared values); `--color-border` is unchanged (`#d8dee6`, `#343b45`).
- Verified by: new `test/buttonBorderContrast.test.js` (luminance helpers copied from `test/borderContrast.test.js`) and the amended six-rule list in `test/borderContrast.test.js`. Expected before the change: red (`.button` uses `--border`).

### AS-BB-02 Every default button in every dialog is visible against its panel

- Given: viewport 1280×800, both themes (`page.emulateMedia({ colorScheme })`, 300 ms wait as in `dg-46`); resting state (mouse moved away, no focus on the button). Seeds differ per dialog: Add link, Edit link, Delete confirm, edit-weather dialog and city modal change mode run with a city stored and one favorite in the grid; the city modal first-run runs in a separate profile with NO city stored and `quietTabWeatherPromptDismissed` not set (the first-run rule requires an unset city, see `CLAUDE.md` Weather).
- When: for each dialog the computed `border-top-color` and `border-top-width` of the default (non-primary, non-danger) `.button`, together with the background of the nearest ancestor that paints one, are read: Add link (Cancel), Edit link (Cancel), Delete confirm (Cancel), edit-weather dialog (Cancel), city modal first-run (Not now) and city modal change mode (Cancel). Path to the change-mode modal: Settings (edit mode) -> a weather tile -> "Change city" in the edit-weather dialog (the modal stacks over that dialog).
- Then: border color equals the resolved `--border-control`; width `1px`; contrast against that ancestor >= 3.0 (unrounded), in every dialog and both themes. Six dialogs by two themes, each must have been rendered (a missing one fails the check).
- Verified by: new E2E `dg-51-button-border-contrast.mjs` (helpers from `dg-46`: `read`, `resolve`, `setScheme`). Expected before the change: red, 1.35 (light) and 1.41 (dark) in all six.

### AS-BB-03 Primary and danger buttons are unchanged

- Given: as AS-BB-02.
- When: the primary button (`.button--primary`; labelled "Add" in Add link, "Save" in Edit link, edit-weather and the city modal) of each of those dialogs, and the Delete button of Edit link and Delete confirm are read at rest (border color, background, text color).
- Then: primary: border and background equal the resolved `--primary`, text `--primary-contrast`; Delete: border and text equal the resolved `--danger`, background the panel; Delete's border against the panel >= 3.0. Both themes. Characterization: these checks are green before and after.
- Verified by: `dg-51-button-border-contrast.mjs`.

### AS-BB-04 Hover, focus-visible and the focused fill

- Given: the Add link dialog (Cancel and the primary "Add", `.button--primary`) and the city modal (Cancel in change mode, Save), both themes.
- When: hover and focus-visible are checked separately, in this order. (a) the mouse hovers Cancel (`page.hover`); the border color is read; then the cursor is moved off the button (`page.mouse.move(1, 1)`) and the check waits until `cancel.matches(":hover")` is false (poll, at most 1 s; fail if it stays true). (b) only after that, focus is moved to Cancel by keyboard: Tab / Shift+Tab in a loop until `document.activeElement === cancel`, at most 12 presses (fail if not reached), then `cancel.matches(":focus-visible")` must hold and `cancel.matches(":hover")` must be false; the border color, background and `box-shadow` of the button are read, and the border-to-background ratio is computed.
- Then: (a) the border is `--primary` (unchanged), and differs from the rest color; (b) the border stays `--border-control`, the background is `--soft-fill-strong`, `box-shadow` is the `--focus-overlay-ring` ring (2 px) as before; the border-to-focused-fill ratio is recorded in the run record (2.66 / 2.28 expected) and not asserted >= 3 (Accepted exceptions); the primary keeps its `--primary` background while focused. There is no `:active` rule (source assertion in the unit test: no `.button:active`).
- Verified by: `dg-51-button-border-contrast.mjs`; `test/focusTokens.test.js` and `test/newtabSource.test.js:445` pass untouched. Expected before the change: (a) green, (b) the border color check red.

### AS-BB-05 Disabled buttons keep the color and dim by opacity only

- Given: the city modal first-run with an empty field (Save disabled) and the edit-weather dialog before a size change (Save disabled); and, in the same dialogs, a non-primary button forced `disabled` from the test (Cancel is only disabled while a request runs, which the scenario does not drive; the forced state is the same attribute).
- When: the disabled button's computed `opacity`, border color and width are read (`cursor` is not asserted: a disabled `.button` has `cursor: wait`, `controls.css:211-214`, characterized only).
- Then: opacity equals `--control-disabled-opacity` (0.62); the default button's border color is `--border-control` (same as enabled); `border-top-width` is `1px`; the rendered border (color at opacity 0.62 over the panel) is recorded (about 1.98 light / 2.08 dark), not asserted >= 3 (inactive component, Accepted exceptions). Enabled again (field filled): opacity `1`.
- Verified by: `dg-51-button-border-contrast.mjs`. Expected before the change: border color check red.

### AS-BB-06 Metrics do not move

- Given: the Add link, Edit link and city modal dialogs open, viewport 1280×800; the desktop-wide button rows: `.favorite-form__footer .button` (Add link, Edit link) and `.city-modal__actions .button` (city modal, both modes).
- When: `getBoundingClientRect()` of every `.button` matched by those two selectors, `border-top-width`, `border-top-style` and `border-radius` are read.
- Then: height 40 ± 0.5, radius 8, border width `1px` solid (the same values `dg-41-control-metrics.mjs` asserts); the existing `dg-41` and `dg-42` pass untouched (no change to those files). Only a color changes.
- Verified by: `dg-51-button-border-contrast.mjs` (absolute checks, no base build) plus existing `dg-41-control-metrics.mjs`, `dg-42-grid-chrome-metrics.mjs`, `dg-39-dialog-narrow.mjs`, `13-city-modal`, `15-city-modal-layout`, `dg-47`, `dg-48`, `dg-49`.

### AS-BB-07 Narrow and low windows keep the color and the reach

- Given: viewports 500×800, 320×800 and 1280×600 (low window), both themes; the Add link dialog, the Edit link dialog (stacked footer at narrow widths: Delete full width) and the city modal first-run.
- When: the default button's border color, `border-top-width` and the ratio against its ancestor are read; the dialog is scrolled to its end when it scrolls; the button rect is compared to the viewport and to the dialog box (as `dg-39` / `dg-48`).
- Then: border color equals `--border-control`, contrast >= 3.0; the button rect lies inside the dialog and inside the viewport horizontally, its width is > 0, `border-top-width` is 1 px, and it is reachable (`scrollIntoView` succeeds, not clipped). Width is not asserted as "full dialog width" for Cancel/Save: the footer is a flex row, so they share it (`.button{width:100%}` at <= 600 px only sets the basis, `controls.css:335-338`; `flex: 1 1 0` in Edit link, `surfaces.css:205-208`; `flex: 1` in the city modal, `surfaces.css:72-76`). Only Delete in Edit link at <= 600 px is full width (`flex-basis: 100%`, `surfaces.css:210-213`) and is asserted so.
- Verified by: `dg-51-button-border-contrast.mjs`; `dg-39-dialog-narrow.mjs` and `dg-48-city-modal-low-window.mjs` as regression (360 px AS-LW-03 is a known Mac failure on a clean base, see Process, and is not used as a gate here).

### AS-BB-08 Forced colors are not worse than today

- Given: `page.emulateMedia({ forcedColors: "active", colorScheme })` for `light` and `dark`; the Add link dialog and the city modal first-run; Cancel / Not now, Save and Delete (Edit link).
- When: `border-top-color`, `border-top-style`, `border-top-width` of each button are read; "before" values are taken once on commit `d2c3aad` (a clean checkout or `git worktree add <path> d2c3aad`, before the CSS change; run the same reads there with the same emulation) and written into the scenario as a constant map `FORCED_BEFORE`, keyed by scheme, dialog and button, following `dg-50`. The scenario does not rebuild the base at run time.
- Then: border style is `solid`, width `1px`, color alpha > 0 (visible) and its contrast against the forced background is >= 3.0; the color equals `FORCED_BEFORE` for the same scheme, dialog and button (after == before; the system palette decides, the author token is not asserted, so this is a characterization and cannot catch a wrong author color). The emulation is reset to `none` afterwards (in `finally`). The before and after values go to the run record.
- Verified by: `dg-51-button-border-contrast.mjs`. Expected before the change: green (characterization).

### AS-BB-09 Everything that is not a button keeps its look

- Given: both themes; the Add link dialog, the city modal, the Add menu, the suggestions list, a tooltip, a weather tile; the edit-weather dialog (it is the only place with a `.text-button`, "Change city", `newtab.js:1273`).
- When: `border-top-color` of `.favorite-form` (and the footer's `border-top`), `.city-modal__dialog`, `.desktop-dialog`, `.add-menu`, `.weather-form__suggestions`, `.tooltip`, `.weather-tile` (no tone); `border-top-width` of a `.text-button` and the `border-top-color` of the city `.icon-button` (clear) are read.
- Then: the first group equals the resolved `--border` exactly as `dg-46` asserts (`.button` is no longer in that group); `.text-button` has width 0; the clear `.icon-button` border is transparent; chrome tile hover is still `--primary` (`dg-46`).
- Verified by: `dg-46-control-border-contrast.mjs` (amended: `.button` removed from the separators) and `dg-51-button-border-contrast.mjs`. Characterization: green before and after.

### AS-BB-10 Docs and changelog reflect the change

- Given: the repository after the change.
- When: `docs/design-system.md`, `docs/border-contrast.md`, `CHANGELOG.md` and `test/borderContrast.test.js` are read.
- Then: the `### .button` section of `docs/design-system.md` says `var(--color-border-control)` and has no bare `--color-border` (the test matches the whole token `var\(--color-border\)` with no `-control` suffix inside that section, e.g. regex `/var\(--color-border\)/`; `var(--color-border-control)` does not match it); the `--color-border-control` row names "button"; the "Two border roles" paragraph lists buttons among control boundaries and no longer says "no fill or label of its own"; `docs/border-contrast.md` no longer lists `.button` among the surfaces that keep `--border`, no longer contains "(has a text label)", has "six" in Default decision 3 / Scope / AS-CT-05 / Review focus (`six-surface`, no `five-surface`), and carries the pointer to this spec; `CHANGELOG.md` has a `Changed` entry under `[Unreleased]` in plain words (the outline of Cancel, Not now and other secondary buttons in dialogs is darker so it meets 3:1 in light and dark), ending with "E2E: `dg-51-button-border-contrast.mjs`".
- Verified by: source assertions in `test/buttonBorderContrast.test.js` (including: neither doc contains "(has a text label)" or "no fill or label"); design review (copy lens) reads the CHANGELOG line.

## Review focus

- **Quiet look, the main question:** the secondary button's outline goes from a faint hairline to the control gray (`#838e9a` / `#68727f`). Look at every footer in both themes: Cancel next to Save (primary fill) and next to Delete (red), in the narrow stacked layout and in the city modal. Does Cancel now compete with Save, or does it read as a clearly pressable but secondary action? If it reads too heavy, the fallback is a documented exception for text-labelled buttons (the earlier decision), which would close this item as "not done" with the reason; say so explicitly in the verdict instead of softening the value.
- **Consistency:** fields and Cancel now share one border gray; check the Add link dialog where fields and the footer are in one view.
- **States:** hover (to `--primary`, 5.58 / 4.51 step), focused default button (fill plus ring, border 2.66 / 2.28 accepted), disabled Save next to an enabled Cancel (the Save is dimmed: does the dimmed primary still read as disabled rather than as a ghost button next to a solid-outlined Cancel).
- **Neighbour colors:** the button sits on `--panel` in both dialogs; confirm no dialog paints a different background behind the footer (a tinted footer would change the pair).
- **Regression:** `test/borderContrast.test.js`, `test/focusTokens.test.js`, `test/designSystem.test.js`, `test/newtabSource.test.js`; E2E `dg-39`, `dg-41`, `dg-42`, `dg-46`, `dg-47`, `dg-48`, `dg-49`, `13-city-modal`, `15-city-modal-layout`. Gate sweep: all six dialogs by two themes.

## Changes after review

Review: `.private/pipeline/reports/button-border-contrast-spec-review.md` (stage 1, verdict needs revision). Defaults of the reviewer accepted for all.

- **I1** AS-BB-07: no longer claims a full-width button; asserts inside dialog/viewport, width > 0, 1 px border; full width only for Delete in Edit link at <= 600 px.
- **I2** AS-BB-03/04: primary is named by `.button--primary`; Add link's primary is labelled "Add", others "Save"; same fix in the plan's `dg-51` step.
- **I3** "What changes in the earlier decision" now lists every place in `docs/border-contrast.md` and `docs/design-system.md:70-71`; AS-BB-10 and the unit test assert the stale phrases are gone. Docs themselves are edited by the implementer.
- **M1** line ref `:187` to `:192` in the spec (backlog line 8 fixed in notes).
- **M2** Intake: constructors distinguished (`newtab.js:435` vs `createDialogCancel`).
- **M3** "Against" paragraph added; decision "do it" kept.
- **M4** AS-BB-09 Given gains the edit-weather dialog (`.text-button`).
- **M5** AS-BB-05 no longer reads `cursor` as an assertion.
- **M6** "Procedure items that do not apply" added; status set to `draft`.
- **M7** AS-BB-04(b) keyboard path defined (bounded Tab loop plus `:focus-visible`); AS-BB-02 path to the city change modal given.
- **M8** Plan: the plan's last summary task duplicates the final-gate task; accepted deviation recorded in the plan (no checkpoint: one declaration).

### Design-review spec round 1

Run: `.private/design-review/runs/2026-10-04-accd1b8-spec-r1/` (verdict: blocked by one Important; L0-06 rejected by the skeptic and not changed).

- **L0-02** (Important) AS-BB-04: hover and focus-visible are checked separately; between them the cursor is moved off (`page.mouse.move(1, 1)`), `:hover` must be false before the keyboard path, and (b) asserts `:hover` false and `:focus-visible` true.
- **L0-01** AS-BB-02 Given: seeds split per dialog; first-run runs with no city and no dismissal flag, the other five with a stored city and a favorite.
- **L0-03** AS-BB-06: selectors are `.favorite-form__footer .button` and `.city-modal__actions .button`.
- **L0-04** "What changes" lists `docs/border-contrast.md:118` ("five-surface" to "six-surface"); AS-BB-10 matches the whole token `var(--color-border)` (regex `/var\(--color-border\)/`, no `-control`) and checks "six-surface".
- **L0-05** AS-BB-08 and decision 8: the `d2c3aad` "before" procedure is written in the spec (clean checkout or worktree, constant `FORCED_BEFORE` as in `dg-50`); the check is stated as characterization (system palette decides), criteria: contrast >= 3.0 against the forced background and after == before; "plan Step N" references replaced with self-contained text.
- **L0-06** rejected (Review focus holds judgements, no measurable criterion needed); unchanged.
