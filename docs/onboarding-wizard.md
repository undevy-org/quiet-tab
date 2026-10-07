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

## Current behaviour (`main` at `43474f0`)

When `shouldAutoShowCityPrompt` allows, boot opens `showCityModal("first-run", null)` before the first render (`docs/first-run-empty-desk.md`): the desk is veiled, the modal title is "Show weather on your new tab?", footer **Not now** | **Save**, no starter links step. Dismissal sets `quietTabWeatherPromptDismissed` in `chrome.storage.local`. Change-mode city flow is separate.

## Default decisions (owner can override)

1. **Trigger and veil unchanged.** The wizard opens only when today's first-run city prompt would open (`shouldAutoShowCityPrompt` with the same inputs, once per load, flag read capped at 250 ms, early `firstRunPromptPossible` check). `showCityModal("first-run", …)` is **not** called; instead `showOnboardingWizard()` runs at the same boot point. First-run still veils `#favorites` (`data-veiled="true"`) and uses the same reveal on close (`docs/first-run-empty-desk.md` decisions 2–4). Change-mode never veils.
2. **One modal shell, two steps.** A single overlay (new root id `#onboarding-wizard`, or reuse `#city-modal` with a distinct `data-mode="onboarding"` — implementer's choice; E2E must target stable selectors documented in the plan). Step index `1 | 2` in JS state only; no header toolbar (no step label, ×, or back chevron in the chrome).
3. **Progress indicator (variant D).** Inset row at the top of the dialog panel (same horizontal padding as modal content): two pills, height **5px**, gap **6px**, border-radius full. Inactive: `--soft-fill`. Active: `--border-control` (not `--primary`). Step 1: left pill active. Step 2: both pills active (completed + current). No numeric "Step 1 of 2" text.
4. **Step 1 — City.** Title: "Where should we show weather?" Subtitle: "Enter a city, or skip for now." Body: the same city field, suggestions popover, busy/save validation and error slot behaviour as first-run `#city-modal` today (no "Current:" line; no prefill; does not steal focus on open). Footer **50/50**: **Skip** (secondary, no icon) | **Continue** (primary, label then `arrowRight` icon after text). **Skip** advances to step 2 without geocoding, without `weatherService.selectLocation`, without setting `quietTabWeatherPromptDismissed`. **Continue** enabled under the same rules as today's Save (valid chosen city or successful pick); on success persists the city like today's Save, then advances to step 2. On Continue failure the wizard stays on step 1 with the error shown (unchanged city error UX).
5. **Step 2 — Starter links.** Title: "Add starter links". Subtitle: "Keep the ones you want on your grid." Body: a scrollable list only (title, subtitle, progress, footer fixed). List rows are full-width **2×1** `favorite-tile` previews with a custom checkbox at the right (checked = on grid after Finish). Unchecked rows: ~**0.4** opacity and favicon **grayscale** (CSS filter). Scroll: **~3.5 rows** visible (three full rows + half of the fourth); `overflow-y: auto` on the list region, not the whole dialog (same pattern as inner scroll in the city modal). Default **checked** (3): ChatGPT, YouTube, X. Full list order (8): ChatGPT, YouTube, X, GitHub, Gmail, Spotify, Reddit, Amazon. Favicons via extension `/_favicon/` URLs. Created favorites are **2×1** with labels and auto accent from favicon where applicable; Gmail manual accent **rgb(26, 115, 232)** when that row is selected. Footer **50/50**: **Back** (`arrowLeft` before text) | **Finish** (primary, `check` icon after text). **Back** returns to step 1 preserving step-1 field state (city text and `chosenCity` if any). **Finish** runs one mutation batch: add each checked starter link via `widgetsService.addFavorite` (or equivalent) with `w: 2, h: 1`, then closes the wizard.
6. **Dismissal semantics.** There is no **Not now** and no path that sets `quietTabWeatherPromptDismissed`. **Step 1:** Escape and backdrop (after the 300 ms guard) behave like **Skip** (step 2, no city write). **Step 2:** Escape and backdrop behave like **Finish** (decision 5 mutation + close). **Back** is the only way to return to step 1. Tab trap stays on both steps.
7. **Focus.** Step 1: same as today's first-run city modal (no auto-focus steal). Step 2: focus moves to the list or first control per mockup; Finish is reachable by keyboard. On close after Finish (or after step 2 completes), focus rules match today's first-run close (`docs/first-run-empty-desk.md` decision 5) adapted to the wizard root.
8. **Completion flag.** New key in `chrome.storage.local`: `quietTabOnboardingWizardComplete` = `true` when step 2 closes successfully via **Finish**, **Escape**, or **backdrop** (including zero links selected). `shouldAutoShowCityPrompt` / the boot path opens the wizard only when the first-run prompt is otherwise possible and this flag is false (legacy `quietTabWeatherPromptDismissed` still suppresses the old prompt path for dev profiles that have it; the wizard does not write it). Completing without a city leaves the hint tile as today.
9. **No mid-wizard persistence.** Step index and checkbox selections live in memory only for the current page load. A new tab or reload before completion runs the boot path again: wizard at **step 1**, defaults for checkboxes, city field reflects sync if a city was already saved on an earlier load.
10. **Starter link data is code constants**, not sync storage (a single exported list in `src/` with url, label, domain, defaultChecked, optional fixed accent). No migration.
11. **Nothing else changes** for change-mode city, desktop dialogs, edit mode, weather retry, or grid layout defaults (`docs/vertically-centered-defaults.md`).

## Scope

- New module (e.g. `src/onboardingWizard.js`) or split with `cityPrompt.js`: wizard DOM, step state, starter list UI, `showOnboardingWizard` / `hideOnboardingWizard`, integration with existing city suggestion helpers where possible.
- `src/newtab.js`: boot calls wizard instead of `showCityModal("first-run")`; veil/reveal hooks on the wizard show/hide paths; remove or guard dead first-run city path.
- `src/newtab.css`, `src/surfaces.css` / `src/controls.css`: wizard layout, progress pills, scroll body, list row checkbox, muted unchecked state.
- `src/cityPrompt.js`: export or share predicates; extend auto-show logic for completion flag (unit tests).
- Unit tests: wizard step transitions (Skip → 2, Continue with mock weather), Finish adds N favorites, flag written; boot order pins in `test/newtabSource.test.js` updated.
- E2E: new `dg-60-onboarding-wizard.mjs` (AS-OB-01..13). **Known to change**: `dg-56-first-run-empty-desk`, `dg-15-city-first-run`, `13-city-modal` first-run cases, any scenario expecting first-run `#city-modal` title "Show weather on your new tab?" or Not now — update to wizard copy and actions; list in run record.
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
- When: Escape pressed (or backdrop after guard).
- Then: same storage outcome as Finish (two favorites, complete flag true, wizard closed); `quietTabWeatherPromptDismissed` unset.
- Verified by: E2E `dg-60` group 12.

## Review focus

None (owner confirmed 2026-10-07).

## Visual reference

| Reference | Path |
|-----------|------|
| **Development target** | notes `superpowers/mockups/2026-10-07-onboarding-wizard/onboarding-mockup-final.html` |
| Progress variants (chosen D) | notes `superpowers/mockups/2026-10-07-onboarding-wizard/onboarding-progress-variants.html` |
