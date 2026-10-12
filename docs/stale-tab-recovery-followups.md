# Stale-tab recovery follow-ups: other entry points, the race and a failed heal

## Status

`draft` — closes backlog 70, 71 and 72 (found by the spec gate and the final design review of run 29). Follow-up to `docs/stale-tab-empty-state.md` (`implemented`). **Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`); storage shape unchanged.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-12 | "Да, пожалуйста, закрой их все" (backlog 70, 71, 72 of run 29). | `confirmed` | Owner chat after run 29. |
| 2026-10-12 | A failed heal (71): **a hint plus focus**: a message that says to reload, focus on the desk, not on `body`. | `confirmed` | Owner answer. |
| 2026-10-12 | The message after a successful heal following a full wipe: **its own text**, not "This link was deleted in another tab."; the single-link text stays for a single gone link. | `confirmed` | Owner answer. |

## Current behaviour (`main` after run 29)

- `recoverFromGoneLink` (`src/newtab.js`) heals a cleared storage (no `chrome:settings` in the fresh state) with `ensureWidgetsLayout` and re-reads **only when it reports `changed: true`** (backlog 70: when another tab healed in between, it reports `changed: false` and the stale tab keeps an empty grid); it then shows `This link was deleted in another tab.` in both cases.
- A failed heal leaves the grid empty, focus on `body`, edit mode on, the same 8 s message, and `#desktop-live` still says "Editing layout. Activate Settings to finish." (backlog 71).
- Only the entry points that throw `LinkGoneError` heal: Save, Delete, drop of a link. `updateWeatherMetric` (Hide, Add-menu restore, Edit weather Save) throws `Error("Weather tile not found")` for a missing metric id (`src/widgetsService.js:395`), so no recovery runs; and Add link (`addFavorite`) simply writes the new link into the empty storage, leaving a desk with one link and no Settings, Add or weather tiles (backlog 72).

## Default decisions (owner can override)

1. **One shared heal.** A helper in `newtab.js` takes a state and, if it has no `chrome:settings` item, calls `ensureWidgetsLayout(syncStorageArea, { screen: firstScreen() })` and **always** re-reads with `widgetsService.getState()` (also when `changed` is `false`: another tab may have healed in between). It returns `{ state, healed, failed }`: `healed` when the re-read state has Settings; `failed` when the state still has no Settings after the attempt (a thrown call, a failed re-read or a meta that cannot be written); neither when the input state is null (the first re-read failed: nothing to heal) or already had Settings. `recoverFromGoneLink` uses it (decision 1 of run 29 otherwise unchanged: heal only without Settings).
2. **A missing weather metric is "gone".** `updateWeatherMetric` throws `LinkGoneError(id)` when no item at all has the id (an id of another kind of item stays `Weather tile not found`). Hide, Add-menu restore and Edit weather Save then take the recovery path of decision 1. The user's intent (hide, restore, resize) is dropped: after the heal the desk is a fresh one.
3. **Add link heals after its write.** In `runDesktopMutation`, after the action resolved, the returned state is checked with the same helper: if it has no Settings (the storage was cleared in another tab, the add wrote into the empty storage), the heal runs, the healed state (which keeps the new link) is rendered and the dialog closes as after a normal add. This check applies to every mutation (a state without Settings never exists on a healthy desk), but only Add link can reach it.
4. **Messages.** Constants in `newtab.js`: after a heal (`healed`, in the recovery and in decision 3) `Your desk was reset in another tab.`; a gone link/metric without a heal keeps `This link was deleted in another tab.` (service text); a failed heal `Couldn't restore your desk. Reload this tab.` — shown **persistently** (`showDesktopStatus(text, { persist: true })`, cleared by the next action or a reload), because an empty desk offers no next action.
5. **A failed heal (71).** The tab leaves edit mode (there is no Settings to leave it with, and `#desktop-live` must not say "Activate Settings to finish"; no "Layout editing off" announcement either: the alert status speaks once), and focus goes to `#favorites` (the desk container, `tabindex="-1"` set at that moment, `preventScroll`, no focus ring: `.desktop[tabindex="-1"]:focus { outline: none }`), never `body`. For a failed heal after Add link the new link is in storage but not drawn with system tiles: the same message, same focus, the grid shows whatever the state holds.
6. **Focus after a successful heal.** Settings, as in run 29, for every entry point except two where the caller moves focus itself: **Add link** (the dialog closes and focus returns to its opener, the Add tile, which exists after the heal) and **Add-menu restore** (`restoreWeatherMetric` focuses `chrome:add` on a failed mutation; the tile exists after the heal). Edit mode stays on after a successful heal.
7. **Entry points.** Save, Delete, drop of a link (run 29), Hide, Add-menu restore, Edit weather Save, Add link. No per-entry heal code beyond decisions 2 and 3.
8. **Run 29 expectations change** in `dg-68`: AS-STE-01..03, 07, 08: the status text is `Your desk was reset in another tab.`; AS-STE-05 and AS-STE-09: the persistent failure message, edit mode off, focus on `#favorites` (they were message `This link was deleted in another tab.`, edit mode on, focus `body`). `docs/stale-tab-empty-state.md` Accepted exceptions are updated accordingly.

## Scope

- `src/widgetsService.js`: `updateWeatherMetric` throws `LinkGoneError` for an id nobody has. `test/widgetsService.test.js` (the existing `Weather tile not found` case becomes a gone case; a wrong-kind id keeps the old error).
- `src/newtab.js`: the shared heal helper, `recoverFromGoneLink`, `runDesktopMutation` (post-action check), the message constants, focus of `#favorites`, leaving edit mode; `src/newtab.css`: the `.desktop[tabindex="-1"]:focus` rule. `test/newtabSource.test.js` pins.
- `docs/stale-tab-recovery-followups.md` (this spec → `implemented`), `docs/stale-tab-empty-state.md` (decision/Accepted-exception updates), `docs/architecture.md`, `CHANGELOG.md`; notes `agent-config/CLAUDE.md`, backlog 70–72 closed.
- E2E: new `dg-70-stale-tab-recovery-followups.mjs`; `dg-68` adjusted (decision 8), `dg-67` unchanged and green.

## Non-goals

- Cross-tab live sync; healing in any situation other than a cleared storage seen by a mutation; changing `ensureWidgetsLayout`; the Edit-link dialog text of the single-link case.
- Weather content after the wipe (a city or cache kept in the stale tab's memory) and the onboarding wizard on the next reload.
- A reset action in the UI; automatic reload.

## Accepted exceptions

- After a heal the user's hide/restore/resize/add-dialog intent is dropped except that an added link is kept (decision 2, 3).
- `#favorites` has no visible focus ring when focused programmatically after a failed heal (decision 5): it is a container, the persistent alert carries the information.
- The persistent failure message stays until a reload or the next action; on an empty desk there is none, so it stays.
- The heal still keeps the busy lock longer than a plain recovery (lock wait, two writes, one or two reads).

## Acceptance scenarios

Common Given (as `docs/stale-tab-empty-state.md`): tabs A and B on the same profile, no city; B opened at 1280×800 on a desk with links f0, f1, f2 and the default tiles (metrics enabled unless stated); A then cleared `chrome.storage.sync` and `chrome.storage.local` (`clearAll`); B in edit mode and stale. "Healed" = B shows exactly the fresh-install tiles of its window (`weather:hint`, `chrome:settings`, `chrome:add`, equal to a fresh profile at that size, plus the new link where stated), `syncSetCalls(B)` holds the heal's two `set()` calls (the six item keys, then `quietTabWidgetsMeta`), no page error.

### AS-SFU-01 Hide a weather tile after the storage was cleared
- Given: common Given, B shows the temperature tile.
- When: press the − of the temperature tile and confirm Hide.
- Then: the confirm closes; healed; `#desktop-status` reads `Your desk was reset in another tab.`; focus on Settings; edit mode on; B not busy (Add link opens). The metric is not hidden (the intent is dropped; with no city the hint stands in its cell).
- Verified by: E2E `dg-70` group 1.

### AS-SFU-02 Restore a hidden weather tile after the storage was cleared
- Given: common Given with the precipitation tile hidden in B before the wipe (Add menu has "Add weather tile…").
- When: Add → Add weather tile… → Precipitation.
- Then: healed (the fresh desk, precipitation enabled as in a fresh install); the message of AS-SFU-01; focus on Add (decision 6); edit mode on; B not busy.
- Verified by: E2E `dg-70` group 2.

### AS-SFU-03 Edit weather Save after the storage was cleared
- Given: common Given; with no city the temperature metric is drawn as the hint tile (`weather:hint`), which opens `edit-weather` on a tap in edit mode.
- When: tap the hint tile, change the size (Save is enabled only when the size changed) and press Save.
- Then: the dialog closes; healed; the message of AS-SFU-01; focus on Settings; B not busy.
- Verified by: E2E `dg-70` group 3.

### AS-SFU-04 Add link after the storage was cleared
- When: in B press Add, fill a valid URL and label, Save.
- Then: the dialog closes; healed **and** the new link is drawn and stored (`quietTabWidget:<new id>` in sync); `syncSetCalls(B)` = the add's own write(s) then the heal's two calls; the message of AS-SFU-01; focus on Add (the opener); edit mode on; B not busy.
- Verified by: E2E `dg-70` group 4.

### AS-SFU-05 A failed heal (71)
- Given: common Given and `failStorageSetAfter(B, { area: "sync", key })` (rejecting) after B's load; variants `key: "quietTabWidgetsMeta"` and `key: "quietTabWidget:chrome:add"`; entry Save on f0 (and a second run with the entry Hide).
- When: the action.
- Then: the dialog closes; no page error; the grid has no tile; `#desktop-status` reads `Couldn't restore your desk. Reload this tab.` and is **still visible after 10 s**; edit mode is off (`data-edit="false"`); `#desktop-live` does not contain "Activate Settings"; focus is on `#favorites` (not `body`); after a reload (the fault is gone with the page) the three default tiles are there.
- Verified by: E2E `dg-70` group 5; `dg-68` groups 5 and 8 adjusted (decision 8).

### AS-SFU-06 The race: another tab healed in between (70)
- Given: common Given and `failStorageGetAfter(B, { key: "quietTabWidgetsMeta", skip: 3, ms: 3000 })` (the heal's own meta read and the re-read answer after 3 s).
- When: Save on f0 in B; within the delay A reloads (its boot heals the storage) and finishes.
- Then: B's heal reports `changed: false`, the re-read returns A's healed state; B shows it (the fresh-install tiles of A's window), B wrote nothing (`syncSetCalls(B)` empty); the message is `Your desk was reset in another tab.`; focus on Settings; edit mode on; B not busy.
- Verified by: E2E `dg-70` group 6.

### AS-SFU-07 A slow heal after Add link
- Given: as AS-SFU-04 with `failStorageSetAfter(B, { area: "sync", key: "quietTabWidgetsMeta", ms: 1500 })` (the add's meta write and the heal's meta write both delayed).
- When: Save in the Add link dialog; during the wait press Save again and Escape.
- Then: the dialog stays open until the heal ends; exactly one link is added (no second add); afterwards as AS-SFU-04.
- Verified by: E2E `dg-70` group 7.

### AS-SFU-08 No heal when the desk is intact
- Given: intact desk (A did not clear anything), B stale only about a link f0 that A deleted; and a separate case: Hide on an intact desk.
- When: Save on f0 in B; Hide a metric on the intact desk.
- Then: Save: as AS-SLH-01 (text `This link was deleted in another tab.`, nothing written, focus on the neighbour); Hide: as before the run (the metric hidden, no message, one write).
- Verified by: E2E `dg-70` group 8; `dg-67` and the Hide scenarios in `dg-30`-style suites unchanged.

### AS-SFU-09 Unit and source pins
- Then: `updateWeatherMetric` with an unknown id rejects with a `LinkGoneError` (code `link-gone`, `id` set); with the id of a favorite it rejects with `Weather tile not found`; `newtabSource.test.js` pins the shared helper, the `changed`-independent re-read, the three messages, `persist: true`, `exitEditMode` and the `#favorites` focus on failure, and the post-action check in `runDesktopMutation`.
- Verified by: unit tests.

## Review focus

- Every entry point of the eight heals exactly once and never writes on an intact desk; the new link of Add is never lost.
- A failed heal leaves a usable explanation (persistent message, focus on the desk, edit mode off) and no stale "Activate Settings" announcement.
- The race path writes nothing and shows the other tab's desk.
- Run 29 behaviour (two `set()` calls, fresh-install cells, 5 meta reads) is unchanged apart from the text and the failure state.

## Copy (user-visible)

| String | Where |
|--------|-------|
| `Your desk was reset in another tab.` | `#desktop-status` (alert, 8 s) after a successful heal |
| `Couldn't restore your desk. Reload this tab.` | `#desktop-status` (alert, persistent) after a failed heal |
| `This link was deleted in another tab.` | unchanged, a gone link without a heal |
