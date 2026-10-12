// The post-onboarding island (docs/post-onboarding-grid.md): pure data and rules, no DOM, no storage.
import { CHROME_IDS, DEFAULT_ENTRY_ORDER, centeredDefaultRow, defaultSize, isValidGrid } from "./desktopLayout.js";

export const MAX_ISLAND_LINKS = 8;
const MAX_ROWS = 4096; // same bound as widgetsService sanitizeViewportRows

// § Island table, normative. Rows top to bottom, characters left to right. T temperature, P precipitation, Q air quality,
// U UV, S Settings, + Add, digits = link j (the j-th added starter). Each symbol covers one solid rectangle.
const ISLAND_ROWS = [
  ["TPP", "TQQ", "US+"],
  ["TPP", "QQU", "1S+"],
  ["TPP1", "QQU1", "22S+"],
  ["TPP2", "TQQ2", "11U3", "11S+"],
  ["TPP3", "QQU4", "1122", "11S+"],
  ["TPP4", "QQU5", "1122", "33S+"],
  ["TPPQQ", "U1144", "61122", "53322", "533S+"],
  ["TPPQQ", "U1122", "51122", "33446", "337S+"],
  ["TPP1", "QQU2", "3456", "78S+"]
];

const SYSTEM_SYMBOL_IDS = {
  T: "weather:temperature",
  P: "weather:precipitation",
  Q: "weather:airQuality",
  U: "weather:uv",
  S: CHROME_IDS.settings,
  "+": CHROME_IDS.add
};

// symbol -> its bounding rectangle; a symbol that does not fill its bounding box is a table bug and throws at load.
function parseIsland(rows) {
  const boxes = new Map();
  rows.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      const b = boxes.get(ch) ?? { x0: x, y0: y, x1: x, y1: y, n: 0 };
      b.x0 = Math.min(b.x0, x);
      b.y0 = Math.min(b.y0, y);
      b.x1 = Math.max(b.x1, x);
      b.y1 = Math.max(b.y1, y);
      b.n += 1;
      boxes.set(ch, b);
    });
  });
  const cells = new Map();
  for (const [ch, b] of boxes) {
    const w = b.x1 - b.x0 + 1;
    const h = b.y1 - b.y0 + 1;
    if (w * h !== b.n || w > 2 || h > 2) throw new Error(`Island symbol ${ch} is not a solid 1..2 x 1..2 rectangle`);
    cells.set(ch, { x: b.x0, y: b.y0, w, h });
  }
  return { W: rows[0].length, H: rows.length, cells };
}

export const ISLANDS = Object.freeze(
  ISLAND_ROWS.map((rows, k) => {
    const { W, H, cells } = parseIsland(rows);
    return Object.freeze({ k, W, H, rows: Object.freeze([...rows]), cells });
  })
);

const SYSTEM_IDS = new Set(DEFAULT_ENTRY_ORDER);

// Fresh desk (decision 3): no favorite, exactly the six system items, all with a valid grid and their default footprint, all
// four metrics enabled, temperature the first metric in item order. Positions are not checked.
export function isFreshDesk(items) {
  if (!Array.isArray(items) || items.length !== DEFAULT_ENTRY_ORDER.length) return false;
  if (items.some((item) => !item || !SYSTEM_IDS.has(item.id))) return false;
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== DEFAULT_ENTRY_ORDER.length) return false;
  for (const id of DEFAULT_ENTRY_ORDER) {
    const item = byId.get(id);
    if (!item || !isValidGrid(item.grid)) return false;
    const size = defaultSize(id);
    if (item.grid.w !== size.w || item.grid.h !== size.h) return false;
    if (id.startsWith("weather:") && (item.type !== "weather-metric" || item.enabled !== true)) return false;
  }
  const firstMetric = items.find((item) => item.type === "weather-metric");
  return firstMetric?.id === "weather:temperature";
}

// Stored grids for the island of k links, or null when it does not apply: k not an integer 0..8, linkIds not k ids, or the island
// wider than the window. `rows` = first-screen rows at Finish (anything but an integer 1..4096 means dy = 0).
export function islandPlacements({ k, linkIds, rows, columns }) {
  if (!Number.isInteger(k) || k < 0 || k > MAX_ISLAND_LINKS) return null;
  if (!Array.isArray(linkIds) || linkIds.length !== k) return null;
  const island = ISLANDS[k];
  if (!Number.isInteger(columns) || island.W > columns) return null;
  const dx = -Math.floor(island.W / 2);
  const dy = Number.isInteger(rows) && rows >= 1 && rows <= MAX_ROWS ? centeredDefaultRow(rows, island.H) : 0;
  const out = new Map();
  for (const [symbol, cell] of island.cells) {
    const id = SYSTEM_SYMBOL_IDS[symbol] ?? linkIds[Number(symbol) - 1];
    out.set(id, { x: cell.x + dx, y: cell.y + dy, w: cell.w, h: cell.h });
  }
  return out;
}
