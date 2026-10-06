
// src/desktopLayout.js — pure grid engine: no DOM, no storage. Spec: § Grid metrics, § Display layout, § Placement rules.
// Since layout version 3 (docs/centered-grid.md) a stored `grid.x` is signed and counts from the window's center line:
// displayed column = grid.x + originColumn(C). Everything in this module that takes a "layout" works in DISPLAYED cells;
// `toStored` / `toDisplayed` convert, and `placeMissing` / `centerShift` work on stored grids.
export const MIN_COLUMNS = 2;
export const V1_MAX_COLUMNS = 12; // v1 stored `columns` 1..12 and never more; only migrateV1ToV2 clamps to it
export const REFERENCE_COLUMNS = 12;
export const CHROME_IDS = { settings: "chrome:settings", add: "chrome:add" };

const METRICS = [
  { maxWidth: 360, cell: 56, gap: 6, pad: 8 },
  { maxWidth: 600, cell: 64, gap: 8, pad: 12 },
  { maxWidth: Infinity, cell: 72, gap: 8, pad: 16 }
];

export function gridMetrics(width) {
  return METRICS.find((m) => width <= m.maxWidth);
}

// `width` is document.documentElement.clientWidth (excludes a classic scrollbar). The columns fill the window: no upper bound.
// The count is always even, so the center line of the (centered) grid box is a column boundary exactly in the window's middle;
// a width that would fit an odd count gives one edge column to the margins.
export function effectiveColumns(width) {
  const { cell, gap, pad } = gridMetrics(width);
  const fit = Math.floor((width - 2 * pad + gap) / (cell + gap));
  return Math.max(MIN_COLUMNS, fit - (fit % 2));
}

// The boundary before this column is the center line of the grid; stored `grid.x` counts from it.
export function originColumn(columns) {
  return Math.floor(columns / 2);
}

export const toStored = (grid, columns) => ({ ...grid, x: grid.x - originColumn(columns) });
export const toDisplayed = (grid, columns) => ({ ...grid, x: grid.x + originColumn(columns) });

// Rows that fit the first screen: `height` is document.documentElement.clientHeight, `width` picks the metrics.
export function viewportRows(height, width) {
  const { cell, gap, pad } = gridMetrics(width);
  return Math.max(1, Math.floor((height - 2 * pad + gap) / (cell + gap)));
}

// v3: `x` is any integer (signed, from the center line).
export function isValidGrid(grid) {
  return (
    grid !== null &&
    typeof grid === "object" &&
    Number.isInteger(grid.x) &&
    Number.isInteger(grid.y) && grid.y >= 0 &&
    (grid.w === 1 || grid.w === 2) &&
    (grid.h === 1 || grid.h === 2)
  );
}

// v1/v2: `x` counted from the left column, so it is never negative. The v1/v2 readers (migrateV1ToV2's resume branch,
// the v2 -> v3 step) use this check, not the signed one.
export function isValidGridV2(grid) {
  return isValidGrid(grid) && grid.x >= 0;
}

const cellKey = (x, y) => `${x},${y}`;

function blockFree(occupied, x, y, w, h, columns) {
  if (x < 0 || y < 0 || x + w > columns) return false;
  for (let dx = 0; dx < w; dx += 1) {
    for (let dy = 0; dy < h; dy += 1) {
      if (occupied.has(cellKey(x + dx, y + dy))) return false;
    }
  }
  return true;
}

function mark(occupied, { x, y, w, h }) {
  for (let dx = 0; dx < w; dx += 1) {
    for (let dy = 0; dy < h; dy += 1) occupied.add(cellKey(x + dx, y + dy));
  }
}

// First free w×h block scanning row-major: row `startY` from column `startX`, every later row from column 0.
function firstFree(occupied, w, h, columns, startY = 0, startX = 0) {
  if (w > columns) throw new RangeError("Widget is wider than the grid");
  for (let y = startY; ; y += 1) {
    for (let x = y === startY ? startX : 0; x + w <= columns; x += 1) {
      if (blockFree(occupied, x, y, w, h, columns)) return { x, y, w, h };
    }
  }
}

// The scan start for an item anchored at column `x`: the nearest column that can hold the block.
const clampStart = (x, w, columns) => Math.min(Math.max(0, x), Math.max(0, columns - w));

// New tile: the first row (from 0) that has a free w×h block; in it the block whose center is nearest to the center line
// (`min |x + w/2 - columns/2|`, compared as integers), ties to the right (the larger x).
function nearestFree(occupied, w, h, columns) {
  if (w > columns) throw new RangeError("Widget is wider than the grid");
  for (let y = 0; ; y += 1) {
    let best = null;
    let bestDistance = Infinity;
    for (let x = 0; x + w <= columns; x += 1) {
      if (!blockFree(occupied, x, y, w, h, columns)) continue;
      const distance = Math.abs(2 * x + w - columns);
      if (distance <= bestDistance) {
        best = x;
        bestDistance = distance;
      }
    }
    if (best !== null) return { x: best, y, w, h };
  }
}

// Size of an item: its valid grid, else the legacy tileSize, else 1×1.
export function sizeOf(item) {
  if (isValidGrid(item.grid)) return { w: item.grid.w, h: item.grid.h };
  return item.tileSize === "wide" ? { w: 2, h: 1 } : { w: 1, h: 1 };
}

export function isOnGrid(item) {
  return item.type !== "weather-metric" || item.enabled === true;
}

// Displayed layout = pure function of stored grids and C. Returns Map id -> {x,y,w,h} in DISPLAYED cells. Never persisted
// by itself. `items` is in `order`; hidden metrics are ignored. An item is tried at its anchored cell (stored x + origin);
// if that block is not free it takes the first free block scanning its own row from the nearest column that fits, then the
// rows below from column 0. Items without a valid grid come last and take the new-tile rule (nearest to the center).
export function displayLayout(items, columns) {
  const origin = originColumn(columns);
  const onGrid = items.map((item, index) => ({ item, index })).filter(({ item }) => isOnGrid(item));
  const positioned = onGrid.filter(({ item }) => isValidGrid(item.grid));
  const unplaced = onGrid.filter(({ item }) => !isValidGrid(item.grid));
  positioned.sort((a, b) => a.item.grid.y - b.item.grid.y || a.item.grid.x - b.item.grid.x || a.index - b.index);

  const occupied = new Set();
  const layout = new Map();
  for (const { item } of positioned) {
    const { y, w, h } = item.grid;
    const x = item.grid.x + origin;
    const spot = blockFree(occupied, x, y, w, h, columns) ? { x, y, w, h } : firstFree(occupied, w, h, columns, y, clampStart(x, w, columns));
    mark(occupied, spot);
    layout.set(item.id, spot);
  }
  for (const { item } of unplaced) {
    const { w, h } = sizeOf(item);
    const spot = nearestFree(occupied, w, h, columns);
    mark(occupied, spot);
    layout.set(item.id, spot);
  }
  return layout;
}

function occupancyOf(layout, exceptId) {
  const occupied = new Set();
  for (const [id, grid] of layout) if (id !== exceptId) mark(occupied, grid);
  return occupied;
}

// Highest top row a block of height `h` may take when `id` is dropped. Every row of the first screen (`viewportRows`) is a
// target; below it a block starts at most one row below the lowest other tile; a tile may always stay in its own row (`y0`)
// or move up. A `viewportRows` that is not an integer above 0 only narrows the area (the old rule plus `y0`).
export function maxDropRow(layout, id, h, viewportRows = 0) {
  let lowest = -1;
  for (const [otherId, g] of layout) if (otherId !== id) lowest = Math.max(lowest, g.y + g.h - 1);
  const screen = Number.isInteger(viewportRows) && viewportRows > 0 ? viewportRows - h : 0;
  return Math.max(lowest + 1, screen, layout.get(id)?.y ?? 0);
}

// Drop/resize validity against a displayed layout: inside the columns, no overlap, not below `maxDropRow`.
export function canPlace(layout, id, { x, y, w, h }, columns, viewportRows = 0) {
  return y <= maxDropRow(layout, id, h, viewportRows) && blockFree(occupancyOf(layout, id), x, y, w, h, columns);
}

// Resize: own old block counts as free; keep (x,y) if the new block fits, else the first free block scanning its own row
// from the nearest column that fits (never left of its own column), then the rows below from column 0.
export function placeResized(layout, id, { w, h }, columns) {
  const current = layout.get(id);
  const occupied = occupancyOf(layout, id);
  if (blockFree(occupied, current.x, current.y, w, h, columns)) return { x: current.x, y: current.y, w, h };
  return firstFree(occupied, w, h, columns, current.y, clampStart(current.x, w, columns));
}

// New link / restored metric: the free block nearest to the center line, first row that has one (decision 4).
export function placeNew(layout, { w, h }, columns) {
  return nearestFree(occupancyOf(layout, null), w, h, columns);
}

// Cell under a pointer, minus the grab offset (cell the pointer grabbed inside the block).
export function cellFromPoint({ x, y }, origin, { cell, gap }, grab = { x: 0, y: 0 }) {
  const step = cell + gap;
  return {
    x: Math.max(0, Math.floor((x - origin.left) / step) - grab.x),
    y: Math.max(0, Math.floor((y - origin.top) / step) - grab.y)
  };
}

// The nearest allowed cell for a block of `size`: x within 0..columns - w, y within 0..maxY (maxDropRow).
export function clampDropCell({ x, y }, { w }, columns, maxY) {
  return { x: Math.min(Math.max(0, columns - w), Math.max(0, x)), y: Math.min(maxY, Math.max(0, y)) };
}

const DEFAULT_METRIC_SIZES = {
  "weather:temperature": { w: 1, h: 1 },
  "weather:precipitation": { w: 2, h: 1 },
  "weather:airQuality": { w: 2, h: 1 },
  "weather:uv": { w: 1, h: 1 }
};
export const DEFAULT_ENTRY_ORDER = [
  "weather:temperature", "weather:precipitation", "weather:airQuality", "weather:uv",
  CHROME_IDS.settings, CHROME_IDS.add
];

export function defaultSize(id) {
  return DEFAULT_METRIC_SIZES[id] ?? { w: 1, h: 1 };
}

// Defaults / ensure (decision 6), in the STORED frame both ways: the missing ids (in DEFAULT_ENTRY_ORDER) are laid out as ONE
// contiguous row block (so the weather tiles stay together and in order) in the first row from 0 with a free run of the
// total width, at the position nearest to the center of the 12 reference columns (ties to the right). `existing` holds
// items with their stored grids; only those on the grid with a valid grid occupy cells.
export function placeMissing(missingIds, existing) {
  const ids = DEFAULT_ENTRY_ORDER.filter((entry) => missingIds.includes(entry));
  const out = new Map();
  if (ids.length === 0) return out;
  const occupied = new Set();
  for (const item of existing) if (isOnGrid(item) && isValidGrid(item.grid)) mark(occupied, toDisplayed(item.grid, REFERENCE_COLUMNS));
  const block = nearestFree(occupied, ids.reduce((sum, id) => sum + defaultSize(id).w, 0), 1, REFERENCE_COLUMNS);
  let x = block.x;
  for (const id of ids) {
    const { w, h } = defaultSize(id);
    out.set(id, toStored({ x, y: block.y, w, h }, REFERENCE_COLUMNS));
    x += w;
  }
  return out;
}

// The one-time v2 -> v3 shift (decision 7). `items` are v2 items read with the v2 grid check (a bad grid is absent). The
// bounding columns [minX, maxEnd) of the on-grid items with a grid are centered: shift = -(minX + floor(width / 2)).
// No on-grid item with a grid means 0. Always a plain +0, never -0.
export function centerShift(items) {
  let minX = Infinity;
  let maxEnd = -Infinity;
  for (const item of items) {
    if (!isOnGrid(item) || !isValidGrid(item.grid)) continue;
    minX = Math.min(minX, item.grid.x);
    maxEnd = Math.max(maxEnd, item.grid.x + item.grid.w);
  }
  if (minX === Infinity) return 0;
  return 0 - (minX + Math.floor((maxEnd - minX) / 2));
}

// v1 → v2 packing. `items` are v1 items in v1 order (favorites then metrics) and may already carry a valid grid
// (resume). `columns` = v1 meta.columns. Returns Map id -> grid for every item plus both chrome tiles.
export function migrateV1ToV2(items, columns) {
  const C = Math.min(V1_MAX_COLUMNS, Math.max(1, columns));
  const hidden = (item) => item.type === "weather-metric" && item.enabled === false;
  const occupied = new Set();
  const out = new Map();

  for (const item of items) {
    if (!hidden(item) && isValidGridV2(item.grid)) {
      mark(occupied, item.grid);
      out.set(item.id, item.grid);
    }
  }
  for (const item of items) {
    if (out.has(item.id)) continue;
    if (hidden(item)) {
      out.set(item.id, { x: 0, y: 0, w: item.tileSize === "wide" ? 2 : 1, h: 1 });
      continue;
    }
    const wide = item.tileSize === "wide" && C >= 2;
    const spot = firstFree(occupied, wide ? 2 : 1, 1, C);
    mark(occupied, spot);
    out.set(item.id, spot);
  }
  for (const id of [CHROME_IDS.settings, CHROME_IDS.add]) {
    if (out.has(id)) continue;
    const spot = firstFree(occupied, 1, 1, C);
    mark(occupied, spot);
    out.set(id, spot);
  }
  return out;
}
