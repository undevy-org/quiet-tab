# Onboarding wizard: first-run city and starter links

## Status

`draft`

Decision: **do it**. Owner request 2026-10-07 (pipeline stage 0, runs #18 / `dg-60`): replace the **first-run** `#city-modal` with a **two-step wizard** (city, then starter links). The **change-mode** city modal (`showCityModal("change", …)`) stays as today (`docs/modal-overlay-design.md`). Visual canon: notes `superpowers/mockups/2026-10-07-onboarding-wizard/onboarding-mockup-final.html` (progress indicator variant **D**, muted active pill).

Owner decisions (2026-10-07):

- **Skip on step 1** means **only** skip setting a city and go to step 2; it does **not** dismiss the wizard and does **not** write `quietTabWeatherPromptDismissed`.
- Step 2 has **no Skip**; footer is **Back** | **Finish** only.
- **Finish with zero links selected** is allowed (user gets the default desk only).
- **Escape and backdrop on step 2** (after the 300 ms guard) run the same path as **Finish**: apply checked starters, set `quietTabOnboardingWizardComplete`, close the wizard. They do **not** set `quietTabWeatherPromptDismissed`.
- The wizard **never** writes `quietTabWeatherPromptDismissed` on any path (there is no Not now). Users without a city keep the hint tile after completion.
- **Reload or new tab before completion:** if `quietTabOnboardingWizardComplete` is false, the wizard auto-opens again at **step 1** only. No persisted step index or checkbox selections. If a city is already in sync (user had Continue earlier), step 1 reflects that stored location (`chosenCity` / field state) so they can Skip to step 2 or Continue without retyping.
- **Starter list a11y:** each row uses a native **`<input type="checkbox">`** (visually styled) with an accessible name including the link label; the scroll region keeps keyboard access to every checkbox and Finish.
- **Data compatibility: not required** (no users rule, `agent-config/CLAUDE.md`).

Terms: **the wizard** = the first-run overlay that replaces today's first-run city modal. **Step 1** = city. **Step 2** = starter link picker. **Complete** = the wizard will not auto-open again on later loads (local flag, decision 8).

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-07 | Replace first-run city modal with 2-step onboarding (city + starter links); progress D; Skip on step 1 = skip city only → step 2; mockup approved. | `confirmed` | Brainstorm mockup `onboarding-mockup-final.html`; session 2026-10-07. |
| 2026-10-07 | Step 2 Escape/backdrop = Finish; no dismissed flag from wizard; incomplete profile restarts wizard at step 1; native checkboxes in list. | `confirmed` | Owner session (fix Review focus). |

## Current behaviour (`main` at `c25c152`)

When `shouldAutoShowCityPrompt` allows, boot opens `showCityModal("first-run", null)` before the first render (`docs/first-run-empty-desk.md`): the desk is veiled, the modal title is "Show weather on your new tab?", footer **Not now** | **Save**, no starter links step. Dismissal sets `quietTabWeatherPromptDismissed` in `chrome.storage.local`. Change-mode city flow is separate.

## Default decisions (owner can override)

1. **Trigger and veil.** Replace the first-run city modal only. Boot calls `showOnboardingWizard()` at the same point as today's `showCityModal("first-run")` (`docs/first-run-empty-desk.md`). **`shouldShowOnboardingWizard()`** (new predicate, unit-tested) is true when: `quietTabOnboardingWizardComplete` is false; `quietTabWeatherPromptDismissed` is false; `firstRunPromptPossible` and the once-per-load / 250 ms flag-read cap match today's first-run path. **Unlike** `shouldAutoShowCityPrompt`, this predicate does **not** require `hasLocation === false`, so a profile that saved a city on step 1 but did not finish step 2 still reopens the wizard after reload (decision 9). Legacy `shouldAutoShowCityPrompt` stays for change-mode only. First-run still veils `#favorites` (`data-veiled="true"`) and uses the same reveal on close. Change-mode never veils.
2. **One modal shell, two steps.** Root element **`#onboarding-wizard`** (`role="dialog"`, `aria-modal="true"`). Each step panel has a stable title id for `aria-labelledby` (step 2 keeps a dialog name when step 1 is hidden). Step index `1 | 2` in JS state only; no header toolbar (no step label, ×, or back chevron in the chrome). The hidden step panel is **not** in the tab order (`inert` or equivalent until active).
3. **Progress indicator (variant D).** Inset row at the top of the dialog panel (same horizontal padding as modal content): two pills, height **5px**, gap **6px**, border-radius full. Inactive: `--soft-fill`. Active: `--border-control` (not `--primary`). Step 1: left pill active. Step 2: both pills active (completed + current). No numeric "Step 1 of 2" text.
4. **Step 1 — City.** Title: "Where should we show weather?" Subtitle: "Enter a city, or skip for now." Body: the same city field, suggestions popover, busy/save validation and error slot behaviour as first-run `#city-modal` today (no "Current:" line; does not steal focus on open). If sync already has a city (reload before complete), the field shows that location like change-mode prefill (`chosenCity` / stored label) so the user can **Skip** to step 2 or **Continue** to re-save. Footer **50/50**: **Skip** (secondary, no icon) | **Continue** (primary, label then `arrowRight` icon after text). **Skip** advances to step 2 without geocoding, without `weatherService.selectLocation`, without setting `quietTabWeatherPromptDismissed`. **Continue** is disabled while step 1 is **busy** (in-flight geocode/save). Enabled when a valid city is chosen (same rules as today's Save); on success persists the city like today's Save, then advances to step 2. On Continue failure the wizard stays on step 1 with the error shown; **Continue** becomes enabled again when the user fixes input (unchanged city error UX). **Step transition guard:** after the first successful Continue click, step 1 controls are disabled until step 2 is shown so a double-click cannot hit **Finish** on step 2 instantly.
5. **Step 2 — Starter links.** Title: "Add starter links". Subtitle: "Keep the ones you want on your grid." Body: a scrollable list only (title, subtitle, progress, footer fixed). Each row: native checkbox (min **44×44 px** hit target including label text), full-width **2×1** preview, unchecked ~**0.4** opacity and favicon **grayscale**. Scroll: **~3.5 rows** visible; `overflow-y: auto` on the list region; the dialog shell must not clip the city suggestions popover on step 1 (`overflow: visible` on the shell or popover portaled like today). Default **checked** (3): ChatGPT, YouTube, X. Starters (order, url, label, domain, defaultChecked, optional accent hex):

| # | Label | URL | Accent |
|---|-------|-----|--------|
| 1 | ChatGPT | `https://chatgpt.com/` | auto |
| 2 | YouTube | `https://www.youtube.com/` | auto |
| 3 | X | `https://x.com/` | auto |
| 4 | GitHub | `https://github.com/` | auto |
| 5 | Gmail | `https://mail.google.com/` | `#1a73e8` |
| 6 | Spotify | `https://open.spotify.com/` | auto |
| 7 | Reddit | `https://www.reddit.com/` | auto |
| 8 | Amazon | `https://www.amazon.com/` | auto |

Favicons via `/_favicon/`. On **Finish**, under the widgets mutation lock, call `widgetsService.addFavorite` **once per checked row** (`w: 2`, `h: 1`, label/url/accent from the table) in list order; each placement uses `placeNew` like Add link. **Only after** all adds succeed, write `quietTabOnboardingWizardComplete` and close. If any add fails, stay on step 2 with an error message and **Finish** re-enabled; complete flag stays false. Footer **50/50**: **Back** (`arrowLeft` before text) | **Finish** (primary, `check` icon after text). **Back** returns to step 1 preserving step-1 field state. **Finish** is disabled while finish is in progress (same path for Escape/backdrop on step 2).
6. **Dismissal semantics.** There is no **Not now** and no path that sets `quietTabWeatherPromptDismissed`. **Step 1:** Escape (ignore `keydown.repeat`) and backdrop (after the 300 ms guard) behave like **Skip**. **Step 2:** Escape (ignore repeat) and backdrop behave like **Finish** only when not busy. **Back** is the only way to return to step 1. Tab trap on the active step only.
7. **Focus.** Step 1: same as today's first-run city modal (no auto-focus steal). On entering step 2, focus moves to the first checkbox (or the list container if empty). Tab order: all checkboxes, then **Back**, then **Finish**. On close after successful completion, focus rules match today's first-run close (`docs/first-run-empty-desk.md` decision 5) adapted to `#onboarding-wizard`.
8. **Completion flag.** `chrome.storage.local` key `quietTabOnboardingWizardComplete` = `true` only after decision 5 succeeds (including zero links). Boot uses decision 1; the wizard does not write `quietTabWeatherPromptDismissed`. Completing without a city leaves the hint tile as today.
9. **No mid-wizard persistence.** Step index and checkbox selections live in memory only for the current page load. A new tab or reload before completion runs the boot path again: wizard at **step 1**, defaults for checkboxes, city field reflects sync if a city was already saved on an earlier load.
10. **Starter link data is code constants** mirroring the table in decision 5 (single exported list in `src/`). No migration.
11. **Nothing else changes** for change-mode city, desktop dialogs, edit mode, weather retry, or grid layout defaults (`docs/vertically-centered-defaults.md`).

## Scope

- New module (e.g. `src/onboardingWizard.js`) or split with `cityPrompt.js`: wizard DOM, step state, starter list UI, `showOnboardingWizard` / `hideOnboardingWizard`, integration with existing city suggestion helpers where possible.
- `src/newtab.js`: boot calls wizard instead of `showCityModal("first-run")`; veil/reveal hooks on the wizard show/hide paths; remove or guard dead first-run city path.
- `src/newtab.css`, `src/surfaces.css` / `src/controls.css`: wizard layout, progress pills, scroll body, list row checkbox, muted unchecked state.
- `src/cityPrompt.js`: share city helpers; new `shouldShowOnboardingWizard` (decision 1); keep `shouldAutoShowCityPrompt` for change-mode paths (unit tests).
- `src/icons.js`: ensure `arrowLeft`, `arrowRight`, `check` exist (or add) for footer buttons.
- Unit tests: wizard step transitions (Skip → 2, Continue with mock weather), Finish adds N favorites, flag written; boot order pins in `test/newtabSource.test.js` updated.
- E2E: new `dg-60-onboarding-wizard.mjs` (AS-OB-01..18). **Known to change** (every file under `.private/e2e/scenarios/` with `autoPrompt: true` or assertions on first-run city title / Not now): at minimum `dg-56-first-run-empty-desk`, `dg-15-city-first-run`, `13-city-modal` first-run groups; grep `Show weather on your new tab` and `Not now` in scenarios and update; full list in run record.
- Docs: `docs/architecture.md` (city / first-run paragraph), `docs/first-run-empty-desk.md` (wizard instead of city modal), `CHANGELOG.md` `[Unreleased]`; private `agent-config/CLAUDE.md` first-run bullet.

## Process

Full UI pipeline: spec review, spec gate, plan in notes, E2E-first implementation, checkpoint, final design review, verification. Branches: `docs/onboarding-wizard-spec`, `feat/onboarding-wizard`, notes `docs/onboarding-wizard-plan`.

## Non-goals

- Change-mode city modal layout or copy.
- Onboarding for users who hid every metric (no prompt today, unchanged).
- Replacing Add link / edit flows; importing bookmarks from browser.
- New sync fields for onboarding progress across devices (local complete flag only).
- **Data compatibility: not required.**

## Accepted exceptions

- **Escape/backdrop on step 1 = Skip** (decision 6): users cannot one-click "never show again" without reaching Finish; they may still get the hint tile if they skip city.
- **Starter list is fixed English labels** (product copy in English).
- **Zero links on Finish** leaves only system tiles (owner approved).
- **Escape on step 2 = Finish** (owner approved): no separate cancel on step 2.
- **Continue/Finish icons** (`arrowRight`, `check`, `arrowLeft`) are new footer chrome for this wizard only.

## Acceptance scenarios

Common setup: E2E harness 1280×800, fresh profile, `autoPrompt: true`, weather fixtures as in `dg-15`. "Wizard open" = `#onboarding-wizard` visible (or documented selector). "Complete flag" = `quietTabOnboardingWizardComplete` in local storage.

### AS-OB-01 First run opens the wizard over a veiled desk
- Given: fresh install, modal possible.
- When: the tab loads.
- Then: wizard step 1 is shown with title "Where should we show weather?"; desk veiled; no legacy first-run city title "Show weather on your new tab?"; no Not now button.
- Verified by: E2E `dg-60` group 1.

### AS-OB-02 Skip on step 1 goes to step 2 without city or dismissed flag
- Given: wizard on step 1, empty city field.
- When: Skip is clicked.
- Then: step 2 title "Add starter links"; sync has no city; `quietTabWeatherPromptDismissed` unset; three default rows checked.
- Verified by: E2E `dg-60` group 2.

### AS-OB-03 Continue on step 1 with a valid city saves and goes to step 2
- Given: wizard step 1, city chosen from suggestions (fixture).
- When: Continue is clicked.
- Then: city stored like today's Save; step 2 shown; dismissed flag unset.
- Verified by: E2E `dg-60` group 3.

### AS-OB-04 Step 2 list scroll shows ~3.5 rows
- Given: step 2, 8 rows.
- When: measuring list viewport height vs row height.
- Then: roughly 3.5 rows visible before scroll; footer and title fixed.
- Verified by: E2E `dg-60` group 4 (layout assertion).

### AS-OB-05 Finish adds checked starters as 2×1 favorites
- Given: step 2, default three checked, one unchecked toggled on (GitHub).
- When: Finish is clicked.
- Then: four new favorites 2×1 on grid; complete flag true; veil removed with reveal; hint absent if city was saved on step 1.
- Verified by: E2E `dg-60` group 5.

### AS-OB-06 Finish with zero links selected is allowed
- Given: step 2, all rows unchecked.
- When: Finish is clicked.
- Then: no new favorites; complete flag true; wizard closed; desk revealed.
- Verified by: E2E `dg-60` group 6.

### AS-OB-07 Back from step 2 preserves step 1 city state
- Given: step 1 city text filled, Continue to step 2.
- When: Back is clicked.
- Then: step 1 shows the same city selection state; Continue still enabled.
- Verified by: E2E `dg-60` group 7.

### AS-OB-08 Wizard does not reopen after complete
- Given: wizard finished once.
- When: new tab in same profile.
- Then: wizard not shown; change-mode from hint still works.
- Verified by: E2E `dg-60` group 8.

### AS-OB-09 Change-mode city modal unchanged
- Given: city set, wizard complete or never shown.
- When: open city from hint or weather dialog.
- Then: `#city-modal` change flow, not wizard.
- Verified by: E2E `dg-60` group 9; regression spot-check `13-city-modal` change cases.

### AS-OB-10 Progress pills match variant D
- Given: step 1 then step 2.
- When: inspecting progress element styles.
- Then: two pills; active uses border-control color not primary; step 1 one active; step 2 both active styling per mockup.
- Verified by: design-review checkpoint against mockup; optional E2E computed-style smoke.

### AS-OB-11 Escape on step 1 advances like Skip
- Given: step 1.
- When: Escape pressed.
- Then: step 2 without city write.
- Verified by: E2E `dg-60` group 10.

### AS-OB-12 Incomplete profile reopens wizard at step 1
- Given: user reached step 2 but closed the tab without complete flag (no Finish/Escape/backdrop on step 2).
- When: a new tab opens in the same profile.
- Then: wizard shows step 1; checkbox defaults restored; if a city was saved earlier, step 1 reflects it.
- Verified by: E2E `dg-60` group 11.

### AS-OB-13 Escape on step 2 finishes like Finish
- Given: step 2, two starters checked.
- When: Escape pressed once (or backdrop after guard).
- Then: same storage outcome as Finish (two favorites, complete flag true, wizard closed); `quietTabWeatherPromptDismissed` unset.
- Verified by: E2E `dg-60` group 12.

### AS-OB-14 Reload after Continue, before complete, reopens step 1 with city shown
- Given: wizard step 1, user Continue with valid city, step 2 visible; user opens a new tab without Finish.
- When: the new tab loads.
- Then: wizard step 1 with city field reflecting stored location; complete flag false.
- Verified by: E2E `dg-60` group 13.

### AS-OB-15 Continue error keeps user on step 1
- Given: step 1, fixture forces geocode/save failure.
- When: Continue is clicked.
- Then: error visible; step 2 not shown; Continue re-enabled after fix.
- Verified by: E2E `dg-60` group 14.

### AS-OB-16 Narrow and low viewport
- Given: step 2 at width **500px** and height **600px** (harness resize).
- When: inspecting layout.
- Then: list scrolls; footer **Back** and **Finish** remain visible and clickable; step 1 at **320px** width still shows city field and suggestions without clipping the popover.
- Verified by: E2E `dg-60` group 15.

### AS-OB-17 Tab order and focus on step 2
- Given: step 2.
- When: user Tabs from the document.
- Then: focus visits each checkbox, then Back, then Finish; hidden step 1 controls are skipped.
- Verified by: E2E `dg-60` group 16 (keyboard smoke).

### AS-OB-18 Finish busy ignores duplicate actions
- Given: step 2, slow storage fixture.
- When: Finish is double-clicked or Escape is held.
- Then: at most one finish attempt runs; wizard closes once with correct favorite count.
- Verified by: E2E `dg-60` group 17; unit test for busy guard.

## Review focus

Boot predicate vs stored city (decision 1); finish sequencing and failure (decision 5); step transition/double-click guards; list a11y hit targets and contrast; overflow/suggestions on step 1; E2E sweep breadth (Scope).

## Visual reference

| Reference | Path |
|-----------|------|
| **Development target** | notes `superpowers/mockups/2026-10-07-onboarding-wizard/onboarding-mockup-final.html` |
| Progress variants (chosen D) | notes `superpowers/mockups/2026-10-07-onboarding-wizard/onboarding-progress-variants.html` |
