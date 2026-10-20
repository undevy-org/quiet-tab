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
  MAX_CHROME_WIDGETS,
  MAX_FAVORITE_WIDGETS,
  MAX_WEATHER_METRIC_WIDGETS,
  MAX_WIDGETS,
  NEWER_WIDGETS_MESSAGE,
  WEATHER_METRIC_IDS,
  WIDGETS_MUTATION_LOCK_NAME,
  WIDGET_TYPES
} from "./widgetsShared.js";
import { CHROME_IDS, isValidGrid, placeMissing } from "./desktopLayout.js";

export const WIDGETS_META_KEY = "quietTabWidgetsMeta";
// A meta from a newer version or an unreadable meta is never written over.
export const INVALID_WIDGETS_MESSAGE =
  "Your saved grid could not be read, so changes are paused. Reload this tab; if this keeps happening, update Quiet Tab.";

// One lock instance for the whole extension: every widgets mutation AND the layout self-heal
// run through it, so two new-tab pages can never interleave read-modify-write cycles.
export const withWidgetsMutationLock = createMutationLock(WIDGETS_MUTATION_LOCK_NAME);

// Layout version 3: a stored `grid.x` is signed and counts from the center line (docs/centered-grid.md).
// Any other version below it reads as `invalid` (the earlier layouts are no longer supported).
const WIDGETS_VERSION = 3;
const SYNC_WRITE_ERROR =
  "Couldn't save this change to Chrome Sync — it may be full, offline, or temporarily unavailable. Try removing a few links or try again shortly.";

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

// `tileSize` is a legacy optional field: items that carry it stay valid (sizeOf reads it for items without a grid).
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

// Reads and writes use the signed grid check; a chrome tile is always 1x1.
function hasValidGrid(item) {
  return isValidGrid(item.grid) && (item.type !== "chrome" || (item.grid.w === 1 && item.grid.h === 1));
}

function isStrictWidgetItem(value) {
  return isWidgetItem(value) && hasValidGrid(value);
}

function countOf(items, type) {
  return items.filter((item) => item?.type === type).length;
}

// `lenient` is for reads: items may lack a valid grid. Writes (setState) are strict: every item has one.
function isWidgetsStateWith(value, itemCheck) {
  const requiredFields = ["version", "items", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION &&
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

function isWidgetsMeta(value) {
  const requiredFields = ["version", "order", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION &&
    Array.isArray(value.order) &&
    value.order.length <= MAX_WIDGETS &&
    value.order.every(isNonEmptyString) &&
    new Set(value.order).size === value.order.length &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

function buildWidgetsMeta(state) {
  return {
    version: WIDGETS_VERSION,
    order: state.items.map((item) => item.id),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
}

// `result` is what storageArea.get(WIDGETS_META_KEY) returned.
// missing | valid (v3) | newer (version above ours) | invalid (anything else, including a v1 or v2 meta)
export function inspectWidgetsMeta(result) {
  if (!Object.hasOwn(result ?? {}, WIDGETS_META_KEY)) {
    return "missing";
  }
  const raw = result[WIDGETS_META_KEY];
  if (isWidgetsMeta(raw)) {
    return "valid";
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
function readItem(value) {
  if (!isWidgetItem(value)) return null;
  if (value.grid === undefined || hasValidGrid(value)) return value;
  const { grid: _dropped, ...rest } = value;
  return rest;
}

export function createWidgetsStore(
  storageArea,
  { now = () => new Date().toISOString() } = {}
) {
  // Only a valid v3 meta or none at all may be written. Anything else reads as an empty state, so a write from it
  // would replace the stored layout with just the affected items and orphan every other widget.
  async function assertWritable() {
    const kind = inspectWidgetsMeta(await storageArea.get(WIDGETS_META_KEY));
    if (kind === "newer") throw new Error(NEWER_WIDGETS_MESSAGE);
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
        throw new Error("Invalid grid state");
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

// ---------------------------------------------------------------------------
// ensureWidgetsLayout: fresh-install defaults and self-heal (replaces ensureWeatherMetrics).
// Lays out any missing weather metric and chrome tile as one contiguous block nearest the center of 12 reference columns.
// Writes only for a `valid` (v3) or `missing` meta; `newer` and `invalid` (a v1 or v2 meta included) are left alone.
// Item keys are written before the meta; idempotent.
// Optional `screen` = { rows, columns } (the first screen of this boot, `newtab.js` `firstScreen()`): when ALL six system items are
// absent (the first appearance), the block is centered vertically in it (docs/vertically-centered-defaults.md); `placeMissing`
// validates it. A partial self-heal, or no / an invalid `screen`, keeps the row-0 rule. `y` is never recomputed later.
// ---------------------------------------------------------------------------
const ENSURED_IDS = [...WEATHER_METRIC_IDS, CHROME_IDS.settings, CHROME_IDS.add];

export function ensureWidgetsLayout(storageArea, { now = () => new Date().toISOString(), screen } = {}) {
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

    const spots = placeMissing(absent, existing, screen);
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
