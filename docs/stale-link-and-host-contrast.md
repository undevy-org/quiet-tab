# Stale-tab link recovery and link host contrast

## Status

`draft` — closes backlog 66 and 67 (found by the final design review of run 27, both older than run 27). **Data compatibility: not required** (no-users policy, `agent-config/CLAUDE.md`); storage shape unchanged.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-11 | "Давай": take the two Minors (backlog 66, 67) as a small run, nothing left for later. | `confirmed` | Owner chat after run 27. |
| 2026-10-11 | A stale tab saving or deleting a link that another tab already deleted: **close the dialog and show a message**. | `confirmed` | Owner answer (recommended option). |
| 2026-10-11 | Host line contrast on a link tile with a red accent in the light theme: **a slightly darker muted**, hierarchy label / host kept. | `confirmed` | Owner answer (recommended option). |

## Current behaviour (`main` after run 27)

- `widgetsService.updateFavorite` / `deleteFavorite` throw `Error("Favorite not found")` when no favorite has the id (`src/widgetsService.js:319,366`). `runDesktopMutation` (`src/newtab.js:2291`) shows an error text inside the open dialog (`showDialogError`) or in the status line; the dialog stays open and the tile of the deleted link stays on the grid of the stale tab until a reload. "Favorite" appears nowhere else in the UI (it says "link").
- `.favorite-tile__host` is `var(--muted)` (`src/newtab.css:311-315`). On a link tile with the accent `#d32f2f` in the light theme its contrast is 4.43:1 (1×2, 10px) and 4.36:1 (2×2, 12px) against 4.5:1 (identical on `origin/main` at `d2e7b4e`; run 27 final review L3-01). 1×1 and 2×1 tiles have no host line.

## Default decisions (owner can override)

1. **Typed error.** `widgetsService` exports `LinkGoneError` (`name` `LinkGoneError`, `code` `"link-gone"`, message `This link was deleted in another tab.`). `updateFavorite` and `deleteFavorite` throw it when **no item at all** has the id. An id that belongs to a non-favorite item (a weather metric, a chrome tile) keeps `Error("Favorite not found")` (a programming error, not a stale tab).
2. **Recovery in `runDesktopMutation`.** When the action throws an error with `code === "link-gone"`: the busy state ends; the widgets state is re-read from storage (`widgetsService.getState()`, which does not write) and applied; the open dialog closes (focus returns as for any closed dialog); `#desktop-status` shows the message, which is also announced in `#desktop-live`; the function returns `false`. The grid re-renders from fresh storage, so the tile of the deleted link disappears. If the re-read fails, the state is left as it was and the message is still shown.
3. **Both entry points.** The recovery applies to the Edit link Save and to the Delete link? confirm (`confirmDeleteFavorite`) — both go through `runDesktopMutation`.
4. **No other change in a stale tab.** Mutations of existing ids that still exist behave as today (AS-TSF-06 of `docs/tile-size-followups.md`: they start from fresh storage). No `chrome.storage.onChanged` listener is added.
5. **Host color.** `.favorite-tile__host` color becomes `color-mix(in srgb, var(--muted) 70%, var(--text))`: a little closer to the text color in both themes, hierarchy label / host kept (host stays smaller and lighter than the label). Required, measured (AS-SLH-03): host contrast ≥ 4.5:1 against the composited tile background for the accents `#69a8ff` (default), `#ffffff`, `#ffd400`, `#ff3b30`, `#d32f2f`, `#000000` and `#24292f`, at 1×2 (10px) and 2×2 (12px), in the light and dark themes. If one pair still fails, the 70 % is raised (not below 4.5 allowed), recorded in the plan ledger.

## Scope

- `src/widgetsService.js`: `LinkGoneError`, the two throw sites.
- `src/newtab.js`: `runDesktopMutation` recovery (a small helper `recoverFromGoneLink`).
- `src/newtab.css`: `.favorite-tile__host` color.
- `test/widgetsService.test.js`: the two "unknown favorites" tests and a new test for `LinkGoneError` vs `Favorite not found`; `test/newtabSource.test.js` pins; E2E new `dg-67-stale-link-and-host-contrast.mjs`.
- Docs: `CHANGELOG.md`, `docs/architecture.md` (one sentence in the concurrency section), `docs/design-system.md` (host color), backlog 66–67 closed.

## Process

Full UI pipeline: spec review and gate → plan → E2E-first → final code review → final design gate → independent verification. Run №28, E2E `dg-67` (`dg-65` is reserved by run 25; part 3 will take `dg-68`).

## Non-goals

- Live sync between tabs; recovery of other stale-tab failures (weather tiles, moves — `moveWidget` already reports "That spot is taken").
- Changing the label color, tile borders or the host font size.
- New strings other than `This link was deleted in another tab.`

## Accepted exceptions

- A stale tab keeps showing the deleted link until it attempts a mutation on it, reloads or edits something else (existing design).

## Acceptance scenarios

### AS-SLH-01 Save on a link deleted in another tab
- Given: tabs A and B on the same profile, both showing f0; A deletes f0.
- When: in B, open Edit link on f0 and press Save.
- Then: no write happens (storage unchanged); the dialog closes; B's grid no longer shows f0; `#desktop-status` reads `This link was deleted in another tab.` and `#desktop-live` announces it; no page error; B remains usable (a new Add link works).
- Verified by: E2E `dg-67` group 1; unit test of `LinkGoneError`.

### AS-SLH-02 Delete on a link deleted in another tab
- Given: as AS-SLH-01.
- When: in B, press the − of f0 and confirm Delete.
- Then: storage unchanged; the confirm dialog closes; f0 is gone from B's grid; the same message in `#desktop-status`.
- Verified by: E2E `dg-67` group 2.

### AS-SLH-03 Host contrast on accent tiles
- Given: link tiles 1×2 and 2×2 with each accent of decision 5; light and dark.
- When: render.
- Then: host contrast against the composited tile background (own color layer, then the largest-alpha stop of the gradient, over the page background) is ≥ 4.5:1 for every accent × size × theme; the host is still lighter or smaller than the label (computed color differs from the label color; font size 12px / 10px unchanged).
- Verified by: E2E `dg-67` group 3 (table of ratios on a FAIL).

### AS-SLH-04 Service errors
- Given: a service over an in-memory store.
- When: `updateFavorite` / `deleteFavorite` with an unknown id; the same with the id of a weather metric.
- Then: unknown id → `LinkGoneError` (`code` `link-gone`, the message above), nothing written; a metric id → `Error("Favorite not found")`.
- Verified by: unit `test/widgetsService.test.js`.

## Review focus

- The stale tab ends in a consistent state: no ghost tile, no stuck dialog, no busy lock (the next action works), focus lands sensibly.
- The message is visible and announced; it disappears as other status messages do.
- Host hierarchy: still clearly secondary to the label; dark theme not brighter than the label.

## Copy (user-visible)

- `This link was deleted in another tab.` (status line and live region). "Favorite not found" is no longer user-visible for a deleted link.
