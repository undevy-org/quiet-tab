# Stale-tab link recovery and link host contrast

## Status

`implemented` — closes backlog 66 and 67 (found by the final design review of run 27, both older than run 27). **Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`); storage shape unchanged.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-11 | "Давай": take the two Minors (backlog 66, 67) as a small run, nothing left for later. | `confirmed` | Owner chat after run 27. |
| 2026-10-11 | A stale tab saving or deleting a link that another tab already deleted: **close the dialog and show a message**. | `confirmed` | Owner answer (recommended option). |
| 2026-10-11 | Host line contrast on a link tile with a red accent in the light theme: **a slightly darker muted**, hierarchy label / host kept. | `confirmed` | Owner answer (recommended option). |

## Current behaviour (`main` after run 27)

- `widgetsService.updateFavorite` / `deleteFavorite` throw `Error("Favorite not found")` when no favorite has the id (`src/widgetsService.js:319,366`), `moveWidget` throws `Error("Widget not found")` (`:414-420`). `runDesktopMutation` (`src/newtab.js:2291`) shows an error text inside the open Edit link dialog (`showDialogError`, the dialog stays open) or in the status line (the Delete confirm closes itself in `confirmDeleteFavorite`, a refused drop returns the tile in `commitDrop`); in every case the tile of the deleted link stays on the grid of the stale tab until a reload, and the text is technical ("Favorite" appears nowhere else in the UI, it says "link"). `refreshAutoAccent` calls `updateFavorite` inside an empty `catch`, so a gone link is swallowed there (checked, unchanged).
- `.favorite-tile__host` is `var(--muted)` (`src/newtab.css:311-315`). Run 27's final review measured 4.43:1 (1×2, 10px) and 4.36:1 (2×2, 12px) for the accent `#d32f2f` in the light theme (identical on `origin/main` at `d2e7b4e`); the spec review of run 28 computed 4.09 for the same pair with the harness model (the exact figure depends on how the page background is composited) and found more failing accents. The tile paints `normalizeAccentLightness(item.backgroundColor)` (lightness clamped to 0.45–0.70, `src/favoriteColor.js:177`), so the stored `#ffffff`, `#000000`, `#24292f` become `#b3b3b3`, `#737373`, `#647182`. Estimated light-theme host contrast with the current `--muted`: `#66a6ff` 4.65, `#b3b3b3` 4.80, `#ffd400` 5.03, `#ff3b30` 4.22, `#d32f2f` 4.09, `#737373` 4.31, `#647182` 4.29; the dark theme is at least 5.31. AS-SLH-03 measures the real values. 1×1 and 2×1 tiles have no host line.

## Default decisions (owner can override)

1. **Typed error.** `widgetsService` exports `LinkGoneError` (`name` `LinkGoneError`, `code` `"link-gone"`, `id` the missing id, message `This link was deleted in another tab.`). `updateFavorite`, `deleteFavorite` and `moveWidget` throw it when **no item at all** has the id. An id that belongs to a non-favorite item keeps `Error("Favorite not found")` (a programming error, not a stale tab); `moveWidget` checks the items (`base.items`), not the layout: an id of an existing item that is not on the grid (a hidden weather metric) keeps `Error("Widget not found")`, an id in the layout is unchanged. The text `This link was deleted in another tab.` is a default (the owner chose the behaviour, not the wording; owner can override); a link deleted from another device through sync is covered by the same text.
2. **Recovery in `runDesktopMutation`.** When the action throws an error with `code === "link-gone"` (checked before `onFailure` and before the dialog error), in this order, all while the busy lock is held: (a) any pending drop is cleared; (b) the neighbour target of the gone id is computed from the current DOM (`neighborTargets(error.id)`, the same rule as a normal delete: next tile, else previous, else Settings); (c) the state is re-read with `widgetsService.getState()` (no write); if that fails the old state is kept and the next steps still run; (d) one `finishFavoritesAction(generation, () => { widgetsState = fresh })` ends the busy state and re-renders from fresh storage, so the tile of the deleted link disappears; (e) if a dialog is open it is closed with `closeDesktopDialog({ restoreFocusTo: neighbours })` (the whole `neighborTargets` list, which ends with Settings, so focus never falls to `body`); otherwise (a refused drop) focus goes to the neighbour; (f) `#desktop-status` (`role="alert"`, announced by itself; `#desktop-live` is not used, as for every other write failure) shows the message; the function returns `false`. The recovery never throws out of `runDesktopMutation`. If the generation changed meanwhile (not reachable today: an action starts only when the busy lock is free), `finishFavoritesAction` applies nothing and does not render, but steps (e) and (f) still run. The status disappears after the usual 8 s.
3. **Entry points.** The Edit link Save, the Delete link? confirm (`confirmDeleteFavorite` then returns at its `closed meanwhile` check) and a drag-drop of a tile (`commitDrop`) of a link deleted in another tab. Mutations of ids that still exist behave as today (AS-TSF-06 of `docs/tile-size-followups.md`). No `chrome.storage.onChanged` listener is added.
4. **Host color.** `.favorite-tile__host` color becomes `color-mix(in srgb, var(--muted) 70%, var(--text))` (70 % `--muted`, 30 % `--text`: a little closer to the text color in both themes; lowering the muted share darkens the line, raising it would undo the fix). Chromium reports the computed value as `color(srgb r g b)` or `color(srgb r g b / a)` with components 0..1, so the E2E color parsers (`CONTRAST_JS.parse` in `dg-66`, `contrastOf` in `.private/e2e/lib/harness.mjs`) learn that form (components × 255) and `dg-64`, `dg-66` are re-run. Required, measured (AS-SLH-03): host contrast ≥ 4.5:1 against the composited tile background for the stored accents `#69a8ff` (default), `#ffffff`, `#ffd400`, `#ff3b30`, `#d32f2f`, `#000000` and `#24292f` (painted after `normalizeAccentLightness`), at 1×2 (10px) and 2×2 (12px), in the light and dark themes. The estimate for the 70 % mix is at least 5.98:1 (light) and 6.69:1 (dark). If a pair fails, the muted share is lowered (never raised) and recorded in the plan ledger.

## Scope

- `src/widgetsService.js`: `LinkGoneError`, the throw sites of `updateFavorite`, `deleteFavorite`, `moveWidget`.
- `src/newtab.js`: `runDesktopMutation` recovery (a helper `recoverFromGoneLink`), `pendingDrop` cleared by it.
- `.private/e2e/lib/harness.mjs`: `failStorageGetAfter(page, { key, skip: 2, ms })` (`ms` 0 rejects the third read of the meta key, `ms` > 0 answers it late) and `restoreStorageGet` for AS-SLH-06.
- `src/newtab.css`: `.favorite-tile__host` color.
- `test/widgetsService.test.js`: the block "rejects updates, deletes, and moves for unknown favorites" (lines 331-338: `LinkGoneError` for the three calls with an unknown id) and a new test that a metric id still gives `Favorite not found` (lines 631-632 stay); `test/newtabSource.test.js` pins for the host color rule, `recoverFromGoneLink` and `code === "link-gone"`; E2E new `dg-67-stale-link-and-host-contrast.mjs`; `.private/e2e/lib/harness.mjs` `contrastOf` and `dg-66` `CONTRAST_JS.parse` learn `color(srgb …)`.
- Docs: `CHANGELOG.md`, `docs/architecture.md` (one sentence in the concurrency section), `docs/design-system.md` (host color), backlog 66–67 closed.

## Process

Full UI pipeline: spec review and gate → plan → E2E-first → final code review → final design gate → independent verification. Run №28, E2E `dg-67` (`dg-65` is reserved by run 25; part 3 will take `dg-68`).

## Non-goals

- Live sync between tabs; other stale-tab failures (weather tile metrics and chrome tiles always exist).
- Changing the label color, tile borders or the host font size.
- New strings other than `This link was deleted in another tab.`

## Accepted exceptions

- A stale tab keeps showing the deleted link until it attempts a mutation on it, reloads or edits something else (existing design).

## Acceptance scenarios

### AS-SLH-01 Save on a link deleted in another tab
- Given: tabs A and B on the same profile, B opened before A deletes f0; both showed f0, f1, f2.
- When: in B (edit mode), open Edit link on f0 and press Save; repeated at 1280×800, 500×800 and 320×600 (the last repeat with f0 the only link: the neighbour is the next tile of f0 in DOM order, else the previous one, as `neighborTargets` gives; the test reads it from the DOM before the action). At 500 and 320 px `#desktop-status` lies fully inside the window.
- Then: no write is sent (`syncSetCalls` unchanged, storage identical); the dialog closes; B's grid no longer shows f0; `#desktop-status` (role alert) reads `This link was deleted in another tab.` and disappears after the usual 8 s; keyboard focus is on a tile of B (the neighbour of f0), not on `body`; no page error; B is not busy: Add link works at once.
- Verified by: E2E `dg-67` group 1; unit test of `LinkGoneError`.

### AS-SLH-02 Delete on a link deleted in another tab
- Given: as AS-SLH-01.
- When: in B, press the − of f0 and confirm Delete.
- Then: storage unchanged; the confirm dialog closes; f0 is gone from B's grid; the same message; focus on the neighbour of f0, not `body`; edit mode stays on.
- Verified by: E2E `dg-67` group 2.

### AS-SLH-03 Host contrast on accent tiles
- Given: link tiles 1×2 and 2×2 stored with each accent of decision 4; light and dark; windows 1280×800 and 320×600.
- When: render.
- Then: host contrast against the composited tile background (own color layer, then the largest-alpha stop of the gradient, over the page background; the accent painted is the normalized one) is ≥ 4.5:1 for every accent × size × theme, and strictly lower than the label contrast of the same tile; the host color differs from the label color; font sizes unchanged (10px at 1×2, 12px at 2×2). A table (accent, size, theme, ratio) is printed on a FAIL.
- Verified by: E2E `dg-67` group 3.

### AS-SLH-04 Service errors
- Given: a service over an in-memory store.
- When: `updateFavorite`, `deleteFavorite`, `moveWidget` with an unknown id; `updateFavorite`/`deleteFavorite` with the id of a weather metric.
- Then: unknown id → `LinkGoneError` (`code` `link-gone`, `id`, the message above), nothing written; a metric id → `Error("Favorite not found")` for `updateFavorite`/`deleteFavorite`; `moveWidget` with an existing id is unchanged and with a hidden metric (an item that is not on the grid) gives `Error("Widget not found")`.
- Verified by: unit `test/widgetsService.test.js`.

### AS-SLH-05 Drop of a tile deleted in another tab
- Given: as AS-SLH-01, B in edit mode.
- When: in B, drag f0 to a free cell.
- Then: nothing is written; no tile snaps back to a ghost position (no `.is-settled`, no `.drop-highlight` left); f0 is gone from B's grid; the same message in `#desktop-status`; focus on the neighbour; edit mode stays on (`data-edit="true"`); B is not busy.
- Verified by: E2E `dg-67` group 4.

### AS-SLH-06 The re-read fails
- Given: as AS-SLH-01, and in B a new harness helper `failStorageGetAfter(page, { key, skip: 2 })` (`.private/e2e/lib/harness.mjs`) installed after B has loaded: it wraps `chrome.storage.sync.get`, lets the first two reads of the widgets meta key through (`assertWritable` and the read inside `mutate`) and rejects the third (the recovery's re-read).
- When: Save on f0 in B; then, in a second run of the scenario with the third read delayed (`failStorageGetAfter(page, { key, skip: 2, ms })`), press Save again (the form submit) and Escape once while the recovery runs; both are ignored (no write, the dialog stays until the recovery ends, `syncSetCalls` unchanged).
- Then: the dialog still closes, the message is shown, no page error; B's grid keeps its old state (the tile of f0 stays, the focus goes to its neighbour); the second press starts no write while the busy lock is held; B is not busy afterwards (a later action works).
- Verified by: E2E `dg-67` group 5 (new helpers in `harness.mjs`).

## Review focus

- The stale tab ends in a consistent state: no ghost tile, no stuck dialog, no busy lock (the next action works), focus on the neighbour tile, never `body`.
- The message is visible, announced once (role alert), and disappears as other status messages do; edit mode stays on after a refused drop and after the dialog closes.
- Race: a second action pressed while the recovery runs.
- Host hierarchy: still clearly secondary to the label; dark theme not brighter than the label.

## Copy (user-visible)

- `This link was deleted in another tab.` (status line, `role="alert"`). "Favorite not found" is no longer user-visible for a deleted link.
