# Remove the storage migrations (legacy → v1 → v2 → v3)

## Status

`draft` — closes backlog 37. No UI change: the page for a normal (v3) install is identical.

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-06 | Rule "no users yet": stored data of earlier versions does not have to survive an update; the migration code stays only until a separate task removes it. | `confirmed`, by rule | `CLAUDE.md` "Data compatibility policy" |
| 2026-10-15 | Run 40 `remove-migrations`: delete the migration code and the upgrade scenarios (roadmap R40, backlog 37). | `confirmed` | Owner kickoff prompt |

Data compatibility: not required (no-users policy, `agent-config/CLAUDE.md`).

## Current behaviour (`main` at `674b063`)

- `newtab.js` bootstrap runs, under the mutation lock: `migrateToWidgets` (legacy `quietTabFavorites*` → v1), `migrateWidgetsToV2`, `migrateWidgetsToV3`, then `ensureWidgetsLayout` and `getState`. A failure in a migration sets `widgetsMigrationFailed`, locks the grid and shows a Sync-quota message.
- `inspectWidgetsMeta` returns `missing | valid | v2 | v1 | newer | invalid`. `assertWritable` refuses `v1`/`v2` with `V1_WIDGETS_MESSAGE`, `newer` with `NEWER_WIDGETS_MESSAGE`, `invalid` with `INVALID_WIDGETS_MESSAGE`. `ensureWidgetsLayout` writes only for `valid` or `missing`.
- `getState` reads an empty state for any meta that is not a valid v3 meta.

## Default decisions (owner can override)

1. **Delete the migration chain.** `migrateToWidgets`, `migrateWidgetsToV2`, `migrateWidgetsToV3` and everything only they use go, with their unit tests.
2. **Old data is ignored, not erased.** Legacy keys (`quietTabFavorites` in `local`, `quietTabFavoritesMeta` and `quietTabFavorite:<id>` in `sync`) are never read, written or removed: a profile that has them and no widgets meta starts as a fresh install (`ensureWidgetsLayout` lays out the defaults). Reason: erasing needs new code and a write path in a change that exists to delete code, and the no-users policy says old data may simply be orphaned.
3. **`v1` and `v2` metas become `invalid`.** `inspectWidgetsMeta` loses the `v1` and `v2` states; a meta that is neither a valid v3 meta nor from a newer version is `invalid` (as any unreadable meta already is): reads give an empty state, `ensureWidgetsLayout` writes nothing, every write is refused with `INVALID_WIDGETS_MESSAGE`. What the page shows for `invalid` is the separate decision L1-02 (backlog); this run does not change it. `newer` (rollback protection) stays exactly as it is.
4. **`V1_WIDGETS_MESSAGE` is deleted** (no state returns it).
5. **`widgetsMigrationFailed` is deleted.** It was set only by the migration `catch`; with no migration nothing sets it. Its render branch, `gridLocked` term, resize-guard term, Settings-click term and the "Couldn't move your favorites…" text go. The remaining locks (`widgetsNewer`, no `widgetsState`) are unchanged.
6. **Bootstrap after the change:** (a) early read of the raw meta; `newer` → locked read-only (unchanged); (b) `ensureWidgetsLayout(sync, { screen: firstScreen() })`, a failure is non-fatal as today; (c) `getState()`. The branch that needed `localStorageArea` for the legacy blob is gone.
7. **Kept on purpose (not migration, or a separate decision):** the optional legacy `tileSize` tolerance of `isOptionalTileSize` and the `delete nextItem.tileSize` in `widgetsService` (a v3 item written by an old migration may still carry it; removing the tolerance would make such an item invalid and is a behaviour change for a normal v3 install, so it is a backlog line, not part of this run); `isValidGrid` (signed), `placeMissing`, `displayLayout`, `firstFree`/`mark`/`isOnGrid` (used by the live engine); `CHROME_ROLE_BY_ID`; `ensureWidgetsLayout`; the `invalid` state and its message (L1-02).

## Scope

Removed (with every export only these used; the implementer greps for stragglers):

- `src/widgetsStore.js`: `migrateToWidgets`, `migrateWidgetsToV2`, `migrateWidgetsToV3`, `writeMigratedState`, `uniqueValidItems`, `tagFavorite`, `LEGACY_*` constants and `legacyFavoriteItemStorageKey`, `MIGRATION_CHUNK_SIZE`, `CHROME_STORAGE_KEYS`, `isWidgetsStateV1`, `isWidgetsStateV2`, `isWidgetsMetaV1`, `isWidgetsMetaV2`, `isColumns`, `buildWidgetsMetaV1`, `isStrictWidgetItemV2`, `hasValidGridV2`, `readItemV2`, the `WIDGETS_VERSION_V1/V2` constants, the `version` parameter of `buildWidgetsMeta`/`isWidgetsStateWith` if it becomes constant, `V1_WIDGETS_MESSAGE`, the `v1`/`v2` arms of `inspectWidgetsMeta` and `assertWritable`, and the imports they leave unused.
- `src/desktopLayout.js`: `isValidGridV2`, `migrateV1ToV2`, `centerShift`, `V1_MAX_COLUMNS` (and the header comments naming them).
- `src/widgetsLayout.js`: `defaultColumnsForItems`. `src/widgetsShared.js`: `GRID_POSITIONS`, `MIN_GRID_COLUMNS`, `MAX_GRID_COLUMNS`, `DEFAULT_GRID_COLUMNS`.
- `src/newtab.js`: the migration imports, the migration calls in the bootstrap, `widgetsMigrationFailed` (decision 5).
- Tests: the unit tests of all of the above in `test/widgetsStore.test.js`, `test/desktopLayout.test.js`, `test/desktopV2.test.js`, `test/widgetsLayout.test.js`, `test/widgetsShared.test.js`; the source pins in `test/newtabSource.test.js` about the migration bootstrap and `widgetsMigrationFailed` (rewritten to pin the new bootstrap order: early `newer` check → `ensureWidgetsLayout` → `getState`, no `migrate` call).
- E2E (classification of run 40, approximate checks in brackets):
  - **Retired** to `.private/e2e/scenarios/retired/` (≈67 checks): `01-upgrade` [16], `05-migration-failure` [13], `08-migration-message-visible` [4], `dg-12-migrate-v1` [11], `dg-12b-migrate-resume` [11], `dg-13-migration-failure` [8], `dg-34-legacy-keys` [4] (it pins the stale-legacy-key cleanup that lived in `migrateToWidgets`; decision 2 drops that cleanup).
  - **Trimmed** (the groups that assert a migration outcome go, the rest stays): `14-modal-upgrade` (AS-6, AS-9b, AS-9c, `v2UpgradeDiff`, `buildFromRef("main-845f29e")`; ≈12 checks), `dg-57-centered-grid` (groups 8, 9, 10 and the migration half of 16; ≈23), `09-weather-ensure` (AS-29 "meta v3 without columns"; ≈3), `dg-56-first-run-empty-desk` (AS-FE-07 g "failed migration locked state"; 1).
  - **Re-seeded**: nine scenarios build their profile with the harness helper `widgetStorage` (a **v1** meta with `columns`/`position`) and rely on the boot migration to get a grid: `09`, `10`, `12`, `13`, `14` (the surviving groups), `15`, `dg-56`, `dg-62`, `dg-63`. They move to `widgetStorageV3` with a v3 layout that puts the same tiles in the same displayed cells at the width the scenario uses, so their assertions do not change; any assertion that depended on the old v1 packing (for example `10` AS-21e "5 favorites in row 1") is re-derived from the new seed and listed in the implementer's report.
  - **Unchanged**: `dg-14-newer-meta` (its old-build part uses `buildFromRef` and `widgetStorageV2`, both kept), `dg-28`, `dg-55`, `dg-58`, `dg-60`, `dg-64`.
  - **New**: `dg-81-old-data-ignored.mjs` (AS-RM-02, AS-RM-03).
  - **Harness**: delete `legacyStorage` (after `dg-14` keeps no user of it), `widgetStorageP2`, and, once no scenario imports it, the v1 `widgetStorage` with its `columns`/`position` options; keep `legacyFavorite` (base of `favV2`/`favV3`), `widgetStorageV2`/`favV2`, `buildFromRef` and the fault helpers; grep users before deleting `removeStorageAreaInit` and `clearStorageFault`.
- Docs: `agent-config/CLAUDE.md` (Architecture: store API line and `desktopLayout` line; "Widgets storage sharding" bootstrap steps 1–3 and the lock paragraph; the "existing migration code stays until a separate task" bullet of the policy and the "(legacy → v1 → v2 → v3)" mention), `docs/architecture.md` (Bootstrap steps 1–3, the v1 → v2 absent-id remark, the locked-state paragraph, module table rows), `docs/centered-grid.md` and the other specs that describe the migration get a one-line "migration removed in run 40" note under their Status only when their text claims the code exists, `CHANGELOG.md` `[Unreleased]`, backlog 37 closed, roadmap R40 struck.

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
- Then: the desk shows the six default tiles (a fresh install), no link from the legacy data; the three legacy keys are byte-identical afterwards; `quietTabWidgetsMeta` is a valid v3 meta.
- Verified by: E2E `dg-81-old-data-ignored.mjs`.

### AS-RM-03 A v1 or v2 widgets meta is read-only, never written or migrated
- Given: `sync` holds a valid v2 meta (and, in a second run, a valid v1 meta) with items.
- When: open a new tab; try to add a link where the page allows it.
- Then: the stored meta and items are byte-identical afterwards (nothing migrated, ensured or deleted); the page does not throw (no console error) and shows the same state it shows for a malformed meta (L1-02 undecided; this scenario compares the two, not a text).
- Verified by: E2E `dg-81-old-data-ignored.mjs`.

### AS-RM-04 A newer meta still locks read-only
- Given: a meta with `version: 99`.
- When: open a new tab.
- Then: the newer-version message, the grid locked, nothing written (as before).
- Verified by: E2E `dg-14-newer-meta.mjs` (unchanged).

### AS-RM-05 The bootstrap has no migration step
- Given: the source of `newtab.js`.
- When: `npm test`.
- Then: pins show the order early `newer` check → `ensureWidgetsLayout` → `getState`; no `migrateToWidgets|migrateWidgetsToV2|migrateWidgetsToV3|widgetsMigrationFailed` anywhere in `src/`.
- Verified by: `test/newtabSource.test.js`.

### AS-RM-06 The store API surface
- Given: `src/widgetsStore.js`.
- When: `npm test`.
- Then: `inspectWidgetsMeta` returns only `missing|valid|newer|invalid` (a v1 or v2 meta is `invalid`); `assertWritable` refuses `newer` and `invalid` and never mentions an upgrade in progress; `ensureWidgetsLayout` still writes for `valid` and `missing` only; `createWidgetsStore` behaviour on a valid v3 meta is byte-for-byte the same.
- Verified by: unit tests in `test/widgetsStore.test.js`.

### AS-RM-07 The suite got smaller and nothing else went red
- Given: the full E2E before (this run's baseline on `main`) and after.
- When: run both with `--base origin/main`.
- Then: every remaining scenario is green (or red only as `permissions.md` allows); the report states checks and wall time before and after, and the list of retired scenarios.
- Verified by: stage 5 verifier report.

## Review focus

- Scenarios/states: a seeded old meta must not write anything, anywhere (the old code wrote on every boot).
- Visual/layout: none (no UI change); one look at a v3 desk for sameness.
- Accessibility/texts: the deleted message strings must not be reachable from any state.

## Accepted exceptions

- A profile with a v1 or v2 widgets meta sees the same empty read-only desk as with a malformed meta until L1-02 decides the text. Reason: no users (owner policy); the only installs that could have such a meta are development profiles, which a reinstall clears.
- Orphaned legacy keys stay in the profile's storage. Reason: erasing is new code with no user to benefit.
