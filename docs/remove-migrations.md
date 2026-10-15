# Remove the storage migrations (legacy → v1 → v2 → v3)

## Status

`implemented` — closes backlog 37. No UI change: the page for a normal (v3) install is identical.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-06 | Rule "no users yet": stored data of earlier versions does not have to survive an update; the migration code stays only until a separate task removes it. | `confirmed`, by rule | `CLAUDE.md` "Data compatibility policy" |
| 2026-10-15 | Run 40 `remove-migrations`: delete the migration code and the upgrade scenarios (roadmap R40, backlog 37). | `confirmed` | Owner kickoff prompt |

Data compatibility: not required (no-users policy, `agent-config/CLAUDE.md`).

## Current behaviour (`main` at `674b063`)

- `newtab.js` bootstrap runs, under the mutation lock: `migrateToWidgets` (legacy `quietTabFavorites*` → v1), `migrateWidgetsToV2`, `migrateWidgetsToV3`, then `ensureWidgetsLayout` and `getState`. A failure in a migration sets `widgetsMigrationFailed`, locks the grid and shows a Sync-quota message.
- `inspectWidgetsMeta` returns `missing | valid | v2 | v1 | newer | invalid`. `assertWritable` refuses `v1`/`v2` with `V1_WIDGETS_MESSAGE`, `newer` with `NEWER_WIDGETS_MESSAGE`, `invalid` with `INVALID_WIDGETS_MESSAGE`. `ensureWidgetsLayout` writes only for `valid` or `missing`.
- `getState` reads an empty state for any meta that is not a valid v3 meta; for such a meta the page shows an empty grid without any message and without Settings/Add (`renderDesktop`: `widgetsState` is not null, so no status is drawn), and no UI path can write.

## Default decisions (owner can override)

1. **Delete the migration chain.** `migrateToWidgets`, `migrateWidgetsToV2`, `migrateWidgetsToV3` and everything only they use go, with their unit tests.
2. **Old data is ignored, not erased.** Legacy keys (`quietTabFavorites` in `local`, `quietTabFavoritesMeta` and `quietTabFavorite:<id>` in `sync`) are never read, written or removed: a profile that has them and no widgets meta starts as a fresh install (`ensureWidgetsLayout` lays out the defaults). Reason: erasing needs new code and a write path in a change that exists to delete code, and the no-users policy says old data may simply be orphaned.
3. **`v1` and `v2` metas become `invalid`.** `inspectWidgetsMeta` loses the `v1` and `v2` states; a meta that is neither a valid v3 meta nor from a newer version is `invalid` (as any unreadable meta already is): reads give an empty state, `ensureWidgetsLayout` writes nothing, every write is refused with `INVALID_WIDGETS_MESSAGE`. What the page shows for `invalid` is the separate decision L1-02 (backlog); this run does not change it. `newer` (rollback protection) stays exactly as it is.
4. **`V1_WIDGETS_MESSAGE` is deleted** (no state returns it).
5. **`widgetsMigrationFailed` is deleted.** It was set only by the migration `catch`; with no migration nothing sets it. Its render branch, `gridLocked` term, resize-guard term, Settings-click term and the "Couldn't move your favorites…" text go. The remaining locks (`widgetsNewer`, no `widgetsState`) are unchanged.
6. **Bootstrap after the change:** (a) early read of the raw meta, in its own small `try`: a rejected read is not fatal, `rawMeta = {}`, and the boot goes on. A read that fails once fails again in `getState`, whose catch shows `favoritesError` (the storage error text, not the deleted Sync-quota text) and `ensureWidgetsLayout` has its own catch → `widgetsEnsureFailed`. Accepted: a `newer` meta that the early read missed is still never written (`assertWritable`), only the read-only message is not shown on that boot; `newer` → locked read-only (unchanged); (b) `ensureWidgetsLayout(sync, { screen: firstScreen() })`, a failure is non-fatal as today; (c) `getState()`. The branch that needed `localStorageArea` for the legacy blob is gone.
7. **Kept on purpose (not migration, or a separate decision):** the optional legacy `tileSize` tolerance of `isOptionalTileSize` and the `delete nextItem.tileSize` in `widgetsService` (it is live: `sizeOf`/`displayLayout` read `tileSize` for items without a valid grid, `dg-28` pins a `tileSize: "wide"` metric without grid shown as 2×1, and the harness seeds `legacyFavorite`/`metric()` carry it; removing the tolerance would make such items invalid and is a behaviour change for a normal v3 install, so it is a backlog line, not part of this run); `sizeOf` and `isOnGrid` are named as kept; `isValidGrid` (signed), `placeMissing`, `displayLayout`, `firstFree`/`mark`/`isOnGrid` (used by the live engine); `CHROME_ROLE_BY_ID`; `ensureWidgetsLayout`; the `invalid` state and its message (L1-02).

## Scope

Removed (with every export only these used; the implementer greps for stragglers):

- `src/widgetsStore.js`: `migrateToWidgets`, `migrateWidgetsToV2`, `migrateWidgetsToV3`, `writeMigratedState`, `uniqueValidItems`, `tagFavorite`, `LEGACY_*` constants and `legacyFavoriteItemStorageKey`, `MIGRATION_CHUNK_SIZE`, `CHROME_STORAGE_KEYS`, `isWidgetsStateV1`, `isWidgetsStateV2`, `isWidgetsMetaV1`, `isWidgetsMetaV2`, `isColumns`, `buildWidgetsMetaV1`, `isStrictWidgetItemV2`, `hasValidGridV2`, `readItemV2`, the `WIDGETS_VERSION_V1/V2` constants, the `version` parameter of `buildWidgetsMeta`/`isWidgetsStateWith` if it becomes constant, `V1_WIDGETS_MESSAGE`, the `v1`/`v2` arms of `inspectWidgetsMeta` and `assertWritable`, and the imports they leave unused.
- `src/desktopLayout.js`: `isValidGridV2`, `migrateV1ToV2`, `centerShift`, `V1_MAX_COLUMNS` (and the header comments naming them).
- `src/widgetsLayout.js`: `defaultColumnsForItems`. `src/widgetsShared.js`: `GRID_POSITIONS`, `MIN_GRID_COLUMNS`, `MAX_GRID_COLUMNS`, `DEFAULT_GRID_COLUMNS`.
- `src/newtab.js`: the migration imports, the migration calls in the bootstrap, `widgetsMigrationFailed` (decision 5) in all six places: the declaration (l.252), `promptLiveState` `gridLocked` (l.1432), the `renderDesktop` branch (l.2647), the resize guard (l.2712), the catch (l.3116) and the Settings click (l.3172).
- Tests (tests that go red and are rewritten or deleted): `test/widgetsStore.test.js` (migrate describes, `inspectWidgetsMeta`/`assertWritable` v1/v2 cases l.542–585, `V1_WIDGETS_MESSAGE` pins; the "v2 meta reads as empty" case stays with a new meaning), `test/desktopV2.test.js` (l.68 `inspectWidgetsMeta` v1/v2, l.86 v1 reads empty, l.102 `migrateWidgetsToV2`, l.125 and l.161 inside the migration blocks, l.305 "leaves newer, invalid, v2 and v1 metas alone", l.576 write guard, l.617 resume), `test/desktopLayout.test.js` (l.329 `centerShift`, l.533 `migrateV1ToV2`), `test/widgetsLayout.test.js` (l.81–85 exports pin becomes `["placeTooltip"]`), `test/widgetsShared.test.js` (l.35–40); the source pins in `test/newtabSource.test.js` (l.304–308, 310–318 renamed, 333–338, 349–356, 652, 663, 966–971, 1070–1113) about the migration bootstrap and `widgetsMigrationFailed` (rewritten to pin the new bootstrap order: early `newer` check → `ensureWidgetsLayout` → `getState`, no `migrate` call).
- E2E (classification of run 40, approximate checks in brackets):
  - **Retired** to `.private/e2e/scenarios/retired/` (≈67 checks; `14-modal-upgrade` AS-9c keeps its "no `local` storage, v3 in `sync`" case as one check on a v3 seed): `01-upgrade` [16], `05-migration-failure` [13], `08-migration-message-visible` [4], `dg-12-migrate-v1` [11], `dg-12b-migrate-resume` [11], `dg-13-migration-failure` [8], `dg-34-legacy-keys` [4] (it pins the stale-legacy-key cleanup that lived in `migrateToWidgets`; decision 2 drops that cleanup).
  - **Trimmed** (the groups that assert a migration outcome go, the rest stays): `14-modal-upgrade` (AS-6, AS-9b, AS-9c, `v2UpgradeDiff`, `buildFromRef("main-845f29e")`; ≈12 checks), `dg-57-centered-grid` (groups 8, 9, 10 and the migration half of 16; ≈23), `09-weather-ensure` (the whole AS-29 block: both seed+check pairs through `widgetStorage(favs(2), { columns })`, its `byRow` packing checks and "wide metrics span two cells" are results of v1 packing; the count is taken by the implementer), `dg-56-first-run-empty-desk` (AS-FE-07 g "failed migration locked state"; 1).
  - **Re-seeded**: nine scenarios build their profile with the harness helper `widgetStorage` (a **v1** meta with `columns`/`position`) and rely on the boot migration to get a grid: `09`, `10`, `12`, `13`, `14` (the surviving groups), `15`, `dg-56`, `dg-62`, `dg-63`. They move to `widgetStorageV3` with explicit grids (both chrome tiles and the four metrics included, in absolute cells for 1280 px = 14 columns). Assertions that are geometric invariants (a tooltip does not cover its tile, a dialog stays in the window) stay as they are; assertions that depended on the v1 packing or on DOM order (`10` AS-21e and the `noCity(items, columns = 6)` cases, `12` which runs one seed at 1280/500/320 and with `columns` 6 and 12, `dg-56` AS-FE-01 `same(d.ids, expected)`) are re-derived from the new seed (`12` gets a seed per width) and each change is listed in the implementer's report.
  - **Unchanged**: `dg-14-newer-meta` (it and the new `dg-81` still use `legacyStorage`; its old-build part uses `buildFromRef` and `widgetStorageV2`), `dg-28`, `dg-55`, `dg-58`, `dg-60`, `dg-64`.

  - **New**: `dg-81-old-data-ignored.mjs` (AS-RM-02, 02b, 03; groups A–D).
  - **Harness**: keep `legacyStorage` (used by `dg-14` and `dg-81`), `legacyFavorite`, `widgetStorageV2`/`favV2`, `buildFromRef`, `removeStorageAreaInit`, `clearStorageFault` and the fault helpers; delete `widgetStorageP2` (no user); rename the v1 `widgetStorage` to `widgetStorageV1` and keep it for `dg-81` only (its `columns`/`position` options stay, they are the v1 shape); add a `remove` recorder next to `recordSyncSets` (or compare `syncGet` before/after with `stableJson`, which also catches removals); drop imports left unused (`dg-57`: `legacyStorage`, `widgetStorage`, `widgetStorageV2`, `favV2` where only the removed groups used them). Empty-profile groups launch with `autoPrompt: true` as `dg-14`.
- Stale comments naming a deleted symbol are fixed: `widgetsStore.js` l.33, 38, 42–43, 113, 148, 276–277, 679–680; `desktopLayout.js` l.4, 57–58; `newtab.js` l.249, 3076–3077, 3098; `newtab.css:473`; `widgetsShared.js:13`; `widgetsLayout.js:7–8`.
- Docs: `agent-config/CLAUDE.md` (Architecture: store API line and `desktopLayout` line; "Widgets storage sharding" bootstrap steps 1–3 and the lock paragraph; the "existing migration code stays until a separate task" bullet of the policy and the "(legacy → v1 → v2 → v3)" mention), `docs/architecture.md` (Bootstrap steps 1–3, the v1 → v2 absent-id remark, the locked-state paragraph, module table rows), `docs/widget-drag-limits.md`, `docs/centered-grid.md` and the other specs that describe the migration get a one-line "migration removed in run 40" note under their Status only when their text claims the code exists, `CHANGELOG.md` `[Unreleased]`, backlog 37 closed, roadmap R40 struck.

## Non-goals

- Behaviour of a normal v3 install (every tile, drag, dialog, weather, wizard, stale-tab recovery): unchanged.
- L1-02 (the page text for an `invalid` meta), backlog 43 and 44, the `tileSize` tolerance (decision 7), erasing old keys.
- New storage formats or version numbers: the layout stays version 3.

## Acceptance scenarios

Common Given: Chrome with the unpacked extension, 1280×800, fresh profile unless stated.

### AS-RM-01 A normal v3 install is unchanged
- Given: a profile with a valid v3 meta, six system tiles and three links (seeded).
- When: open a new tab, reload, drag a tile, add and remove a link.
- Then: same tiles in the same cells as before the change; every write succeeds; storage keeps `version: 3`.
- Verified by: the existing E2E suite (full run with `--base origin/main`), in particular `dg-57-centered-grid.mjs` (v3 groups), `dg-14-newer-meta.mjs`.

### AS-RM-02 Legacy favorites keys are ignored and left alone
- Given: `sync` holds `quietTabFavoritesMeta` and `quietTabFavorite:a`, `local` holds `quietTabFavorites`, no widgets meta.
- When: open a new tab.
- Then: the desk shows the six default tiles (a fresh install, wizard off as in the note below), no link from the legacy data; the three legacy keys are byte-identical afterwards; `quietTabWidgetsMeta` is a valid v3 meta.
- Verified by: E2E `dg-81-old-data-ignored.mjs` (group A). In every `dg-81` group the first-run wizard is switched off by seeding `quietTabOnboardingWizardComplete: true` in `local` (so "six default tiles" means the plain desk, no veil, and nothing but the boot writes anything); the wizard cannot open for a v1/v2/invalid meta anyway (no enabled metric).

### AS-RM-02b Legacy keys next to a valid v3 meta are left alone
- Given: a valid v3 meta with the six system tiles and two links, plus `quietTabFavoritesMeta`, `quietTabFavorite:a` in `sync` and `quietTabFavorites` in `local`.
- When: open a new tab.
- Then: the desk shows the same tiles as without the legacy keys; the three legacy keys are byte-identical afterwards (the removed code deleted them; this is the one intended behaviour change, decision 2).
- Verified by: E2E `dg-81-old-data-ignored.mjs` (group D; group A is AS-RM-02, B the v2 meta and C the v1 meta of AS-RM-03), replacing the retired `dg-34-legacy-keys.mjs`.

### AS-RM-03 A v1 or v2 widgets meta is read-only, never written or migrated
- Given: `sync` holds a valid v2 meta (and, in a second run, a valid v1 meta) with items.
- When: open a new tab and wait for the boot to settle (`#favorites .desktop-grid` present).
- Then: every key of `sync` and `local` is byte-identical afterwards and `recordSyncSets` records zero `set` calls and the `syncGet` before/after comparison (`stableJson`) shows no removal (nothing migrated, ensured or deleted); no console error; the desk has no `.favorite-tile`, no `.weather-tile`, no Settings or Add tile, and its DOM (tile count 0, `#desktop-status` text) equals the one an `invalid` meta (`{ version: 1, order: "x" }`, as `09` AS-5b) gives in the same run; that reference is group E of `dg-81`. The page offers no action (no Add tile), so no UI write is attempted; the stated behaviour is: empty grid, no message, nothing written. Keys are compared with `stableJson`; `assertWritable` refusing `invalid` is pinned by unit test (AS-RM-06).
- Verified by: E2E `dg-81-old-data-ignored.mjs`.

### AS-RM-04 A newer meta still locks read-only
- Given: a meta with `version: 99`.
- When: open a new tab.
- Then: the newer-version message, the grid locked, nothing written (as before).
- Verified by: E2E `dg-14-newer-meta.mjs` (unchanged).

### AS-RM-05 The bootstrap has no migration step
- Given: the source of `newtab.js`.
- When: `npm test`.
- Then: pins show the order early `newer` check → `ensureWidgetsLayout` → `getState`; none of `migrateToWidgets|migrateWidgetsToV2|migrateWidgetsToV3|widgetsMigrationFailed|centerShift|migrateV1ToV2|isValidGridV2|defaultColumnsForItems|V1_WIDGETS_MESSAGE|V1_MAX_COLUMNS|GRID_POSITIONS` and none of the strings `Couldn't move your favorites` and `still being updated to the new layout` appears in `src/`; `grep -ri migrat src/` finds nothing, and "legacy" remains only where it describes `tileSize` or the CSS token aliases (`design-tokens.css:18`); the `grep` output is quoted in the report. The comments at `src/newtab.css:473`, `src/newtab.js:249`, `3076`, `src/widgetsShared.js:13`, `src/widgetsLayout.js:7-8` and `docs/widget-drag-limits.md` are updated.
- Verified by: `test/newtabSource.test.js` for `newtab.js`, and a `grep` over all of `src/` in the Task 3 report.

### AS-RM-05b A failing early meta read does not blank the page silently
- Given: the source of `newtab.js` (no module is extracted; the boot stays in `newtab.js`).
- When: `npm test` runs.
- Then: the early read sits in its own `try` whose `catch` does not set a lock flag; the boot continues to `ensureWidgetsLayout` and `getState`; no unhandled rejection.
- Verified by: `test/newtabSource.test.js` pin on the shape of the early read.

### AS-RM-06 The store API surface
- Given: `src/widgetsStore.js`.
- When: `npm test`.
- Then: `inspectWidgetsMeta` returns only `missing|valid|newer|invalid` (a v1 or v2 meta is `invalid`); `assertWritable` refuses `newer` and `invalid` and never mentions an upgrade in progress; `ensureWidgetsLayout` still writes for `valid` and `missing` only; `createWidgetsStore` behaviour on a valid v3 meta is byte-for-byte the same.
- Verified by: unit tests in `test/widgetsStore.test.js`.

### AS-RM-07 The suite got smaller and nothing else went red
- Given: the full E2E before (this run's baseline on `main`) and after.
- When: run both with `--base origin/main`.
- Then: every remaining scenario is green (or red only as `permissions.md` allows); the report states checks and wall time before and after (expected: about 67 fewer checks from the retirements plus about 36 from the trims (12 + 23 + 1), plus the `dg-81` checks; the report reconciles the actual difference), and the list of retired scenarios.
- Verified by: stage 5 verifier report.

## Review focus

- Scenarios/states: a seeded old meta must not write anything, anywhere (the old code wrote on every boot).
- Visual/layout: none (no UI change); one look at a v3 desk for sameness.
- Accessibility/texts: the deleted message strings must not be reachable from any state.
- Stale comments: `widgetsStore.js` l.38 (names a deleted symbol) is on the list of comments to fix (Scope).

## Accepted exceptions

- A profile with a v1 or v2 widgets meta sees the same empty read-only desk as with a malformed meta until L1-02 decides the text. Reason: no users (owner policy); the only installs that could have such a meta are development profiles. Chrome Sync may restore the keys on a reinstall, so a developer removes the old widgets keys by hand from DevTools on the new tab page (`chrome.storage.sync.remove("quietTabWidgetsMeta")`; `sync.clear()` would also erase the weather city).
- Orphaned legacy keys stay in the profile's storage and still count against the 100KB `sync` quota (the removed code deleted them for that reason). Reason: erasing is new code, and no profile that holds them has a user.
