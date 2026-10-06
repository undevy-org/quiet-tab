// src/widgetsStore.js
import { createMutationLock } from "./mutationLock.js";
import {
  cloneValue,
  hasOwnFields,
  isNonEmptyString,
  isParseableTimestamp,
  isRecord
} from "./storeUtils.js";
import {
  BACKGROUND_COLOR_SOURCES,
  HEX_COLOR_VALIDATION_PATTERN,
  ICON_MODES,
  TILE_SIZES
} from "./favoritesShared.js";
import {
  GRID_POSITIONS,
  MAX_CHROME_WIDGETS,
  MAX_FAVORITE_WIDGETS,
  MAX_GRID_COLUMNS,
  MAX_WEATHER_METRIC_WIDGETS,
  MAX_WIDGETS,
  MIN_GRID_COLUMNS,
  NEWER_WIDGETS_MESSAGE,
  WEATHER_METRIC_IDS,
  WIDGETS_MUTATION_LOCK_NAME,
  WIDGET_TYPES
} from "./widgetsShared.js";
import { defaultColumnsForItems } from "./widgetsLayout.js";
import { CHROME_IDS, centerShift, isValidGrid, isValidGridV2, migrateV1ToV2, placeMissing } from "./desktopLayout.js";

export const WIDGETS_META_KEY = "quietTabWidgetsMeta";
// A v1 or v2 meta (an upgrade in progress, possibly from another device) or an unreadable meta is never written over.
export const V1_WIDGETS_MESSAGE = "Your saved widgets are still being updated to the new layout. Reload this tab to finish.";
export const INVALID_WIDGETS_MESSAGE =
  "Your saved widgets data could not be read, so changes are paused. Reload this tab; if this keeps happening, update Quiet Tab.";

// One lock instance for the whole extension: every widgets mutation AND the migrations
// run through it, so two new-tab pages can never interleave read-modify-write cycles.
export const withWidgetsMutationLock = createMutationLock(WIDGETS_MUTATION_LOCK_NAME);

// Layout version 3: a stored `grid.x` is signed and counts from the center line (docs/centered-grid.md). Version 2 counted
// from the left column and exists only to be migrated; version 1 is the pre-desktop layout.
const WIDGETS_VERSION = 3;
const WIDGETS_VERSION_V2 = 2;
const WIDGETS_VERSION_V1 = 1;
const SYNC_WRITE_ERROR =
  "Couldn't save this change to Chrome Sync — it may be full, offline, or temporarily unavailable. Try removing a few favorites or try again shortly.";

export function widgetItemStorageKey(id) {
  return `quietTabWidget:${id}`;
}

export function createInitialWidgetsState(now = new Date().toISOString()) {
  return { version: WIDGETS_VERSION, items: [], createdAt: now, updatedAt: now };
}

function isHttpUrl(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isCustomIconUrl(value) {
  return value === null || isHttpUrl(value);
}

function isOptionalTileSize(value) {
  return !Object.hasOwn(value, "tileSize") || TILE_SIZES.has(value.tileSize);
}

function isFavoriteWidgetItem(value) {
  const requiredFields = [
    "id",
    "type",
    "url",
    "label",
    "domain",
    "iconMode",
    "customIconUrl",
    "backgroundColor",
    "backgroundColorSource",
    "createdAt",
    "updatedAt"
  ];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.type === "favorite" &&
    isNonEmptyString(value.id) &&
    isHttpUrl(value.url) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.domain) &&
    ICON_MODES.has(value.iconMode) &&
    isCustomIconUrl(value.customIconUrl) &&
    isOptionalTileSize(value) &&
    typeof value.backgroundColor === "string" &&
    HEX_COLOR_VALIDATION_PATTERN.test(value.backgroundColor) &&
    BACKGROUND_COLOR_SOURCES.has(value.backgroundColorSource) &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

// v1 items carry `tileSize`; v2 items do not (it stays optional so migrated items can keep it for one release).
function isWeatherMetricItem(value) {
  return (
    hasOwnFields(value, ["id", "type", "enabled"]) &&
    value.type === "weather-metric" &&
    WEATHER_METRIC_IDS.includes(value.id) &&
    isOptionalTileSize(value) &&
    typeof value.enabled === "boolean"
  );
}

const CHROME_ROLE_BY_ID = { [CHROME_IDS.settings]: "settings", [CHROME_IDS.add]: "add" };

function isChromeItem(value) {
  return (
    hasOwnFields(value, ["id", "type", "role"]) &&
    value.type === "chrome" &&
    CHROME_ROLE_BY_ID[value.id] === value.role
  );
}

// Field-level validity. The grid is checked separately: reads tolerate a missing/invalid grid (spec § Reading grid).
export function isWidgetItem(value) {
  if (!isRecord(value) || !WIDGET_TYPES.has(value.type)) {
    return false;
  }
  if (value.type === "favorite") return isFavoriteWidgetItem(value);
  if (value.type === "weather-metric") return isWeatherMetricItem(value);
  return isChromeItem(value);
}

function hasGrid(item, gridCheck) {
  return gridCheck(item.grid) && (item.type !== "chrome" || (item.grid.w === 1 && item.grid.h === 1));
}

// v3 reads and writes use the signed grid check; the v1 -> v2 and v2 -> v3 steps read with the non-negative v2 check.
const hasValidGrid = (item) => hasGrid(item, isValidGrid);
const hasValidGridV2 = (item) => hasGrid(item, isValidGridV2);

function isStrictWidgetItem(value) {
  return isWidgetItem(value) && hasValidGrid(value);
}

function isStrictWidgetItemV2(value) {
  return isWidgetItem(value) && hasValidGridV2(value);
}

function countOf(items, type) {
  return items.filter((item) => item?.type === type).length;
}

// `lenient` is for reads: items may lack a valid grid. Writes (setState) are strict: every item has one.
function isWidgetsStateWith(value, itemCheck, version = WIDGETS_VERSION) {
  const requiredFields = ["version", "items", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === version &&
    Array.isArray(value.items) &&
    value.items.length <= MAX_WIDGETS &&
    countOf(value.items, "favorite") <= MAX_FAVORITE_WIDGETS &&
    countOf(value.items, "weather-metric") <= MAX_WEATHER_METRIC_WIDGETS &&
    countOf(value.items, "chrome") <= MAX_CHROME_WIDGETS &&
    new Set(value.items.map((item) => item?.id)).size === value.items.length &&
    value.items.every(itemCheck) &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

export function isWidgetsState(value) {
  return isWidgetsStateWith(value, isStrictWidgetItem);
}

// The v2 state the v1 -> v2 step builds (non-negative x, version 2).
function isWidgetsStateV2(value) {
  return isWidgetsStateWith(value, isStrictWidgetItemV2, WIDGETS_VERSION_V2);
}

function isWidgetsMetaOfVersion(value, version) {
  const requiredFields = ["version", "order", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === version &&
    Array.isArray(value.order) &&
    value.order.length <= MAX_WIDGETS &&
    value.order.every(isNonEmptyString) &&
    new Set(value.order).size === value.order.length &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

const isWidgetsMeta = (value) => isWidgetsMetaOfVersion(value, WIDGETS_VERSION);
const isWidgetsMetaV2 = (value) => isWidgetsMetaOfVersion(value, WIDGETS_VERSION_V2);

function isColumns(value) {
  return Number.isInteger(value) && value >= MIN_GRID_COLUMNS && value <= MAX_GRID_COLUMNS;
}

// The pre-desktop (version 1) meta: still read by the v1 -> v2 migration.
function isWidgetsMetaV1(value) {
  const requiredFields = ["version", "order", "columns", "position", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION_V1 &&
    Array.isArray(value.order) &&
    value.order.length <= MAX_FAVORITE_WIDGETS + MAX_WEATHER_METRIC_WIDGETS &&
    value.order.every(isNonEmptyString) &&
    new Set(value.order).size === value.order.length &&
    isColumns(value.columns) &&
    GRID_POSITIONS.has(value.position) &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

function isWidgetsStateV1(value) {
  const requiredFields = ["version", "items", "columns", "position", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION_V1 &&
    Array.isArray(value.items) &&
    value.items.length <= MAX_FAVORITE_WIDGETS + MAX_WEATHER_METRIC_WIDGETS &&
    countOf(value.items, "favorite") <= MAX_FAVORITE_WIDGETS &&
    countOf(value.items, "weather-metric") <= MAX_WEATHER_METRIC_WIDGETS &&
    new Set(value.items.map((item) => item?.id)).size === value.items.length &&
    value.items.every((item) => isWidgetItem(item) && item.type !== "chrome") &&
    isColumns(value.columns) &&
    GRID_POSITIONS.has(value.position) &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

function buildWidgetsMeta(state, version = WIDGETS_VERSION) {
  return {
    version,
    order: state.items.map((item) => item.id),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
}

function buildWidgetsMetaV1(state) {
  return {
    version: WIDGETS_VERSION_V1,
    order: state.items.map((item) => item.id),
    columns: state.columns,
    position: state.position,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
}

// `result` is what storageArea.get(WIDGETS_META_KEY) returned.
// missing | valid (v3) | v2 (valid left-based desktop meta, to be shifted to the center) | v1 (valid pre-desktop meta, to be
// migrated) | newer (version above ours) | invalid
export function inspectWidgetsMeta(result) {
  if (!Object.hasOwn(result ?? {}, WIDGETS_META_KEY)) {
    return "missing";
  }
  const raw = result[WIDGETS_META_KEY];
  if (isWidgetsMeta(raw)) {
    return "valid";
  }
  if (isWidgetsMetaV2(raw)) {
    return "v2";
  }
  if (isWidgetsMetaV1(raw)) {
    return "v1";
  }
  if (isRecord(raw) && Number.isInteger(raw.version) && raw.version > WIDGETS_VERSION) {
    return "newer";
  }
  return "invalid";
}

async function readMeta(storageArea) {
  const result = await storageArea.get(WIDGETS_META_KEY);
  const meta = result?.[WIDGETS_META_KEY];
  return isWidgetsMeta(meta) ? meta : null;
}

async function setOrThrow(storageArea, payload) {
  try {
    await storageArea.set(payload);
  } catch (cause) {
    throw new Error(SYNC_WRITE_ERROR, { cause });
  }
}

// A read keeps an item whose fields are valid but whose grid is missing or malformed: the grid is dropped and
// the item is "unplaced" (displayLayout gives it a cell). A read never deletes a key.
function readItemWith(value, gridCheck) {
  if (!isWidgetItem(value)) return null;
  if (value.grid === undefined || gridCheck(value)) return value;
  const { grid: _dropped, ...rest } = value;
  return rest;
}
const readItem = (value) => readItemWith(value, hasValidGrid);
// The v2 -> v3 step reads items as v2 wrote them: a negative x was never valid there (decision 7).
const readItemV2 = (value) => readItemWith(value, hasValidGridV2);

export function createWidgetsStore(
  storageArea,
  { now = () => new Date().toISOString() } = {}
) {
  // Only a valid v3 meta or none at all may be written. Anything else reads as an empty state, so a write from it
  // would replace the stored layout with just the affected items and orphan every other widget.
  async function assertWritable() {
    const kind = inspectWidgetsMeta(await storageArea.get(WIDGETS_META_KEY));
    if (kind === "newer") throw new Error(NEWER_WIDGETS_MESSAGE);
    if (kind === "v1" || kind === "v2") throw new Error(V1_WIDGETS_MESSAGE);
    if (kind === "invalid") throw new Error(INVALID_WIDGETS_MESSAGE);
  }

  return {
    assertWritable,

    // Items may lack `grid` (unplaced); callers lay them out with displayLayout. Order is `meta.order`.
    async getState() {
      const meta = await readMeta(storageArea);

      if (!meta) {
        return createInitialWidgetsState(now());
      }

      const itemKeys = meta.order.map(widgetItemStorageKey);
      const itemsResult = itemKeys.length > 0 ? await storageArea.get(itemKeys) : {};
      const items = meta.order
        .map((id) => readItem(itemsResult[widgetItemStorageKey(id)]))
        .filter((item) => item !== null);

      const candidate = {
        version: WIDGETS_VERSION,
        items,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt
      };
      return isWidgetsStateWith(candidate, isWidgetItem)
        ? cloneValue(candidate)
        : createInitialWidgetsState(now());
    },

    async setState(state) {
      if (!isWidgetsState(state)) {
        throw new Error("Invalid widgets state");
      }
      await assertWritable();

      const nextState = cloneValue(state);
      const previousMeta = await readMeta(storageArea);
      const previousOrder = previousMeta?.order ?? [];
      const nextIds = new Set(nextState.items.map((item) => item.id));
      const removedIds = previousOrder.filter((id) => !nextIds.has(id));

      const writePayload = { [WIDGETS_META_KEY]: buildWidgetsMeta(nextState) };
      for (const item of nextState.items) {
        writePayload[widgetItemStorageKey(item.id)] = item;
      }

      await setOrThrow(storageArea, writePayload);

      if (removedIds.length > 0) {
        await storageArea.remove(removedIds.map(widgetItemStorageKey));
      }

      return cloneValue(nextState);
    },

    async clearState() {
      const meta = await readMeta(storageArea);
      const order = meta?.order ?? [];
      await storageArea.remove([WIDGETS_META_KEY, ...order.map(widgetItemStorageKey)]);
    }
  };
}

// Migration from the pre-unification favorites-only storage.
//
// Legacy keys are read only here. Rules (see the spec's "Migration" section):
//  - a valid quietTabWidgetsMeta is authoritative and is never overwritten;
//  - writes are chunked and the meta is written LAST, so the total sync quota
//    (100KB) is never exceeded and an interrupted run simply resumes;
//  - the whole thing runs under the shared mutation lock.
// ---------------------------------------------------------------------------
const LEGACY_FAVORITES_BLOB_KEY = "quietTabFavorites";
const LEGACY_FAVORITES_META_KEY = "quietTabFavoritesMeta";
const legacyFavoriteItemStorageKey = (id) => `quietTabFavorite:${id}`;
const MIGRATION_CHUNK_SIZE = 25;

function tagFavorite(item) {
  return isRecord(item) ? { ...item, type: "favorite" } : item;
}

function uniqueValidItems(candidates) {
  const seen = new Set();
  const items = [];

  for (const candidate of candidates) {
    if (!isWidgetItem(candidate) || seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    items.push(candidate);
    if (items.length === MAX_FAVORITE_WIDGETS) {
      break;
    }
  }

  return items;
}

async function writeMigratedState(storageArea, state, legacyItemKeyFor) {
  if (!isWidgetsStateV1(state)) {
    throw new Error("Invalid widgets state");
  }

  for (let start = 0; start < state.items.length; start += MIGRATION_CHUNK_SIZE) {
    const chunk = state.items.slice(start, start + MIGRATION_CHUNK_SIZE);
    await setOrThrow(
      storageArea,
      Object.fromEntries(chunk.map((item) => [widgetItemStorageKey(item.id), item]))
    );
    if (legacyItemKeyFor) {
      await storageArea.remove(chunk.map((item) => legacyItemKeyFor(item.id)));
    }
  }

  await setOrThrow(storageArea, { [WIDGETS_META_KEY]: buildWidgetsMetaV1(state) });
}

export function migrateToWidgets(
  localStorageArea,
  syncStorageArea,
  { now = () => new Date().toISOString() } = {}
) {
  return withWidgetsMutationLock(async () => {
    const widgetsMetaResult = await syncStorageArea.get(WIDGETS_META_KEY);
    const metaKind = inspectWidgetsMeta(widgetsMetaResult);
    if (metaKind === "newer") {
      return { migrated: false, newer: true };
    }
    const existingMeta =
      metaKind === "valid" || metaKind === "v2" || metaKind === "v1" ? widgetsMetaResult[WIDGETS_META_KEY] : null;

    const legacyMetaResult = await syncStorageArea.get(LEGACY_FAVORITES_META_KEY);
    const legacyMeta = legacyMetaResult?.[LEGACY_FAVORITES_META_KEY];
    const legacyIds =
      isRecord(legacyMeta) && Array.isArray(legacyMeta.order)
        ? [...new Set(legacyMeta.order.filter(isNonEmptyString))]
        : null;

    const blobResult = await localStorageArea.get(LEGACY_FAVORITES_BLOB_KEY);
    const hasBlob = Object.hasOwn(blobResult ?? {}, LEGACY_FAVORITES_BLOB_KEY);

    if (existingMeta) {
      // Widgets are authoritative. Whatever legacy data is still around is a stale
      // duplicate (an interrupted earlier run, or an older-version device syncing it
      // back) and only consumes sync quota.
      if (legacyIds === null && !hasBlob) {
        return { migrated: false };
      }
      if (legacyIds !== null) {
        await syncStorageArea.remove([
          LEGACY_FAVORITES_META_KEY,
          ...legacyIds.map(legacyFavoriteItemStorageKey)
        ]);
      }
      if (hasBlob) {
        await localStorageArea.remove(LEGACY_FAVORITES_BLOB_KEY);
      }
      return { migrated: false, discardedStale: true };
    }

    if (legacyIds !== null) {
      const legacyItems = await syncStorageArea.get(legacyIds.map(legacyFavoriteItemStorageKey));
      const resumedItems = await syncStorageArea.get(legacyIds.map(widgetItemStorageKey));

      const items = uniqueValidItems(
        legacyIds.map((id) => {
          const resumed = resumedItems[widgetItemStorageKey(id)];
          return isWidgetItem(resumed)
            ? resumed
            : tagFavorite(legacyItems[legacyFavoriteItemStorageKey(id)]);
        })
      );

      const nowValue = now();
      await writeMigratedState(
        syncStorageArea,
        {
          version: WIDGETS_VERSION_V1,
          items,
          columns: defaultColumnsForItems(items),
          position: "top",
          createdAt: isParseableTimestamp(legacyMeta.createdAt) ? legacyMeta.createdAt : nowValue,
          updatedAt: nowValue
        },
        legacyFavoriteItemStorageKey
      );

      await syncStorageArea.remove([
        LEGACY_FAVORITES_META_KEY,
        ...legacyIds.map(legacyFavoriteItemStorageKey)
      ]);
      return { migrated: true, source: "sharded-favorites" };
    }

    if (!hasBlob) {
      return { migrated: false };
    }

    const legacyBlob = blobResult[LEGACY_FAVORITES_BLOB_KEY];
    const rawItems =
      isRecord(legacyBlob) && Array.isArray(legacyBlob.items) ? legacyBlob.items : null;
    const taggedItems = rawItems?.map(tagFavorite);
    const isValidBlob =
      rawItems !== null &&
      rawItems.length <= MAX_FAVORITE_WIDGETS &&
      taggedItems.every(isWidgetItem) &&
      isParseableTimestamp(legacyBlob.createdAt) &&
      isParseableTimestamp(legacyBlob.updatedAt);

    if (!isValidBlob) {
      await localStorageArea.remove(LEGACY_FAVORITES_BLOB_KEY);
      return { migrated: false, discardedCorrupt: true };
    }

    const items = uniqueValidItems(taggedItems);
    await writeMigratedState(
      syncStorageArea,
      {
        version: WIDGETS_VERSION_V1,
        items,
        columns: defaultColumnsForItems(items),
        position: "top",
        createdAt: legacyBlob.createdAt,
        updatedAt: now()
      },
      null
    );

    await localStorageArea.remove(LEGACY_FAVORITES_BLOB_KEY);
    return { migrated: true, source: "legacy-blob" };
  });
}

// ---------------------------------------------------------------------------
// Migration widgets v1 -> v2 (desktop grid). Spec § Migration v1 → v2.
//
// Under the shared mutation lock. Writes items in chunks of 25 (each with its `grid`; the legacy
// `tileSize` stays on migrated items for one release), then the two chrome items, then the v2 meta LAST.
// This step writes version 2 explicitly (grids counted from the left column); the v2 -> v3 step below centers them.
// Until the meta is v2 the whole run repeats; items that already carry a valid grid are kept as placed
// and the rest is packed by the same first-free rule, so a resumed run equals an uninterrupted one.
// ---------------------------------------------------------------------------
const CHROME_STORAGE_KEYS = Object.values(CHROME_IDS).map(widgetItemStorageKey);

export function migrateWidgetsToV2(storageArea, { now = () => new Date().toISOString() } = {}) {
  return withWidgetsMutationLock(async () => {
    const metaResult = await storageArea.get(WIDGETS_META_KEY);
    const kind = inspectWidgetsMeta(metaResult);
    if (kind !== "v1") {
      return { migrated: false, meta: kind };
    }
    const meta = metaResult[WIDGETS_META_KEY];

    const itemsResult = meta.order.length > 0 ? await storageArea.get(meta.order.map(widgetItemStorageKey)) : {};
    const listed = meta.order
      .map((id) => itemsResult[widgetItemStorageKey(id)])
      .filter((item) => isWidgetItem(item) && item.type !== "chrome");
    // A listed id whose key has not synced yet (absent, not invalid) stays in the v2 order after the written items:
    // getState skips it until the key arrives, then reads it unplaced. Dropping it would lose that widget everywhere.
    const chromeIdSet = new Set(Object.values(CHROME_IDS));
    const absentIds = meta.order.filter((id) => !chromeIdSet.has(id) && !Object.hasOwn(itemsResult, widgetItemStorageKey(id)));
    // v1 order: links first, then weather metrics (the v1 store grouped them on read).
    const v1Items = [
      ...listed.filter((item) => item.type === "favorite"),
      ...listed.filter((item) => item.type === "weather-metric")
    ].map((item) => (hasValidGridV2(item) ? item : { ...item, grid: undefined }));

    const chromeResult = await storageArea.get(CHROME_STORAGE_KEYS);
    const chromeItems = CHROME_STORAGE_KEYS.map((key) => chromeResult[key]).filter(isStrictWidgetItemV2);

    const grids = migrateV1ToV2([...v1Items, ...chromeItems], meta.columns);
    const withGrid = (item) => ({ ...item, grid: grids.get(item.id) });
    const chromeFor = (id) => ({ id, type: "chrome", role: CHROME_ROLE_BY_ID[id], grid: grids.get(id) });
    const items = [
      ...v1Items.map(withGrid),
      ...Object.values(CHROME_IDS).map(chromeFor)
    ];

    const timestamp = now();
    const state = { version: WIDGETS_VERSION_V2, items, createdAt: meta.createdAt, updatedAt: timestamp };
    if (!isWidgetsStateV2(state)) {
      throw new Error("Invalid widgets state");
    }

    for (let start = 0; start < items.length; start += MIGRATION_CHUNK_SIZE) {
      const chunk = items.slice(start, start + MIGRATION_CHUNK_SIZE);
      await setOrThrow(
        storageArea,
        Object.fromEntries(chunk.map((item) => [widgetItemStorageKey(item.id), item]))
      );
    }
    const v2Meta = buildWidgetsMeta(state, WIDGETS_VERSION_V2);
    await setOrThrow(storageArea, { [WIDGETS_META_KEY]: { ...v2Meta, order: [...v2Meta.order, ...absentIds] } });
    return { migrated: true };
  });
}

// ---------------------------------------------------------------------------
// Migration widgets v2 -> v3 (centered grid). docs/centered-grid.md decision 7.
//
// Under the shared mutation lock, only for a valid v2 meta (re-read inside the lock, so of two tabs opening at once only
// the first migrates). Items are read like v2 wrote them (non-negative x; an invalid item is neither rewritten nor deleted;
// an id whose key has not synced yet is simply absent and stays in `order`). The bounding columns of the on-grid items are
// centered once (`centerShift`); every readable item with a grid, hidden metrics included, gets x + shift. Everything goes
// out in ONE set() call (items and the v3 meta), so storage is either fully v2 or fully v3. A rejected write leaves it as it
// was and the next load retries.
// ---------------------------------------------------------------------------
export function migrateWidgetsToV3(storageArea, { now = () => new Date().toISOString() } = {}) {
  return withWidgetsMutationLock(async () => {
    const metaResult = await storageArea.get(WIDGETS_META_KEY);
    const kind = inspectWidgetsMeta(metaResult);
    if (kind !== "v2") {
      return { migrated: false, meta: kind };
    }
    const meta = metaResult[WIDGETS_META_KEY];

    const itemsResult = meta.order.length > 0 ? await storageArea.get(meta.order.map(widgetItemStorageKey)) : {};
    const readable = meta.order
      .map((id) => ({ id, item: readItemV2(itemsResult[widgetItemStorageKey(id)]) }))
      .filter(({ item }) => item !== null);
    const shift = centerShift(readable.map(({ item }) => item));

    const timestamp = now();
    const items = readable.map(({ item }) => (item.grid ? { ...item, grid: { ...item.grid, x: item.grid.x + shift } } : item));
    const state = { version: WIDGETS_VERSION, items, createdAt: meta.createdAt, updatedAt: timestamp };
    if (!isWidgetsStateWith(state, isWidgetItem)) {
      throw new Error("Invalid widgets state");
    }

    const payload = {
      [WIDGETS_META_KEY]: { version: WIDGETS_VERSION, order: [...meta.order], createdAt: meta.createdAt, updatedAt: timestamp }
    };
    readable.forEach(({ id }, index) => {
      payload[widgetItemStorageKey(id)] = items[index];
    });
    await setOrThrow(storageArea, payload);
    return { migrated: true };
  });
}

// ---------------------------------------------------------------------------
// ensureWidgetsLayout: fresh-install defaults and self-heal (replaces ensureWeatherMetrics).
// Lays out any missing weather metric and chrome tile as one contiguous block nearest the center of 12 reference columns.
// Writes only for a `valid` (v3) or `missing` meta; `newer`, `invalid` and un-migrated `v1` / `v2` are left alone.
// Item keys are written before the meta; idempotent.
// ---------------------------------------------------------------------------
const ENSURED_IDS = [...WEATHER_METRIC_IDS, CHROME_IDS.settings, CHROME_IDS.add];

export function ensureWidgetsLayout(storageArea, { now = () => new Date().toISOString() } = {}) {
  return withWidgetsMutationLock(async () => {
    const metaResult = await storageArea.get(WIDGETS_META_KEY);
    const kind = inspectWidgetsMeta(metaResult);
    if (kind !== "valid" && kind !== "missing") {
      return { changed: false, meta: kind };
    }

    const timestamp = now();
    const meta =
      kind === "valid"
        ? metaResult[WIDGETS_META_KEY]
        : { version: WIDGETS_VERSION, order: [], createdAt: timestamp, updatedAt: timestamp };

    const keys = [...new Set([...meta.order, ...ENSURED_IDS])].map(widgetItemStorageKey);
    const stored = await storageArea.get(keys);
    const readable = (id) => readItem(stored[widgetItemStorageKey(id)]);
    const existing = [...new Set([...meta.order, ...ENSURED_IDS])].map(readable).filter((item) => item !== null);

    const listed = new Set(meta.order);
    const absent = ENSURED_IDS.filter((id) => readable(id) === null);
    const unlisted = ENSURED_IDS.filter((id) => !listed.has(id));
    if (absent.length === 0 && unlisted.length === 0) {
      return { changed: false, meta: kind };
    }

    const spots = placeMissing(absent, existing);
    const itemWrites = {};
    for (const id of absent) {
      const grid = spots.get(id);
      itemWrites[widgetItemStorageKey(id)] = id.startsWith("weather:")
        ? { id, type: "weather-metric", enabled: true, grid }
        : { id, type: "chrome", role: CHROME_ROLE_BY_ID[id], grid };
    }

    if (Object.keys(itemWrites).length > 0) {
      await setOrThrow(storageArea, itemWrites);
    }
    await setOrThrow(storageArea, {
      [WIDGETS_META_KEY]: { ...meta, order: [...meta.order, ...unlisted], updatedAt: timestamp }
    });
    return { changed: true, meta: kind };
  });
}
