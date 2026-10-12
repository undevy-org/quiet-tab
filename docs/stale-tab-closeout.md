# Stale-tab recovery close-out: dismissable failure message, neutral reset tone, wizard, city, low windows

## Status

`draft` — closes backlog 73 and 74 and the open items of runs 29 and 30: a city kept in the stale tab's memory, low windows, a rejected second write after Add link. Follow-up to `docs/stale-tab-recovery-followups.md` (`implemented`). **Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`); storage shape unchanged.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-12 | "Хочу исправления всех этих пунктов, чтобы нигде ничего не оставалось" (backlog 73, 74, a city in a stale tab's memory, and the other open items of runs 29–30). | `confirmed` | Owner chat after run 30. |
| 2026-10-12 | The persistent failure message: **Escape and a Reload button**. | `confirmed` | Owner answer. |
| 2026-10-12 | The reset message vs errors: **a neutral tone** (red only for errors, including a failed heal). | `confirmed` | Owner answer. |
| 2026-10-12 | The first-run wizard when the storage was cleared on step 2: **heal and keep the links** (Finish writes the starter links and heals like Add link; the reset message). | `confirmed` | Owner answer. |

## Current behaviour (`main` after run 30)

- A failed heal shows `Couldn't restore your layout. Reload this tab.` in `#desktop-status` (red chip, persistent). Nothing dismisses it but a reload or the next action; Escape does nothing (edit mode is off); at 140 links in a 500×600 window it covers the bottom row of tiles.
- `Your layout was reset in another tab.` uses the same red chip as every error.
- `finishOnboardingWizard` writes the starter links with `widgetsService.addFavorites` outside `runDesktopMutation`: after the storage was cleared on step 2 the desk is links only, no Settings or Add, until a reload.
- A city kept in the stale tab's memory (`weatherLocation`, `weatherResult`) keeps drawing the weather metrics after a heal, although the storage has no city and a reload shows the hint tile.
- Add link into a cleared storage in a window lower than about 270 px: the link takes cell (0,0) and the system block goes one row down (run 30 Accepted exception L0-05). The second `set()` of the heal (the meta) rejected after Add link has no scenario.

## Default decisions (owner can override)

1. **The failure chip is dismissable and actionable (74).** The persistent failure message is built as text plus a `Reload` button inside `#desktop-status` (the text is the first child node, the button a `button.desktop-status__reload` with the accessible name `Reload`). The button calls `location.reload()`. **Escape** hides the chip: a new lowest layer `status` in `escapeLayer` (after `exitEdit`), active only while the layout-failure chip is shown. The button is the next tab stop after the last tile of the desk (right after `#favorites` on an empty desk; the chip follows the desk in DOM order); Enter/Space press it. After Escape focus stays on `#favorites`; if focus was on the Reload button, Escape returns it to `#favorites` (never `body`); `#desktop-live` stays empty. The button is `button.button.desktop-status__reload` (the shared `.button` look and `:focus-visible` ring), at least 24 px high and wide, and the chip stays inside the window down to 320 px. The chip is still an overlay (no layout change): with Escape and Reload the covered bottom row is no longer a trap.
2. **Neutral reset tone (74).** `showDesktopStatus(text, { tone: "info" })` adds `desktop-status--info`: text `var(--text)`, border `var(--border-control)`; no other change (position, size, timer 8 s, `role="alert"` unchanged). The reset message uses it, every error (including the failure chip) keeps the danger tone. The tone is set on every call: `desktop-status--info` is toggled by `tone === "info"`, so an error after a reset is red again. Contrast of the info text on `--panel` is at least 4.5:1 in both themes (measured: 18.58 light, 14.76 dark).
3. **The wizard heals (73).** `finishOnboardingWizard` runs `healClearedDesk(widgetsState)` after `addFavorites` and its `getState()`; a healed state keeps the starter links; after the wizard closes (`hideOnboardingWizard`) and the desk is rendered it shows the reset message (info tone) or, for a failed heal, `leaveEditModeAfterFailedHeal()` and `showLayoutRestoreFailure()`. The wizard still completes (`markComplete`). The heal outcome is kept in a variable until the wizard closes, and the message is shown after the close on **both** exits of `finishOnboardingWizard` that close it (the normal one and "the completion flag could not be written twice"); when the first `markComplete` fails the wizard stays open with its flag error, the second Finish does not write or heal again (`onboardingStartersCommitted`) and the kept outcome is shown when the wizard closes. While the heal is in flight the wizard stays busy (Finish disabled, Escape and a second Finish ignored). If the wizard adds no links, nothing is written and nothing changes.
4. **A city in a stale tab's memory (75).** After a successful heal `healClearedDesk` reads the stored location (`weatherLocationStore.getLocation()`); if the storage has none while the tab still holds one, the tab drops it exactly like the "city removed elsewhere" path of the retry (`weatherLocation = null`, `weatherLocationError = ""`, `weatherResult` = the `no-location` result, `weatherGeneration` and `weatherRetryToken` incremented, retry state reset, timer cleared). `getLocation()` returns `null` for a missing or malformed location and throws when the read fails: on a throw nothing is dropped (as at boot); only `null` drops the city, so the hint tile stands in the first metric's cell as on a reload. A location still in storage (only the widget keys were lost) is left alone and the weather keeps showing.
5. **Low windows (L0-05 of run 30): specified as measured, no code change.** In a stale tab the added link is written first and the heal's block then goes around it. In windows lower than the threshold (measured: at 1280×300 and above the layout equals a fresh install followed by an ordinary Add link; at 1280×250, 200, 160 and 120 it does not) the link stays in row 0 at (7,0) and the system block goes to row 1 (`--rows` 2, the desk scrolls), where a fresh install followed by an ordinary Add link would put the link at (11,0) beside the block in row 0. This is accepted (Accepted exceptions) and pinned by the scenario; a reload keeps the same layout, nothing overlaps, there is no horizontal scroll and one alert.
6. **The second write of the heal after Add link (L0-07 of run 30).** The harness helper `failStorageSetAfter` gets `skip` (the first `skip` matching calls pass): with `key: "quietTabWidgetsMeta"` and `skip: 1` the add's own write passes and the heal's meta write is rejected. Expected: the failure state of run 30 (link drawn, no system tiles, persistent chip with Reload), a reload shows the link and the three default tiles.
7. **Run 30 expectations that change:** in `dg-68` and `dg-70` the status helper reads the first text node (the chip now may hold a button); AS-SFU-05's "still visible after 9 s" stays; the "reset" checks gain the info tone; the Accepted exceptions of `docs/stale-tab-recovery-followups.md` about Escape, the covered row and the low windows/second write are updated.

## Scope

- `src/newtab.js`: `showDesktopStatus` (tone), `showLayoutRestoreFailure` (button), the Escape layer and its flag, `healClearedDesk` (weather resync), `finishOnboardingWizard`; `src/desktopUiState.js`: `escapeLayer` layer `status`; `src/newtab.css`: `.desktop-status--info`, `.desktop-status__reload`. Tests: `test/desktopUiState.test.js` (the layer), `test/newtabSource.test.js` pins.
- `docs/stale-tab-closeout.md` (this spec → `implemented`), `docs/stale-tab-recovery-followups.md` and `docs/stale-tab-empty-state.md` (Accepted-exception updates), `docs/architecture.md`, `docs/design-system.md` (status chip tones), `CHANGELOG.md`; notes `agent-config/CLAUDE.md`, backlog 73–75 closed (75, the city in a stale tab's memory, is added to the backlog by this run).
- E2E: new `dg-71-stale-tab-closeout.mjs`; harness `failStorageSetAfter(..., { skip })`; `dg-68`/`dg-70` adjusted (decision 7); `dg-60` (wizard) and `dg-67` stay green.

## Non-goals

- Real screen reader speech and real sync between devices (checked by hand, outside the E2E); a city kept in the memory of a tab that is not healing.
- Moving the chip out of the overlay; new strings other than `Reload`; changing `ensureWidgetsLayout`.
- The onboarding wizard on the next reload after a wipe (it shows again only if its completion flag is not written; after a Finish the flag is rewritten and it does not show).

## Accepted exceptions

- The chip is still an overlay: in a very low or crowded window it can cover tiles until it is dismissed (Escape or Reload) — existing overlay behaviour (`docs/vertically-centered-defaults.md`).
- After a failed heal following an action whose own write succeeded, the caller's own announcement may still be spoken (run 30).
- The wizard's heal runs only when the wizard adds links; a wizard that adds none writes nothing.
- In windows lower than the threshold of decision 5 the healed layout after Add link differs from a fresh install followed by an Add link (link in row 0, block in row 1).
- `ENSURE_FAILED_MESSAGE` stays without Escape and Reload (a boot message with its own advice); after Escape on the failure chip an empty desk has no Settings or Add until a reload.

## Acceptance scenarios

Common Given (as `docs/stale-tab-recovery-followups.md`): tabs A and B on the same profile, no city unless stated; B opened at 1280×800 on a desk with links f0, f1, f2 and the default tiles; A cleared `chrome.storage.sync` and `chrome.storage.local` (`clearAll`); B in edit mode and stale. "Failed heal" = `failStorageSetAfter(B, { area: "sync", key: "quietTabWidget:chrome:add" })` set after B's load and Save on f0.

### AS-STC-01 The failure chip can be dismissed and acted on (74)
- Given: common Given and a failed heal.
- When: (a) press Escape; (b) in a fresh run press Tab from `#favorites` and Enter; (c) in a fresh run click the button.
- Then: the chip reads `Couldn't restore your layout. Reload this tab.` followed by a button named `Reload`. (a) the chip is hidden, `#desktop-live` stays empty, focus stays on `#favorites`, the page did not reload; with focus on the Reload button Escape hides the chip and returns focus to `#favorites`. (b) on the empty desk the button is the next tab stop after `#favorites` and Enter reloads the tab: the three default tiles (`weather:hint`, `chrome:settings`, `chrome:add`), the chip gone; with one link drawn (Add link, AS-STC-06) the order is the link tile, then Reload. The button is at least 24×24 px and has a visible focus ring. (c) the same by click.
- Verified by: E2E `dg-71` group 1.

### AS-STC-02 The reset message is neutral, errors stay red (74)
- Given: common Given, a successful heal (Save on f0); and a failed heal in a second run.
- When: read `#desktop-status` styles.
- Then: reset: text color equals the page text color, border color equals `--border-control`, contrast text on panel ≥ 4.5:1 in light and dark themes, `role="alert"`, hidden after 8 s; failed heal and an ordinary error (the gone-link text `This link was deleted in another tab.`) keep the danger color; in one run a reset message followed by an error shows the error in the danger color (the tone does not stick).
- Verified by: E2E `dg-71` group 2.

### AS-STC-03 The wizard heals and keeps the starter links (73)
- Given: the first-run wizard open on step 2 in B (as `dg-60`), starter links checked; A clears the storage.
- When: Finish.
- Then: the wizard closes; B shows the fresh-install system tiles and exactly the checked starter links; sync holds the starter links, the six system item keys and the meta; the reset message in the neutral tone; no page error. With a failing `quietTabWidget:chrome:add` write the starter links are drawn alone, the persistent failure chip with Reload shows, edit mode is off, focus on `#favorites`, a reload shows the links and the three tiles. A wizard with no checked starter writes no widget key. If the first write of the local completion flag is rejected, the wizard stays open with its flag error and no heal message; the second Finish closes it and the kept outcome (reset message, or the failure chip) is shown.
- Verified by: E2E `dg-71` group 3.

### AS-STC-03b A slow heal in the wizard
- Given: as AS-STC-03 with `failStorageSetAfter(B, { area: "sync", key: "quietTabWidget:chrome:add", ms: 9500 })`.
- When: Finish; during the wait press Finish again and Escape.
- Then: the wizard stays open and busy (Finish disabled) for the whole wait, a second Finish and Escape write nothing; after the write lands the wizard closes, the desk is healed, the reset message shows about 8 s from its own appearance (visible after 6.5 s, gone after 9 s).
- Verified by: E2E `dg-71` group 3.

### AS-STC-04 A city in the stale tab's memory (75)
- Given: common Given with a city and a fresh weather cache seeded before B opened (metrics drawn in B), then A clears both areas.
- When: Save on f0 in B (a successful heal).
- Then: B shows the hint tile in the first metric's cell, Settings and Add (the fresh-install tiles, equal to a reload of B) and no weather metric tile or text (on `main` the four metrics stay drawn from memory); a city chosen on step 1 of the wizard before a wipe is dropped the same way. Variant: only the widget keys were deleted (the location stays in sync): the heal keeps the city and the metrics.
- Verified by: E2E `dg-71` group 4.

### AS-STC-05 Low windows (run 30 L0-05)
- Given: common Given with B at 1280×300, 1280×250, 1280×200 and 1280×120.
- When: Add link into the cleared storage.
- Then: at 1280×300 the tiles equal a fresh install at that size followed by an ordinary Add link in the same window (cells per tile id); at 250, 200 and 120 the link is in row 0 and the system block (hint, Settings, Add) in row 1, `--rows` 2, nothing overlaps; in all four a reload gives the same cells, one alert, no horizontal scroll.
- Verified by: E2E `dg-71` group 5.

### AS-STC-06 The heal's second write rejected after Add link (run 30 L0-07)
- Given: common Given and `failStorageSetAfter(B, { area: "sync", key: "quietTabWidgetsMeta", skip: 1 })`.
- When: Add link.
- Then: the add's own write passes, the heal's meta write is rejected: the persistent failure chip with Reload, edit mode off, focus on `#favorites`, the new link drawn and no system tile, no page error; after a reload the link and the three default tiles.
- Verified by: E2E `dg-71` group 6.

### AS-STC-07 Unchanged behaviour
- Then: `dg-70`, `dg-68`, `dg-67`, `dg-60` stay green with the adjusted helpers; an ordinary error (gone link, no heal) is red and disappears after 8 s; the ensure failure message (the only other persistent one; a retry failure is an ordinary 8 s message) keeps its tone and is not dismissed by Escape (only the layout-failure chip is).
- Verified by: E2E `dg-71` group 7 and the named scenarios; unit tests for `escapeLayer`.

## Review focus

- Escape dismisses only the layout-failure chip and only when no higher layer is open; Reload is reachable by keyboard and named.
- The reset message really reads as neutral in both themes while errors stay red; the chip never becomes silent (one alert).
- The wizard path keeps the starter links on a healed desk and completes the wizard; no widget key is written when none is checked.
- The city drop mirrors a reload exactly (hint tile) and does not drop a location still stored.

## Copy (user-visible)

| String | Where |
|--------|-------|
| `Reload` | the button in the failure chip |
| `Couldn't restore your layout. Reload this tab.` | unchanged text, now with the button |
| `Your layout was reset in another tab.` | unchanged text, neutral tone |
