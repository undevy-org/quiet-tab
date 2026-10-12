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

1. **Heal only when the system tiles are gone.** In `recoverFromGoneLink`, after the busy-held re-read (step (c) of `docs/stale-link-and-host-contrast.md` decision 2), if the fresh state has **no** `chrome:settings` item, the recovery calls `ensureWidgetsLayout(syncStorageArea, { screen: firstScreen() })` once and re-reads with `widgetsService.getState()`. A fresh state that still has Settings (the usual case: one link gone, the desk intact) is not touched and nothing is written (AS-SLH-01 of the previous run stays as it is).
2. **Screen at heal time.** `firstScreen()` is read at the moment of the heal (an intentional exception to "read once at boot", `docs/vertically-centered-defaults.md` decision 2: after a wipe the desk is a fresh install; documented in that spec's decision 6/9 exception list in this run's docs task). The result equals what a reload of the same window would give.
3. **Failure.** If `ensureWidgetsLayout` or the second re-read throws, the recovery keeps what it has (the empty fresh state or the old state), still closes the dialog and shows the message; the grid then stays empty until a reload (the boot path heals it). No page error. The recovery still never throws out of `runDesktopMutation`.
4. **Focus and edit mode.** After the heal the neighbour list is computed from the DOM before the re-render as before; the list ends with Settings, which now exists after the heal, so focus lands on Settings (the old tile of the gone link has no neighbours left). Edit mode stays on (`data-edit="true"`).
5. **Entry points.** Same three as the previous run: Edit link Save, Delete confirm, a drop. The Heal is part of the shared recovery, no per-entry code.
6. **Backlog 69 items.** (a) Describe `recoverFromGoneLink` where it is defined and keep the original comment above `runDesktopMutation`; (b) fix the phrase in `docs/stale-link-and-host-contrast.md` AS-SLH-06; (c) mention `LinkGoneError` and the recovery in `agent-config/CLAUDE.md` (concurrency section). No behaviour change.

## Scope

- `src/newtab.js`: `recoverFromGoneLink` (heal step, comments).
- `docs/stale-tab-empty-state.md` (this spec → `implemented`), `docs/stale-link-and-host-contrast.md` (AS-SLH-06 wording), `docs/architecture.md` (one sentence in the concurrency paragraph), `docs/vertically-centered-defaults.md` (the exception of decision 2), `CHANGELOG.md`.
- Notes: `agent-config/CLAUDE.md` (concurrency), backlog 68–69 closed.
- E2E: new `dg-68-stale-tab-empty-state.mjs`; `dg-67` stays green. Unit/pin tests: `test/newtabSource.test.js` pins for the heal call.

## Process

Full UI pipeline (`quiet-tab-pipeline`): spec review and gate → plan (given) → E2E-first → final code review → final design gate → independent verification → checkpoint. Run №29, E2E `dg-68` (`dg-66`, `dg-67` are taken, `dg-65` is run 25's, part 3 will take `dg-69`).

## Non-goals

- Healing in any other situation (a missing Settings tile without a wipe, hidden metrics, a stale tab that is not recovering from a gone link).
- Cross-tab live sync; changing the message text; changing `ensureWidgetsLayout` itself.
- A reset action in the UI.

## Accepted exceptions

- If the heal itself fails the grid stays empty until a reload (decision 3).
- Healing writes to storage (the system keys, once) in a recovery that otherwise writes nothing; this is the point of the decision.

## Acceptance scenarios

### AS-STE-01 Save on a gone link after the storage was cleared
- Given: tabs A and B on the same profile, B opened before A cleared `chrome.storage.sync` and `chrome.storage.local` of the extension (both showed links f0, f1 and the default tiles); B at 1280×800.
- When: in B (edit mode), open Edit link on f0 and press Save.
- Then: the dialog closes; B's grid shows Settings, Add and the four weather tiles (the fresh-install defaults for B's window, equal to what a reload of B would show: same cells), no f0/f1; storage holds the system keys only (one `set()` of the heal, no link keys); `#desktop-status` reads `This link was deleted in another tab.`; focus is on Settings; `data-edit="true"`; B is not busy (Add link opens).
- Verified by: E2E `dg-68` group 1.

### AS-STE-02 Delete on a gone link after the storage was cleared
- Given: as AS-STE-01.
- When: press the − of f0 and confirm Delete.
- Then: as AS-STE-01 (confirm closed, defaults restored, message, focus on Settings).
- Verified by: E2E `dg-68` group 2.

### AS-STE-03 Drop of a gone tile after the storage was cleared
- Given: as AS-STE-01.
- When: drag f0 to a free cell.
- Then: as AS-STE-01 (no settled/dragging/highlight leftovers, defaults restored, message, focus on Settings).
- Verified by: E2E `dg-68` group 3.

### AS-STE-04 No heal when the desk is intact
- Given: tabs A and B; A deletes f0 only (the desk keeps Settings); B stale.
- When: Save on f0 in B.
- Then: exactly as `docs/stale-link-and-host-contrast.md` AS-SLH-01: nothing written (`syncSetCalls` unchanged), focus on the neighbour of f0.
- Verified by: E2E `dg-68` group 4 (and `dg-67` unchanged).

### AS-STE-05 The heal fails
- Given: as AS-STE-01 and `chrome.storage.sync.set` made to reject in B after its load.
- When: Save on f0 in B.
- Then: the dialog closes, the message is shown, no page error, the grid stays empty (no Settings), B is not busy; after the fault is cleared and B reloads, the defaults are there.
- Verified by: E2E `dg-68` group 5.

### AS-STE-06 Backlog 69 items
- Then: `recoverFromGoneLink` has a comment describing it; the previous spec's AS-SLH-06 names `failStorageGetAfter(page, { key, skip: 2, ms })`; `agent-config/CLAUDE.md` mentions `LinkGoneError`.
- Verified by: unit pin / review.

## Review focus

- The heal runs only when Settings is missing; an intact desk is never written.
- Focus lands on Settings, never on `body`; edit mode and the busy lock are right afterwards.
- The heal's layout equals the reload's layout for the same window (the screen read at heal time).
- A failing heal never throws out of the recovery.

## Copy (user-visible)

- No new strings (`This link was deleted in another tab.` as before).
