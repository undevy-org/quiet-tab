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

1. **The failure chip is dismissable and actionable (74).** The persistent failure message is built as text plus a `Reload` button inside `#desktop-status` (the text is the first child node, the button a `button.desktop-status__reload` with the accessible name `Reload`). The button calls `location.reload()`. **Escape** hides the chip: a new lowest layer `status` in `escapeLayer` (after `exitEdit`), active only while the layout-failure chip is shown. Tab from `#favorites` reaches the button (the chip follows the desk in DOM order); Enter/Space press it. After Escape focus stays where it is (`#favorites`); `#desktop-live` stays empty. The chip is still an overlay (no layout change): with Escape and Reload the covered bottom row is no longer a trap.
2. **Neutral reset tone (74).** `showDesktopStatus(text, { tone: "info" })` adds `desktop-status--info`: text `var(--text)`, border `var(--border-control)`; no other change (position, size, timer 8 s, `role="alert"` unchanged). The reset message uses it, every error (including the failure chip) keeps the danger tone. Contrast of the info text on `--panel` is at least 4.5:1 in both themes.
3. **The wizard heals (73).** `finishOnboardingWizard` runs `healClearedDesk(widgetsState)` after `addFavorites` and its `getState()`; a healed state keeps the starter links; after the wizard closes (`hideOnboardingWizard`) and the desk is rendered it shows the reset message (info tone) or, for a failed heal, `leaveEditModeAfterFailedHeal()` and `showLayoutRestoreFailure()`. The wizard still completes (`markComplete`). If the wizard adds no links, nothing is written and nothing changes.
4. **A city in a stale tab's memory (75).** After a successful heal `healClearedDesk` reads the stored location (`weatherLocationStore.getLocation()`); if the storage has none while the tab still holds one, the tab drops it exactly like the "city removed elsewhere" path of the retry (`weatherLocation = null`, `weatherResult` = the `no-location` result, `weatherGeneration` and `weatherRetryToken` incremented, retry state reset, timer cleared), so the hint tile stands in the first metric's cell as on a reload. A location still in storage (only the widget keys were lost) is left alone and the weather keeps showing.
5. **Low windows (L0-05 of run 30).** No code change; the Accepted exception is replaced by a scenario: in windows lower than about 270 px the healed layout after Add link equals a fresh install followed by an ordinary Add link in the same window (the link takes (0,0) and the block follows `placeMissing`'s collision rule, as it would on a fresh install).
6. **The second write of the heal after Add link (L0-07 of run 30).** The harness helper `failStorageSetAfter` gets `skip` (the first `skip` matching calls pass): with `key: "quietTabWidgetsMeta"` and `skip: 1` the add's own write passes and the heal's meta write is rejected. Expected: the failure state of run 30 (link drawn, no system tiles, persistent chip with Reload), a reload shows the link and the three default tiles.
7. **Run 30 expectations that change:** in `dg-68` and `dg-70` the status helper reads the first text node (the chip now may hold a button); AS-SFU-05's "still visible after 9 s" stays; the "reset" checks gain the info tone; the Accepted exceptions of `docs/stale-tab-recovery-followups.md` about Escape, the covered row and the low windows/second write are updated.

## Scope

- `src/newtab.js`: `showDesktopStatus` (tone), `showLayoutRestoreFailure` (button), the Escape layer and its flag, `healClearedDesk` (weather resync), `finishOnboardingWizard`; `src/desktopUiState.js`: `escapeLayer` layer `status`; `src/newtab.css`: `.desktop-status--info`, `.desktop-status__reload`. Tests: `test/desktopUiState.test.js` (the layer), `test/newtabSource.test.js` pins.
- `docs/stale-tab-closeout.md` (this spec → `implemented`), `docs/stale-tab-recovery-followups.md` and `docs/stale-tab-empty-state.md` (Accepted-exception updates), `docs/architecture.md`, `docs/design-system.md` (status chip tones), `CHANGELOG.md`; notes `agent-config/CLAUDE.md`, backlog 73–75 closed.
- E2E: new `dg-71-stale-tab-closeout.mjs`; harness `failStorageSetAfter(..., { skip })`; `dg-68`/`dg-70` adjusted (decision 7); `dg-60` (wizard) and `dg-67` stay green.

## Non-goals

- Real screen reader speech and real sync between devices (checked by hand, outside the E2E); a city kept in the memory of a tab that is not healing.
- Moving the chip out of the overlay; new strings other than `Reload`; changing `ensureWidgetsLayout`.
- The onboarding wizard on the next reload after a wipe (it shows again; its flag lives in the cleared local storage).

## Accepted exceptions

- The chip is still an overlay: in a very low or crowded window it can cover tiles until it is dismissed (Escape or Reload) — existing overlay behaviour (`docs/vertically-centered-defaults.md`).
- After a failed heal following an action whose own write succeeded, the caller's own announcement may still be spoken (run 30).
- The wizard's heal runs only when the wizard adds links; a wizard that adds none writes nothing.

## Acceptance scenarios

Common Given (as `docs/stale-tab-recovery-followups.md`): tabs A and B on the same profile, no city unless stated; B opened at 1280×800 on a desk with links f0, f1, f2 and the default tiles; A cleared `chrome.storage.sync` and `chrome.storage.local` (`clearAll`); B in edit mode and stale. "Failed heal" = `failStorageSetAfter(B, { area: "sync", key: "quietTabWidget:chrome:add" })` set after B's load and Save on f0.

### AS-STC-01 The failure chip can be dismissed and acted on (74)
- Given: common Given and a failed heal.
- When: (a) press Escape; (b) in a fresh run press Tab from `#favorites` and Enter; (c) in a fresh run click the button.
- Then: the chip reads `Couldn't restore your layout. Reload this tab.` followed by a button named `Reload`. (a) the chip is hidden, `#desktop-live` stays empty, focus stays on `#favorites`, the page did not reload. (b) the button is the next tab stop after `#favorites` and Enter reloads the tab: three default tiles, the chip gone. (c) the same by click.
- Verified by: E2E `dg-71` group 1.

### AS-STC-02 The reset message is neutral, errors stay red (74)
- Given: common Given, a successful heal (Save on f0); and a failed heal in a second run.
- When: read `#desktop-status` styles.
- Then: reset: text color equals the page text color, border color equals `--border-control`, contrast text on panel ≥ 4.5:1 in light and dark themes, `role="alert"`, hidden after 8 s; failed heal and an ordinary error (the gone-link text `This link was deleted in another tab.`) keep the danger color.
- Verified by: E2E `dg-71` group 2.

### AS-STC-03 The wizard heals and keeps the starter links (73)
- Given: the first-run wizard open on step 2 in B (as `dg-60`), starter links checked; A clears the storage.
- When: Finish.
- Then: the wizard closes; B shows the fresh-install system tiles and exactly the checked starter links; sync holds the starter links and the seven system keys; the reset message in the neutral tone; no page error. With a failing `quietTabWidget:chrome:add` write the starter links are drawn alone, the persistent failure chip with Reload shows, edit mode is off, focus on `#favorites`, a reload shows the links and the three tiles. A wizard with no checked starter writes no widget key.
- Verified by: E2E `dg-71` group 3.

### AS-STC-04 A city in the stale tab's memory (75)
- Given: common Given with a city and a fresh weather cache seeded before B opened (metrics drawn in B), then A clears both areas.
- When: Save on f0 in B (a successful heal).
- Then: B shows the hint tile in the first metric's cell, Settings and Add (the fresh-install tiles, equal to a reload of B); no weather metric text; after the heal no weather request is made for the dropped city. Variant: only the widget keys were deleted (the location stays in sync): the heal keeps the city and the metrics.
- Verified by: E2E `dg-71` group 4.

### AS-STC-05 Low windows (run 30 L0-05)
- Given: common Given with B at 1280×250, 1280×200 and 1280×120.
- When: Add link into the cleared storage.
- Then: the tiles equal a fresh install at that size followed by an ordinary Add link in the same window (cells compared per tile id); one alert; no horizontal scroll.
- Verified by: E2E `dg-71` group 5.

### AS-STC-06 The heal's second write rejected after Add link (run 30 L0-07)
- Given: common Given and `failStorageSetAfter(B, { area: "sync", key: "quietTabWidgetsMeta", skip: 1 })`.
- When: Add link.
- Then: the add's own write passes, the heal's meta write is rejected: the persistent failure chip with Reload, edit mode off, focus on `#favorites`, the new link drawn and no system tile, no page error; after a reload the link and the three default tiles.
- Verified by: E2E `dg-71` group 6.

### AS-STC-07 Unchanged behaviour
- Then: `dg-70`, `dg-68`, `dg-67`, `dg-60` stay green with the adjusted helpers; an ordinary error (gone link, no heal) is red and disappears after 8 s; the retry/ensure persistent messages keep their tone and are not dismissed by Escape (only the layout-failure chip is).
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
