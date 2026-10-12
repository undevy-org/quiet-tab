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

1. **One shared heal.** A helper in `newtab.js` takes a state and, if it has no `chrome:settings` item, calls `ensureWidgetsLayout(syncStorageArea, { screen: firstScreen() })` and **always** re-reads with `widgetsService.getState()` (also when `changed` is `false`: another tab may have healed in between). It returns `{ state, healed, failed }`: `state` is the re-read result when the re-read succeeded, otherwise the input state (so an added link is never lost); `healed` when the re-read state has Settings; `failed` when the input had no Settings and the final state still has none (a thrown call, a failed re-read, or a meta that cannot be written); neither when the input state is null (the first re-read failed: nothing to heal) or already had Settings. The condition is "no `chrome:settings`", so it also repairs a desk that lost Settings in a way other than a wipe (a partial sync): the system tiles come back, which is the intended result. `recoverFromGoneLink` uses it (decision 1 of run 29 otherwise unchanged).
2. **A missing weather metric is "gone".** `updateWeatherMetric` throws `LinkGoneError(id)` when no item at all has the id (an id of another kind of item stays `Weather tile not found`). Hide, Add-menu restore and Edit weather Save then take the recovery path of decision 1. The user's intent (hide, restore, resize) is dropped: after the heal the layout is a fresh one.
3. **Add link heals after its write.** In `runDesktopMutation`, after the action resolved, the returned state goes through the same helper: if it has no Settings (the storage was cleared in another tab and the add wrote into the empty storage), the heal runs, the healed state (which keeps the new link) is rendered and the dialog closes as after a normal add. The check applies to every mutation; in practice only Add link writes into an empty storage, but an ordinary write on a desk that lost only its Settings item (a partial sync) triggers the same heal and the reset message, which is the intended repair.
4. **Messages.** Constants in `newtab.js`: after a heal (`healed`, in the recovery and in decision 3) `Your layout was reset in another tab.`; a gone link without a heal keeps the service text `This link was deleted in another tab.` (also for a gone metric: accepted); a failed heal `Couldn't restore your layout. Reload this tab.` shown **persistently** (`showDesktopStatus(text, { persist: true })`, cleared by the next action or a reload). The message depends on what the stale tab sees: if the other tab had already healed before the stale tab's first read, the stale tab sees an intact desk and shows the single-link text (AS-STE-04); in the race of AS-SFU-06 it shows the reset text. Accepted.
5. **A failed heal (71).** In this order, before the one render of the state: leave edit mode with `desktopUi = exitEditMode(desktopUi)` plus `cancelDrag()`, `closeAddMenu()`, `hideTooltip()` (not `setEditMode(false)`: it announces "Layout editing off" and clears the status); `announce("")` so `#desktop-live` is empty (no stale "Editing layout. Activate Settings to finish."); the dialog, if one is open, is closed first **without** restoring focus (`closeDesktopDialog({ restoreFocusTo: null })`, because `#favorites` is `inert` while a dialog is open and the opener tile would not exist); then focus goes to `#favorites` (`tabindex="-1"` set at that moment, `focus({ preventScroll: true })`, no ring: `.desktop[tabindex="-1"]:focus { outline: none }`), never `body`; then the persistent message. For Add link the post-action path returns `true` (the link is stored), the caller's `closeDesktopDialog()` then finds no opener and does not touch focus; the Add link submit handler (`newtab.js`, case `add-link`) speaks `announce("Link added")` only when the resulting `widgetsState` has a Settings item, so after a failed heal `#desktop-live` stays empty. The grid shows whatever the final state holds.
6. **Focus after a successful heal.** Settings, as in run 29, for every entry point except two where the caller moves focus itself: **Add link** (the dialog closes and focus returns to its opener, the Add tile, which exists after the heal) and **Add-menu restore** (`restoreWeatherMetric` focuses `chrome:add` on a failed mutation; the tile exists after the heal). Edit mode stays on after a successful heal.
7. **Entry points (seven).** Save, Delete, drop of a link (run 29), Hide, Add-menu restore, Edit weather Save, Add link. No per-entry heal code beyond decisions 2 and 3.
8. **Run 29 expectations change** in `dg-68`: AS-STE-01..03, 07, 08: the status text is `Your layout was reset in another tab.`; AS-STE-05 and AS-STE-09: the persistent failure message, edit mode off, focus on `#favorites`, `#desktop-live` empty (they were `This link was deleted in another tab.`, edit mode on, focus `body`; the "not busy via Escape" probe is replaced by the checks of AS-SFU-05). `docs/stale-tab-empty-state.md` Accepted exceptions are updated accordingly.

## Scope

- `src/widgetsService.js`: `updateWeatherMetric` throws `LinkGoneError` for an id nobody has. `test/widgetsService.test.js` (the existing `Weather tile not found` case becomes a gone case; a wrong-kind id keeps the old error).
- `.private/e2e/lib/harness.mjs`: `failStorageGetAfter(..., { late: true })` (the original `get` is called at once, its result is returned after `ms`), used by AS-SFU-06.
- `src/newtab.js`: the shared heal helper, the Add link submit handler (conditional `announce`), `recoverFromGoneLink`, `runDesktopMutation` (post-action check), the message constants, focus of `#favorites`, leaving edit mode; `src/newtab.css`: the `.desktop[tabindex="-1"]:focus` rule. `test/newtabSource.test.js` pins.
- `docs/stale-tab-recovery-followups.md` (this spec → `implemented`), `docs/stale-tab-empty-state.md` (decision/Accepted-exception updates), `docs/architecture.md`, `CHANGELOG.md`; notes `agent-config/CLAUDE.md`, backlog 70–72 closed.
- E2E: new `dg-70-stale-tab-recovery-followups.mjs`; `dg-68` adjusted (decision 8), `dg-67` unchanged and green.

## Non-goals

- Cross-tab live sync; healing in any situation other than a cleared storage seen by a mutation; changing `ensureWidgetsLayout`; the Edit-link dialog text of the single-link case.
- Weather content after the wipe (a city or cache kept in the stale tab's memory) and the onboarding wizard on the next reload.
- A reset action in the UI; automatic reload.

## Accepted exceptions

- After a heal the user's hide/restore/resize intent is dropped; an added link is kept (decisions 2, 3).
- The message text depends on timing (decision 4): the same real situation shows the single-link text when the other tab healed first and the reset text in the race.
- `#favorites` has no visible focus ring when focused programmatically after a failed heal (decision 5): it is a container, the persistent alert carries the information.
- The persistent failure message stays until a reload or the next action; on an empty desk there is none, so it stays.
- The heal still keeps the busy lock longer than a plain recovery (lock wait, two writes, one or two reads).

## Acceptance scenarios

Common Given (as `docs/stale-tab-empty-state.md`): tabs A and B on the same profile, no city; B opened at 1280×800 on a desk with links f0, f1, f2 and the default tiles (metrics enabled unless stated); A then cleared `chrome.storage.sync` and `chrome.storage.local` (`clearAll`); B in edit mode and stale. Without a city a metric is drawn as the hint tile (`weather:hint`) in the first metric's cell; its − badge is `[data-remove-for="weather:temperature"]` and its tap opens `edit-weather`. "Healed" = B shows exactly the fresh-install tiles of its window (`weather:hint`, `chrome:settings`, `chrome:add`, equal to a fresh profile at that size, plus the new link where stated), `syncSetCalls(B)` holds the heal's two `set()` calls (the six item keys, then `quietTabWidgetsMeta`) after any write of the action itself, no page error.

### AS-SFU-01 Hide a weather tile after the storage was cleared
- When: press the − of the hint tile (Hide Temperature) and confirm Hide.
- Then: the confirm closes; healed; `#desktop-status` reads `Your layout was reset in another tab.`; focus on Settings; edit mode on; B not busy (Add link opens). The intent is dropped: `quietTabWidget:weather:temperature` in sync has `enabled: true`.
- Verified by: E2E `dg-70` group 1.

### AS-SFU-02 Restore a hidden weather tile after the storage was cleared
- Given: common Given, with `quietTabWidget:weather:precipitation` seeded `enabled: false` before the wipe (the Add menu has "Add weather tile…").
- When: Add → Add weather tile… → Precipitation.
- Then: healed (the fresh layout; `quietTabWidget:weather:precipitation` has `enabled: true`); the message of AS-SFU-01; focus on Add (decision 6); edit mode on; B not busy.
- Verified by: E2E `dg-70` group 2.

### AS-SFU-03 Edit weather Save after the storage was cleared
- When: tap the hint tile, change the size (Save is enabled only when the size changed) and press Save.
- Then: the dialog closes; healed; the message of AS-SFU-01; focus on Settings; B not busy.
- Verified by: E2E `dg-70` group 3.

### AS-SFU-04 Add link after the storage was cleared
- When: in B press Add, fill a valid URL and label, Save.
- Then: the dialog closes; healed **and** the new link is drawn and stored (`quietTabWidget:<new id>` in sync); `syncSetCalls(B)` = `[["quietTabWidgetsMeta", "quietTabWidget:<new id>"], <six item keys>, ["quietTabWidgetsMeta"]]`; the message of AS-SFU-01; focus on Add (the opener); edit mode on; B not busy. The link's cell is free of the system tiles (no overlap).
- Verified by: E2E `dg-70` group 4.

### AS-SFU-05 A failed heal (71)
- Given: common Given and `failStorageSetAfter(B, { area: "sync", key })` (rejecting) after B's load. Runs: Save on f0 with `key: "quietTabWidgetsMeta"` and with `key: "quietTabWidget:chrome:add"`; Hide with the same two; Delete, drop, Add-menu restore and Edit weather Save with `quietTabWidget:chrome:add` (for restore the failure path tries to focus the missing Add tile and so leaves focus on `#favorites`); Add link with `quietTabWidget:chrome:add` only (the meta key is part of the add's own write and would fail the add itself with an ordinary dialog error).
- When: the action.
- Then: the dialog closes; no page error; no system tile (for Add link the new link is drawn); `#desktop-status` reads `Couldn't restore your layout. Reload this tab.` and is **still visible after 9 s**; edit mode is off (`data-edit="false"`, no jiggle, no − badges); `#desktop-live` is empty; focus is on `#favorites` (not `body`); no `.is-settled`, `.is-dragging` or `.drop-highlight` left after the drop; after a reload (the fault is gone with the page) the three default tiles are there (plus the new link for Add).
- Verified by: E2E `dg-70` group 5; `dg-68` groups 5 and 8 adjusted (decision 8).

### AS-SFU-06 The race: another tab healed between B's first read and its heal (70)
- Given: common Given; B has the late-answer wrapper `failStorageGetAfter(B, { key: "quietTabWidgetsMeta", skip: 2, ms: 3000, late: true })`: from the third read of the meta key on, each read reads storage at once and answers after 3 s: the third is the recovery's re-read (outside the mutation lock), which sees the storage as it was after the wipe; the later ones (inside `ensureWidgetsLayout`, the re-read after it) answer late too, so the scenario takes about 9 s.
- When: Save on f0 in B; once `storageGetSeen(B) >= 3`, A reloads (its boot heals the storage) and finishes.
- Then: B's heal finds the storage already healed and writes nothing (`syncSetCalls(B)` empty); `storageGetSeen(B)` = 5; B shows A's healed tiles (the fresh-install tiles of A's window); the message is `Your layout was reset in another tab.`; focus on Settings; edit mode on; B not busy.
- Verified by: E2E `dg-70` group 6.

### AS-SFU-07 A slow heal after Add link
- Given: as AS-SFU-04 with `failStorageSetAfter(B, { area: "sync", key: "quietTabWidgetsMeta", ms: 1500 })` (the add's meta write and the heal's meta write are both answered after 1.5 s).
- When: Save in the Add link dialog; during the wait press Save again and Escape.
- Then: the dialog stays open until the heal ends; exactly one link is added (no second add); afterwards as AS-SFU-04.
- Verified by: E2E `dg-70` group 7.

### AS-SFU-08 No heal when the desk is intact
- Given: intact desk (A did not clear anything), B stale only about a link f0 that A deleted; and a separate case: Hide on an intact desk.
- When: Save on f0 in B; Hide a metric on the intact desk.
- Then: Save: as AS-SLH-01 (text `This link was deleted in another tab.`, nothing written, focus on the neighbour); Hide: as before the run (the metric hidden, no message, one write).
- Verified by: E2E `dg-70` group 8; `dg-07-hide-weather.mjs`, `dg-30-add-menu.mjs` and `dg-67` unchanged and green.

### AS-SFU-09 Unit and source pins
- Then: `updateWeatherMetric` with an unknown id rejects with a `LinkGoneError` (code `link-gone`, `id` set); with the id of a favorite it rejects with `Weather tile not found`; `newtabSource.test.js` pins the shared helper (one `firstScreen(` call, the re-read independent of `changed`), the three messages, `persist: true`, `exitEditMode`, `announce("")`, the dialog closed before the `#favorites` focus, the post-action check in `runDesktopMutation`, and the CSS rule.
- Verified by: unit tests.

### AS-SFU-10 Narrow and low windows
- Given: common Given with B at 500×800, 320×600 and 1280×400 (the stale tab's window is the heal's window).
- When: Save on f0 (healed case) and Save on f0 with a rejected `quietTabWidget:chrome:add` (failed case).
- Then: healed: the tiles equal a fresh install at that size; failed: the persistent message lies inside the window (its rect within the viewport, no horizontal scroll); in both, `#desktop-status` is the only alert.
- Verified by: E2E `dg-70` group 9.

## Review focus

- Every entry point of the seven heals exactly once and never writes on an intact desk; the new link of Add is never lost.
- A failed heal leaves a usable explanation (persistent message, focus on the desk, edit mode off) and no stale "Activate Settings" announcement.
- The race path writes nothing and shows the other tab's desk.
- Run 29 behaviour (two `set()` calls, fresh-install cells, 5 meta reads on the Save path, 6 on the Add path) is unchanged apart from the text and the failure state.

## Copy (user-visible)

| String | Where |
|--------|-------|
| `Your layout was reset in another tab.` | `#desktop-status` (alert, 8 s) after a successful heal |
| `Couldn't restore your layout. Reload this tab.` | `#desktop-status` (alert, persistent) after a failed heal |
| `This link was deleted in another tab.` | unchanged, a gone link without a heal |
