# Onboarding wizard: first-run city and starter links

## Status

`implemented`

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

1. **Trigger and veil.** Replace the first-run city modal only. Boot calls `showOnboardingWizard()` at the same point as today's `showCityModal("first-run")` (`docs/first-run-empty-desk.md`). **`onboardingWizardPossible(input)`** (new, unit-tested) mirrors today's first-run gates **except** it does **not** require `hasLocation === false` (`src/cityPrompt.js:23`). **`shouldShowOnboardingWizard()`** is true when: `onboardingWizardPossible`; `quietTabOnboardingWizardComplete` is false; `quietTabWeatherPromptDismissed` is false; both local keys read in **one** `chrome.storage.local.get` within the 250 ms cap (fail closed on error/timeout); wizard not already shown this load. A profile that saved a city on step 1 but did not finish step 2 still reopens the wizard (decision 9). **Remove** `shouldAutoShowCityPrompt`, `firstRunPromptPossible`, `maybeAutoShowCityPrompt`, `showCityModal("first-run")`, `onFirstRunDismissed`, first-run **Not now**, and the `first-run` entry in `CITY_MODAL_MODES` (`src/weatherUiState.js`); update `test/cityPrompt.test.js` and `test/newtabSource.test.js` pins. First-run veils `#favorites` via wizard show/hide. Change-mode never veils.
2. **One modal shell, two steps.** Implement as **`#onboarding-wizard`** with `CITY_MODAL_MODES` entry **`onboarding`** so `isCityModalOpen`, escape layer, and tab-trap reuse today's modal stack (`src/newtab.js` escape/tab paths). Root: `role="dialog"`, `aria-modal="true"`. **`aria-labelledby`** points at the **active** step title id (update when step changes). Step index `1 | 2` in JS only; no header toolbar. Hidden step panel is `inert` (tab trap must ignore inert descendants). Veil invariant from `docs/first-run-empty-desk.md` decision 2 moves to onboarding show/hide (not `showCityModal("first-run")`).
3. **Progress indicator (variant D).** Inset row at the top of the dialog panel (same horizontal padding as modal content): two pills, height **5px**, gap **6px**, border-radius full. Inactive: `--soft-fill`. Active: `--border-control` (not `--primary`). Step 1: left pill active. Step 2: both pills active (completed + current). No numeric "Step 1 of 2" text.
4. **Step 1 — City.** Title: "Where should we show weather?" Subtitle: "Enter a city, or skip for now." Body: reuse city field, suggestions popover, busy/save validation and error slot from today's first-run city modal (no "Current:" line; no focus steal on open). Reload before complete: field shows stored location (`chosenCity`) like change-mode prefill. Footer **50/50**: **Skip** | **Continue** (`arrowRight` after label). **Skip** → step 2 without geocode, without `quietTabWeatherPromptDismissed`. **Continue** disabled while step 1 **busy**; enabled when the city field is non-empty (same as today's Save, `newtab.js:661-665`). On success `changeCity` runs with **`onSuccess` → advance to step 2** (must not call `hideCityModal()`). On failure stay on step 1 with error. While busy, **Skip**, Escape, and backdrop are ignored (match today's busy city modal). Escape with an open suggestions list: first Escape closes the list (`escapeLayer`), second behaves like Skip (AS-OB-11). Popover placement: on low windows use the same docked/scroll dialog behaviour as first-run city modal when needed (AS-OB-16); step-1 shell must not clip the popover.
5. **Step 2 — Starter links.** Title: "Add starter links". Subtitle: "Keep the ones you want on your grid." Body: a scrollable list only (title, subtitle, progress, footer fixed). Each row is one **`<label>`** wrapping the native checkbox and a non-interactive **2×1** preview (`div`, not `button`). **Click anywhere on the row** or **Space** while focus is on the row toggles the checkbox (same as a native label). Min **44×44 px** row height, visible `:focus-visible` on the checkbox control. Unchecked **preview tile and favicon only** ~**0.4** opacity + **grayscale** — **label text always full opacity** (≥ 4.5:1). Scroll: list region `max-height: calc(var(--cell-size) * 3.5 + var(--grid-gap) * 3)` (same formula as mockup, AS-OB-04) and `overflow-y: auto`; do **not** use `flex: 1 1 auto` on the list (prevents 7+ visible rows). When `100vh − 32px` is less than the fixed chrome + capped list, the **dialog panel** uses `.city-modal__dialog--scroll` so **Back** and **Finish** stay reachable down to **320×200** (list keeps the cap and scrolls inside). Dialog shell: **no `overflow: hidden`** (popover on step 1 must not clip). Default **checked** (3): ChatGPT, YouTube, X. Starters (order, url, label, domain, defaultChecked, optional accent hex):

| # | Label | Domain | URL | Accent |
|---|-------|--------|-----|--------|
| 1 | ChatGPT | `chatgpt.com` | `https://chatgpt.com/` | auto |
| 2 | YouTube | `youtube.com` | `https://www.youtube.com/` | auto |
| 3 | X | `x.com` | `https://x.com/` | auto |
| 4 | GitHub | `github.com` | `https://github.com/` | auto |
| 5 | Gmail | `mail.google.com` | `https://mail.google.com/` | manual `#1a73e8` |
| 6 | Spotify | `open.spotify.com` | `https://open.spotify.com/` | auto |
| 7 | Reddit | `reddit.com` | `https://www.reddit.com/` | auto |
| 8 | Amazon | `amazon.com` | `https://www.amazon.com/` | auto |

Favicons via `/_favicon/`. On **Finish**, call **`widgetsService.addFavorites(inputs, { columns })`**: one `mutate`, `placeNew` per checked row in table order, single `MAX_FAVORITE_WIDGETS` check, **skip URLs already present** among favorites (normalized URL dedup). Returns added widget ids. Each input: `w: 2`, `h: 1`, url, label, `backgroundColor` / `backgroundColorSource` (`manual` + `#1a73e8` for Gmail). Then write `quietTabOnboardingWizardComplete` and close the wizard; **`refreshAutoAccent`** for `auto` rows runs **`void` after close** (same as Add link, do not block UI). If the batch fails, stay on step 2 with inline error (copy: **"Couldn't add links. Try again."**), **Finish** re-enabled, flag false; desk stays veiled until success or user clears all checks and finishes with zero links. If the batch succeeded but flag write fails: show error, allow one retry; after a second flag failure **close the wizard** (best-effort, like `onFirstRunDismissed`); in-memory **`startersCommitted`** prevents duplicate adds on retry in the same session. Footer **50/50**: **Back** (`arrowLeft`) | **Finish** (`check`). **Step-2 entry guard:** for **300 ms** after entering step 2, ignore Finish, Back, Escape, and backdrop. **Finish** disabled while finish runs (`favoritesBusy` / `runDesktopMutation` pattern).
6. **Dismissal semantics.** No **Not now**, no `quietTabWeatherPromptDismissed`. **Step 1:** Escape (ignore `keydown.repeat`) and backdrop (300 ms after wizard open) like **Skip** when not busy. **Step 2:** Escape (ignore repeat) and backdrop like **Finish** when not busy and outside the step-2 entry guard. **Back** only return to step 1. Tab trap on active step.
7. **Focus.** Step 1: same as today's first-run city modal (no auto-focus steal). On entering step 2, focus moves to the first checkbox (or the list container if empty). **Back** from step 2: focus returns to step 1 title (`tabindex="-1"`) or **Continue**, not the city field. Tab order: all checkboxes, then **Back**, then **Finish**. On close after successful completion, focus rules match today's first-run close (`docs/first-run-empty-desk.md` decision 5) adapted to `#onboarding-wizard`.
8. **Completion flag.** `chrome.storage.local` key `quietTabOnboardingWizardComplete` = `true` only after decision 5 succeeds (including zero links). Boot uses decision 1; the wizard does not write `quietTabWeatherPromptDismissed`. Completing without a city leaves the hint tile as today.
9. **No mid-wizard persistence.** Step index and checkbox selections live in memory only for the current page load. A new tab or reload before completion runs the boot path again: wizard at **step 1**, defaults for checkboxes, city field reflects sync if a city was already saved on an earlier load.
10. **Starter link data is code constants** mirroring the table in decision 5 (single exported list in `src/`). No migration.
11. **Nothing else changes** for change-mode city, desktop dialogs, edit mode, weather retry, or grid layout defaults (`docs/vertically-centered-defaults.md`).

## Scope

- New module (e.g. `src/onboardingWizard.js`) + `src/onboardingStore.js` (or weatherStore-adjacent helpers) for `quietTabOnboardingWizardComplete` read/write under the 250 ms cap.
- `src/widgetsService.js`: **`addFavorites`** batch API (decision 5).
- `src/newtab.js`: boot calls wizard instead of `showCityModal("first-run")`; veil/reveal hooks on the wizard show/hide paths; remove or guard dead first-run city path.
- `src/newtab.css`, `src/surfaces.css` / `src/controls.css`: wizard layout, progress pills, scroll body, list row checkbox, muted unchecked state.
- `src/cityPrompt.js`: `onboardingWizardPossible` / `shouldShowOnboardingWizard`; remove first-run prompt predicates (decision 1).
- `src/weatherUiState.js`: drop `first-run` mode; add `onboarding` if not folded into wizard root only.
- `src/icons.js`: ensure `arrowLeft`, `arrowRight`, `check` exist (or add) for footer buttons.
- Unit tests: wizard step transitions (Skip → 2, Continue with mock weather), Finish adds N favorites, flag written; boot order pins in `test/newtabSource.test.js` updated.
- E2E: new `dg-60-onboarding-wizard.mjs` (AS-OB-01..31). **Rewrite every scenario** that uses `autoPrompt: true` or first-run city copy: `13-city-modal`, `14-*`, `15-*`, `dg-14`, `dg-15`, `dg-45`, `dg-47`, `dg-48`, `dg-49`, `dg-50`, `dg-51`, `dg-52`, `dg-53`, `dg-56`, `dg-58`, `dg-59`, plus `lib/cityModalSweep.mjs` and `dg-46` where they assert first-run modal; grep `Show weather on your new tab`, `Not now`, `first-run` in `.private/e2e/scenarios/`.
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
- **Starter row click target:** implementation uses a wrapping `<label>` (whole row toggles). The development mockup uses a `button` preview where only the 22×22 checkbox toggles; **ship label semantics**, mock aligned at checkpoint.

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
- Given: step 2, 8 rows, harness 1280×800.
- When: `list.clientHeight / rowPitch` (row includes gap).
- Then: ratio in **3.3..3.7**; footer and title fixed.
- Verified by: E2E `dg-60` group 4.

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
- Given: step 2, two starters checked, ≥ **300 ms** after entering step 2.
- When: Escape pressed once (or backdrop after wizard open guard).
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
- Given: harness resize (same fixtures as `dg-48` / `15-city-modal-layout` / `dg-53` where only viewport differs).
- When: step 1 at **320×400**; step 2 at **500×600**, **500×420**, **320×320**, and **320×200**.
- Then: step 1 city field and suggestions usable (popover not clipped; docked list behaviour per `docs/city-modal-low-window.md` when applicable); step 2 list keeps **max-height** cap (~3.5 rows); when content exceeds viewport the wizard panel has **`.city-modal__dialog--scroll`** (same rule as city modal `placePopover` / `tooTall`); footer **Back** and **Finish** reachable without clipping.
- Verified by: E2E `dg-60` group 15; regressions may reuse resized groups from `dg-48`, `dg-53`, `15-city-modal-layout` adapted to wizard step 1.

### AS-OB-17 Tab order and focus on step 2
- Given: step 2.
- When: user Tabs from the document.
- Then: focus visits each checkbox, then Back, then Finish; hidden step 1 controls are skipped.
- Verified by: E2E `dg-60` group 16 (keyboard smoke).

### AS-OB-18 Finish busy ignores duplicate actions
- Given: step 2, `delayStorageInit` on widget or flag write.
- When: Finish is double-clicked or Escape sends `keydown.repeat`.
- Then: at most one finish attempt; wizard closes once with correct favorite count.
- Verified by: E2E `dg-60` group 17; unit pin in `test/newtabSource.test.js`.

### AS-OB-19 Finish storage failure stays on step 2
- Given: step 2, `failStorageInit` on sync write to `quietTabWidgetsMeta`.
- When: Finish is clicked.
- Then: error shown; complete flag false; no partial favorites on grid (batch all-or-nothing).
- Verified by: E2E `dg-60` group 18.

### AS-OB-20 Flag write failure after successful adds
- Given: step 2, adds succeed, `failStorageInit` on `quietTabOnboardingWizardComplete` set.
- When: Finish is clicked, then retried once.
- Then: after retry still failing, wizard closes without duplicate favorites; next load does not re-add the same URLs (dedup).
- Verified by: E2E `dg-60` group 19.

### AS-OB-21 Continue double-click stays on step 2
- Given: step 1, valid city, fast double-click Continue.
- When: step 2 appears.
- Then: wizard open; complete flag false; no accidental Finish; no favorites yet.
- Verified by: E2E `dg-60` group 20.

### AS-OB-22 Held Escape on step 1 does not finish
- Given: step 1.
- When: Escape keydown with `repeat` fires through step 2 entry.
- Then: user remains on step 2 only; complete flag false until explicit Finish.
- Verified by: E2E `dg-60` group 21.

### AS-OB-23 Step 1 busy ignores Skip, Escape, and backdrop
- Given: step 1, Continue in flight (`delayStorageInit` or network fixture as in `dg-45` / `dg-47`).
- When: user presses Skip, Escape, or backdrop click.
- Then: wizard stays on step 1 busy; no step 2; city unchanged.
- Verified by: E2E `dg-60` group 22.

### AS-OB-24 Escape with city suggestions open on step 1
- Given: step 1, suggestions list open (same interaction as `13-city-modal` / `dg-15` first-run suggestion flow, wizard copy).
- When: Escape once, then Escape again.
- Then: first Escape closes suggestions only; second advances like **Skip** (step 2, no city write).
- Verified by: E2E `dg-60` group 23.

### AS-OB-25 Backdrop after guards matches Skip or Finish
- Given: wizard open ≥ **300 ms**; step 1 then step 2.
- When: backdrop click on each step.
- Then: step 1 → step 2 without city; step 2 → same outcome as **Finish** for current checkbox selection.
- Verified by: E2E `dg-60` group 24.

### AS-OB-26 Starter row toggles by click and Space
- Given: step 2, one row focused.
- When: click on preview/label area (not only the 22×22 box); Space key.
- Then: checkbox toggles; accessible name includes link label.
- Verified by: E2E `dg-60` group 25.

### AS-OB-27 Finish dedupes URLs already on the grid
- Given: step 2, profile already has ChatGPT favorite; ChatGPT row checked.
- When: Finish.
- Then: no duplicate ChatGPT tile; complete flag true; other checked starters still added.
- Verified by: E2E `dg-60` group 26; related harness `dg-26-two-tabs` optional stress.

### AS-OB-28 Favorite limit blocks Finish with Copy message
- Given: step 2, grid at **200** favorites (`dg-24` seed), at least one starter checked.
- When: Finish.
- Then: error **Too many links on your grid. Uncheck some starters.**; wizard stays open; complete flag false.
- Verified by: E2E `dg-60` group 27.

### AS-OB-29 Skip then Finish without city leaves hint tile
- Given: step 1, Skip to step 2; all starters unchecked.
- When: Finish.
- Then: complete flag true; hint weather tile still shown (no city); desk revealed per `docs/first-run-empty-desk.md`.
- Verified by: E2E `dg-60` group 28.

### AS-OB-30 New starters land as valid 2×1 without overlap
- Given: step 2, default three checked, harness **1280×800** and **500×500**.
- When: Finish.
- Then: three new **2×1** favorites inside grid bounds; no overlap with chrome tiles; `placeNew` positions documented in run record.
- Verified by: E2E `dg-60` group 29.

### AS-OB-31 Focus after wizard close matches first-run reveal
- Given: wizard completes with city saved on step 1.
- When: veil reveals desk.
- Then: focus target matches `docs/first-run-empty-desk.md` decision 5 (adapted to wizard root, not `body` without destination).
- Verified by: E2E `dg-60` group 30 or `dg-56` adapted.

## Review focus

Boot predicate vs stored city (decision 1); finish sequencing and failure (decision 5); step transition/double-click guards; list a11y hit targets and contrast; overflow/suggestions on step 1; E2E sweep breadth (Scope).

## Copy (user-visible)

| Situation | Text |
|-----------|------|
| Step 2 batch write failure | Couldn't add links. Try again. |
| Step 2 flag write failure (retry) | Couldn't save setup. Try again. |
| Step 2 at favorite limit (200) | Too many links on your grid. Uncheck some starters. |

City step 1 errors reuse today's first-run city modal strings (`docs/city-error-ux.md`).

## Visual reference

| Reference | Path |
|-----------|------|
| **Development target** | notes `superpowers/mockups/2026-10-07-onboarding-wizard/onboarding-mockup-final.html` — **normative text is this spec**; mockup CSS may lag (overflow, row hit targets, preview `div` vs `button`) and is aligned at design-review checkpoint |
| Progress variants (chosen D) | notes `superpowers/mockups/2026-10-07-onboarding-wizard/onboarding-progress-variants.html` |
