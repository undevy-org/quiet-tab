# Stale-tab recovery after the storage was cleared: restore the system tiles

## Status

`draft` — closes backlog 68 (found by the final design review of run 28) and 69 (verifier nits of run 28). Follow-up to `docs/stale-link-and-host-contrast.md` (`implemented`). **Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`); storage shape unchanged.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-12 | Backlog 68: the extension storage is cleared in another tab; the stale tab's Save on a link recovers with an empty grid and focus on `body`. Decision: **re-read the state through `ensureWidgetsLayout`, so Settings and Add come back at once.** | `confirmed` | Owner answer. |
| 2026-10-12 | Backlog 69 (verifier nits of run 28) goes into the same run. | `confirmed` | Owner answer. |

## Current behaviour (`main` after run 28)

- `recoverFromGoneLink` (`src/newtab.js`, called from `runDesktopMutation` on a `LinkGoneError`) re-reads the state with `widgetsService.getState()` and applies it. When another tab cleared `chrome.storage.sync` (`quietTabWidgetsMeta` and all `quietTabWidget:*` keys), the fresh state is empty: no Settings, no Add, no weather tiles. The grid stays empty, focus falls to `body` (the neighbour list ends with `chrome:settings`, which does not exist), edit mode stays on; only a reload heals it (`ensureWidgetsLayout` runs at boot, `src/newtab.js` bootstrap step 4).
- `ensureWidgetsLayout(sync, { screen })` (`src/widgetsStore.js:687`) appends every missing metric and chrome tile as one centered block (`placeMissing`; with a valid `screen` the block is centered in the first screen; idempotent; nothing for `newer`/`invalid`/`v1`/`v2` meta). `firstScreen()` (`src/newtab.js`) is documented as read once at boot.
- Backlog 69: the comment of `runDesktopMutation` sits above `recoverFromGoneLink` (`src/newtab.js`) and the function itself has no description; `docs/stale-link-and-host-contrast.md` AS-SLH-06 still says "`delayStorageInit`-style wrapper" (implemented as `failStorageGetAfter(page, { key, skip: 2, ms })`); `agent-config/CLAUDE.md` does not mention `LinkGoneError` (`docs/architecture.md` does).

## Default decisions (owner can override)

1. **Heal only when the system tiles are gone.** In `recoverFromGoneLink`, after the busy-held re-read (step (c) of `docs/stale-link-and-host-contrast.md` decision 2), if the fresh state has **no** `chrome:settings` item, the recovery calls `ensureWidgetsLayout(syncStorageArea, { screen: firstScreen() })` once. Only when it reports `changed: true` does it re-read with `widgetsService.getState()` (a `changed: false` result, e.g. a `newer` or `invalid` meta, writes and re-reads nothing and the recovery goes on with the empty fresh state). A fresh state that still has Settings (the usual case: one link gone, the desk intact, or another tab already healed the storage) is not touched and nothing is written (AS-SLH-01 of the previous run stays as it is).
2. **Screen at heal time.** `firstScreen()` is read at the moment of the heal (an intentional exception to "read once at boot", `docs/vertically-centered-defaults.md` decision 2: after a wipe the desk is a fresh install). The result equals the layout of a fresh install in the same window, not the layout the tab had when it opened (AS-STE-07). Documented as a new entry in that spec's "Accepted exceptions" plus one sentence in its decision 2.
3. **Failure.** If `ensureWidgetsLayout` or the second re-read throws, the recovery keeps what it has (the empty fresh state or the old state), still closes the dialog and shows the message; the grid then stays empty until a reload (the boot path heals it, also when only some of the keys were written). No page error. The recovery never throws out of `runDesktopMutation`. With no tile on the grid there is nothing to focus: focus is on `body` (accepted, see "Accepted exceptions").
4. **Focus after a heal.** After a successful heal (`changed: true`) focus goes to **Settings**, forced: the recovery uses `[SETTINGS_TILE_ID]` as the focus target instead of the neighbour list read from the old DOM (that list would find a freshly created tile such as Add first). Without a heal the neighbour list stays as in the previous run. Edit mode stays on (`data-edit="true"`).
5. **Entry points.** Same three as the previous run: Edit link Save, Delete confirm, a drop. The heal is part of the shared recovery, no per-entry code.
6. **Storage written by the heal.** `ensureWidgetsLayout` is not changed. It writes in **two** `set()` calls on `chrome.storage.sync`: the six item keys (`quietTabWidget:weather:temperature|precipitation|airQuality|uv`, `quietTabWidget:chrome:settings`, `quietTabWidget:chrome:add`), then `quietTabWidgetsMeta`. After the heal sync holds exactly those seven keys (`meta.order` = the six system ids in that order, version 3) and `chrome.storage.local` is empty.
7. **Weather after a heal.** The scenarios have no city set, so the grid shows the hint tile (`weather:hint`) in the first metric's cell, Settings and Add (three tiles), equal to a fresh install. A city kept in the memory of the stale tab while the storage was wiped is not covered (Non-goals).
8. **Backlog 69 items.** (a) Describe `recoverFromGoneLink` where it is defined and keep the original comment above `runDesktopMutation`; (b) fix the phrase in `docs/stale-link-and-host-contrast.md` AS-SLH-06; (c) mention `LinkGoneError` and the recovery in `agent-config/CLAUDE.md` (concurrency section). No behaviour change.

## Scope

- `src/newtab.js`: `recoverFromGoneLink` (heal step, forced focus on Settings, comments) and the comment of `firstScreen()` (now also read at a heal).
- `test/newtabSource.test.js`: the pin that counts `firstScreen(` occurrences (now 3: definition, boot, recovery) and pins for the heal call (only inside `recoverFromGoneLink`, guarded by the missing Settings, `changed` check).
- `docs/stale-tab-empty-state.md` (this spec → `implemented`), `docs/stale-link-and-host-contrast.md` (AS-SLH-06 wording), `docs/architecture.md` (one sentence in the concurrency paragraph), `docs/vertically-centered-defaults.md` ("Accepted exceptions" entry, decision 2 sentence), `CHANGELOG.md`.
- Notes: `agent-config/CLAUDE.md` (concurrency), backlog 68–69 closed.
- E2E: new `dg-68-stale-tab-empty-state.mjs` with a new harness helper `failStorageSetAfter(page, { area, key })` (wraps `chrome.storage.<area>.set` in the page to reject when the written object has `key`; a reload drops it, unlike `failStorageInit`); `dg-67` stays green.

## Process

Full UI pipeline (`quiet-tab-pipeline`): spec review and gate → plan (given) → E2E-first → final code review → final design gate → independent verification → checkpoint. Run №29, E2E `dg-68` (`dg-66`, `dg-67` are taken, `dg-65` is run 25's, part 3 will take `dg-69`).

## Non-goals

- Healing in any other situation (a missing Settings tile without a wipe, hidden metrics, a stale tab that is not recovering from a gone link).
- Cross-tab live sync; changing the message text (it names one link although everything is gone: owner decision, text unchanged); changing `ensureWidgetsLayout` itself.
- A reset action in the UI.
- Weather content after the wipe (a city or a cache kept in the memory of the stale tab), and the onboarding wizard on the next reload (its flag lives in `chrome.storage.local`, which the wipe also clears; the E2E harness presets it).

## Accepted exceptions

- If the heal fails the grid stays empty until a reload and focus is on `body` (no tile exists to take it); edit mode stays on and Escape leaves it (decision 3).
- If the heal's first `set()` succeeds and the second (meta) is rejected, six item keys stay without a meta; the reload completes them (`ensureWidgetsLayout` on a missing meta).
- Healing writes to storage (the system keys, once) in a recovery that otherwise writes nothing; this is the point of the decision.
- The heal keeps the busy lock a little longer than the plain recovery (the lock wait plus two writes and a second read).

## Acceptance scenarios

Common Given for AS-STE-01…03, 05, 07…09: tabs A and B on the same profile, no city set; B was opened (at 1280×800 unless stated) while the desk showed links f0, f1, f2 and the default tiles; then A cleared `chrome.storage.sync` and `chrome.storage.local` of the extension (harness `clearAll`); B is in edit mode and stale.

### AS-STE-01 Save on a gone link after the storage was cleared
- When: in B open Edit link on f0 and press Save.
- Then: the dialog closes; B shows exactly three tiles, `weather:hint`, `chrome:settings`, `chrome:add`, in the cells a fresh install gets in the same window (equal to `desktopTiles` of a fresh profile at that size), no f0/f1/f2; `syncSetCalls(B)` holds exactly two calls: the six item keys, then `["quietTabWidgetsMeta"]`; sync holds exactly those seven keys, `meta.order` = the six system ids, `chrome.storage.local` is empty; `#desktop-status` reads `This link was deleted in another tab.`; focus is on Settings (not `body`, not Add); `data-edit="true"`; B is not busy (Add link opens); no page error.
- Verified by: E2E `dg-68` group 1.

### AS-STE-02 Delete on a gone link after the storage was cleared
- When: press the − of f0 and confirm Delete.
- Then: as AS-STE-01 (confirm closed, tiles, two `set()` calls, message, focus on Settings).
- Verified by: E2E `dg-68` group 2.

### AS-STE-03 Drop of a gone tile after the storage was cleared
- When: drag f0 to a free cell.
- Then: as AS-STE-01, and no `.is-settled`, `.is-dragging` or `.drop-highlight` leftovers.
- Verified by: E2E `dg-68` group 3.

### AS-STE-04 No heal when the desk is intact
- Given: A deletes f0 only (the desk keeps Settings); B stale. Variant: A cleared the storage and reloaded first (its boot healed the desk), then B acts.
- When: Save on f0 in B.
- Then: exactly as `docs/stale-link-and-host-contrast.md` AS-SLH-01: nothing written by B (`syncSetCalls` unchanged), focus on the neighbour of f0; in the variant B shows A's healed desk without f0.
- Verified by: E2E `dg-68` group 4 (and `dg-67` unchanged).

### AS-STE-05 The heal's write is rejected
- Given: common Given and `failStorageSetAfter(B, { area: "sync", key })` set after B's load; two variants: `key: "quietTabWidgetsMeta"` (second `set()` rejected) and `key: "quietTabWidget:chrome:add"` (first `set()` rejected).
- When: Save on f0 in B.
- Then: the dialog closes; `#desktop-status` shows the message; no page error; the grid has no tile; focus is on `body`; `data-edit="true"`; B is not busy (Escape sets `data-edit="false"`); sync holds six item keys without a meta (variant 1) or no keys (variant 2). After B reloads (the fault is gone with the page) the three default tiles are there and sync holds the seven keys.
- Verified by: E2E `dg-68` group 5.

### AS-STE-06 Backlog 69 items
- Then: `recoverFromGoneLink` has a description comment above it (pinned in `test/newtabSource.test.js`: the comment text sits directly above the function and the `runDesktopMutation` comment above that function); `docs/stale-link-and-host-contrast.md` AS-SLH-06 contains `failStorageGetAfter(page, { key, skip: 2, ms })` and no `delayStorageInit`; `agent-config/CLAUDE.md` contains `LinkGoneError`.
- Verified by: unit pin for the first, `grep` in the verification report for the other two.

### AS-STE-07 The window changed between load and heal
- Given: common Given at 1280×800; before Save B's window is resized to 900×500 (and a second run to 500×800).
- When: Save on f0 in B.
- Then: B's three tiles sit in the same cells as a fresh install loaded at that size, not the cells of the 1280×800 desk (decision 2).
- Verified by: E2E `dg-68` group 6.

### AS-STE-08 A slow heal
- Given: common Given and a response delayed by 1.5 s (longer than every action timer) but successful: `failStorageGetAfter`-style delay on the meta read of the heal's re-read, and a delayed `sync.set`.
- When: Save on f0 in B; during the wait press Save again and Escape.
- Then: the dialog stays until the heal ends (repeat Save and Escape do nothing); exactly two `set()` calls happen; afterwards as AS-STE-01; the message stays its full 8 s from the moment it is shown.
- Verified by: E2E `dg-68` group 7.

### AS-STE-09 The second read after the heal fails
- Given: common Given and `failStorageGetAfter(B, { key: "quietTabWidgetsMeta", skip: 3 })` (the heal adds meta reads: the count is measured in the first red run and recorded in the test).
- When: Save on f0 in B.
- Then: the heal wrote its two `set()` calls, the dialog closes, the message is shown, no page error, the grid stays empty, focus on `body`; after a reload the three tiles are there.
- Verified by: E2E `dg-68` group 8.

## Review focus

- The heal runs only when Settings is missing and `ensureWidgetsLayout` reports `changed`; an intact desk is never written.
- After a successful heal focus lands on Settings (forced), never on `body`; edit mode and the busy lock are right afterwards. After a failed heal `body` is accepted, nothing else breaks.
- The heal's layout equals a fresh install's layout for the window at heal time.
- A failing heal never throws out of the recovery; partial writes are completed by the next boot.

## Copy (user-visible)

- No new strings (`This link was deleted in another tab.` as before).
