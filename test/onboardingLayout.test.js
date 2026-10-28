import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ENTRY_ORDER, centeredDefaultRow } from "../src/desktopLayout.js";
import { ISLANDS, MAX_ISLAND_LINKS, isFreshDesk, islandPlacements } from "../src/onboardingLayout.js";

// INDEPENDENT literal copy of docs/post-onboarding-grid.md § Island table (do not import the rows from the module).
const TABLE = [
  { k: 0, W: 3, H: 3, temp: "1x2", links: [], rows: ["TPP", "TQQ", "US+"] },
  { k: 1, W: 3, H: 3, temp: "1x1", links: ["1x1"], rows: ["TPP", "QQU", "1S+"] },
  { k: 2, W: 4, H: 3, temp: "1x1", links: ["1x2", "2x1"], rows: ["TPP1", "QQU1", "22S+"] },
  { k: 3, W: 4, H: 4, temp: "1x2", links: ["2x2", "1x2", "1x1"], rows: ["TPP2", "TQQ2", "11U3", "11S+"] },
  { k: 4, W: 4, H: 4, temp: "1x1", links: ["2x2", "2x1", "1x1", "1x1"], rows: ["TPP3", "QQU4", "1122", "11S+"] },
  { k: 5, W: 4, H: 4, temp: "1x1", links: ["2x1", "2x1", "2x1", "1x1", "1x1"], rows: ["TPP4", "QQU5", "1122", "33S+"] },
  { k: 6, W: 5, H: 5, temp: "1x1", links: ["2x2", "2x2", "2x2", "2x1", "1x2", "1x1"], rows: ["TPPQQ", "U1144", "61122", "53322", "533S+"] },
  { k: 7, W: 5, H: 5, temp: "1x1", links: ["2x2", "2x2", "2x2", "2x1", "1x1", "1x1", "1x1"], rows: ["TPPQQ", "U1122", "51122", "33446", "337S+"] },
  { k: 8, W: 4, H: 4, temp: "1x1", links: Array(8).fill("1x1"), rows: ["TPP1", "QQU2", "3456", "78S+"] }
];

// Test-local reading of an ASCII island: symbol -> bounding box and cell count (independent of the module's parser).
function boxes(rows) {
  const out = new Map();
  rows.forEach((line, y) => [...line].forEach((ch, x) => {
    const b = out.get(ch) ?? { x0: x, y0: y, x1: x, y1: y, n: 0 };
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); b.n += 1;
    out.set(ch, b);
  }));
  return out;
}
const sizeOfBox = (b) => `${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}`;
const area = (b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
const keyYX = (b) => b.y0 * 100 + b.x0;

describe("island table (docs/post-onboarding-grid.md § Island table)", () => {
  it("the module table equals the spec literal for k = 0…8", () => {
    assert.equal(ISLANDS.length, 9);
    assert.equal(MAX_ISLAND_LINKS, 8);
    for (const row of TABLE) {
      const island = ISLANDS[row.k];
      assert.deepEqual([island.k, island.W, island.H], [row.k, row.W, row.H], `k=${row.k}`);
      assert.deepEqual([...island.rows], row.rows, `k=${row.k} rows`);
    }
  });

  for (const row of TABLE) {
    describe(`k = ${row.k}`, () => {
      const bx = boxes(row.rows);

      it("R1 solid: every cell covered once, every symbol a solid rectangle in {1,2}x{1,2}", () => {
        assert.equal(row.rows.length, row.H);
        assert.ok(row.rows.every((line) => line.length === row.W));
        for (const [ch, b] of bx) {
          assert.equal(b.n, area(b), `${ch} is a solid rectangle`);
          assert.ok(["1x1", "1x2", "2x1", "2x2"].includes(sizeOfBox(b)), `${ch} footprint ${sizeOfBox(b)}`);
        }
        assert.equal([...bx.values()].reduce((s, b) => s + b.n, 0), row.W * row.H);
      });

      it("footprints: temperature and links as in the table", () => {
        assert.equal(sizeOfBox(bx.get("T")), row.temp);
        assert.deepEqual(row.links.map((_, i) => sizeOfBox(bx.get(String(i + 1)))), row.links);
        assert.equal(sizeOfBox(bx.get("P")), "2x1");
        assert.equal(sizeOfBox(bx.get("Q")), "2x1");
        assert.equal(sizeOfBox(bx.get("U")), "1x1");
      });

      it("R2 chrome corner: Settings at (W-2, H-1), Add at (W-1, H-1), both 1x1", () => {
        const s = bx.get("S"); const a = bx.get("+");
        assert.deepEqual([s.x0, s.y0, sizeOfBox(s)], [row.W - 2, row.H - 1, "1x1"]);
        assert.deepEqual([a.x0, a.y0, sizeOfBox(a)], [row.W - 1, row.H - 1, "1x1"]);
      });

      it("R3 weather block: temperature at (0,0), metrics edge-connected, read T P Q U by (y, x)", () => {
        const t = bx.get("T");
        assert.deepEqual([t.x0, t.y0], [0, 0]);
        const order = ["T", "P", "Q", "U"].map((c) => keyYX(bx.get(c)));
        assert.deepEqual(order, [...order].sort((a, b) => a - b));
        // edge-connected: flood fill over the cells of T P Q U
        const cells = new Set();
        row.rows.forEach((line, y) => [...line].forEach((ch, x) => { if ("TPQU".includes(ch)) cells.add(`${x},${y}`); }));
        const seen = new Set(); const stack = [[0, 0]];
        while (stack.length) {
          const [x, y] = stack.pop(); const key = `${x},${y}`;
          if (seen.has(key) || !cells.has(key)) continue;
          seen.add(key);
          stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        assert.equal(seen.size, cells.size);
      });

      it("R4 link priority: areas never increase with j; equal areas read in j order by (y, x)", () => {
        const links = row.links.map((_, i) => bx.get(String(i + 1)));
        for (let i = 1; i < links.length; i += 1) {
          assert.ok(area(links[i]) <= area(links[i - 1]), `link ${i + 1} is not larger than link ${i}`);
          if (area(links[i]) === area(links[i - 1])) assert.ok(keyYX(links[i]) > keyYX(links[i - 1]), `link ${i + 1} after link ${i}`);
        }
      });

      it("R5 shape: the squarest W×H for the area (wider than tall on a tie), H <= 5", () => {
        const total = row.W * row.H;
        let best = null;
        for (let h = 1; h <= total; h += 1) {
          if (total % h !== 0) continue;
          const w = total / h;
          if (w < h) continue;
          if (best === null || w - h < best.w - best.h) best = { w, h };
        }
        assert.deepEqual({ w: row.W, h: row.H }, best);
        assert.ok(row.H <= 5);
      });
    });
  }
});

describe("islandPlacements", () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `fav-${i + 1}`);

  it("k = 3 at rows 9: stored frame dx = -2, dy = centeredDefaultRow(9, 4) = 2", () => {
    const map = islandPlacements({ k: 3, linkIds: ids(3), rows: 9, columns: 14 });
    assert.deepEqual(Object.fromEntries(map), {
      "weather:temperature": { x: -2, y: 2, w: 1, h: 2 },
      "weather:precipitation": { x: -1, y: 2, w: 2, h: 1 },
      "weather:airQuality": { x: -1, y: 3, w: 2, h: 1 },
      "weather:uv": { x: 0, y: 4, w: 1, h: 1 },
      "chrome:settings": { x: 0, y: 5, w: 1, h: 1 },
      "chrome:add": { x: 1, y: 5, w: 1, h: 1 },
      "fav-1": { x: -2, y: 4, w: 2, h: 2 },
      "fav-2": { x: 1, y: 2, w: 1, h: 2 },
      "fav-3": { x: 1, y: 4, w: 1, h: 1 }
    });
  });

  it("the grid does not depend on columns (only the fit does)", () => {
    const a = islandPlacements({ k: 6, linkIds: ids(6), rows: 9, columns: 14 });
    const b = islandPlacements({ k: 6, linkIds: ids(6), rows: 9, columns: 5 });
    assert.deepEqual(Object.fromEntries(a), Object.fromEntries(b));
  });

  it("dy is centeredDefaultRow(rows, H) and 0 for a low window", () => {
    for (const row of TABLE) {
      for (const rows of [1, 3, 4, 9, 20]) {
        const map = islandPlacements({ k: row.k, linkIds: ids(row.k), rows, columns: 14 });
        assert.equal(map.get("weather:temperature").y, centeredDefaultRow(rows, row.H), `k=${row.k} rows=${rows}`);
        assert.equal(map.get("weather:temperature").x, -Math.floor(row.W / 2), `k=${row.k}`);
      }
    }
    assert.equal(islandPlacements({ k: 6, linkIds: ids(6), rows: 4, columns: 14 }).get("weather:temperature").y, 0);
  });

  // Run 51 (docs/unreadable-grid-reset.md decision 2, AS-UGR-04): dy is the centered row capped by the row at which an island of this height is centered in a
  // 1280x800 window (9 rows): 3 for H = 3, 2 for H = 4 and 5. The literals below do not call centeredDefaultRow.
  it("dy is capped by the island height: rows 9, 10, 11, 14, 19, 26 for every k (AS-UGR-04)", () => {
    const BY_H = { // dy by rows 9, 10, 11, 14, 19, 26; `before` = floor((rows - H) / 2), the row before the ceiling
      3: { dy: [3, 3, 3, 3, 3, 3], before: [3, 3, 4, 5, 8, 11] },
      4: { dy: [2, 2, 2, 2, 2, 2], before: [2, 3, 3, 5, 7, 11] },
      5: { dy: [2, 2, 2, 2, 2, 2], before: [2, 2, 3, 4, 7, 10] }
    };
    const ROWS = [9, 10, 11, 14, 19, 26];
    for (const row of TABLE) {
      const want = BY_H[row.H];
      ROWS.forEach((rows, i) => {
        assert.equal(Math.floor((rows - row.H) / 2), want.before[i], `test table k=${row.k} rows=${rows}`);
        const map = islandPlacements({ k: row.k, linkIds: ids(row.k), rows, columns: 14 });
        const dx = -Math.floor(row.W / 2);
        assert.equal(map.get("weather:temperature").y, want.dy[i], `k=${row.k} rows=${rows}`);
        assert.equal(map.get("chrome:settings").y, want.dy[i] + row.H - 1, `k=${row.k} rows=${rows} last row`);
        assert.equal(map.get("chrome:add").y, want.dy[i] + row.H - 1, `k=${row.k} rows=${rows} last row`);
        assert.equal(map.get("weather:temperature").x, dx, `k=${row.k} rows=${rows} x`);
      });
      // the cap changes the row from rows 10 (an even H) or 11 (an odd H): the first rows whose uncapped row is above the cap
      const firstBiting = ROWS.find((rows, i) => want.before[i] !== want.dy[i]);
      assert.equal(firstBiting, row.H % 2 === 0 ? 10 : 11, `k=${row.k} first rows at which the cap bites`);
    }
  });
  it("an island written in a tall window ends at row 5 (H 3 or 4) or row 6 (H 5) at the latest, the last row fully inside the first screen of a window from 6 or 7 rows (AS-UGR-04)", () => {
    const LAST = { 3: 5, 4: 5, 5: 6 };
    for (const row of TABLE) {
      for (const rows of [9, 10, 11, 14, 19, 26, 80]) {
        const map = islandPlacements({ k: row.k, linkIds: ids(row.k), rows, columns: 14 });
        assert.equal(map.get("chrome:settings").y, LAST[row.H], `k=${row.k} rows=${rows}`);
      }
    }
  });

  it("every member covered once for every k (ids = 6 system + k links, no overlap, inside W×H)", () => {
    for (const row of TABLE) {
      const map = islandPlacements({ k: row.k, linkIds: ids(row.k), rows: 9, columns: 14 });
      assert.equal(map.size, 6 + row.k);
      const dx = -Math.floor(row.W / 2); const dy = centeredDefaultRow(9, row.H);
      const covered = new Set();
      for (const g of map.values()) {
        for (let x = g.x; x < g.x + g.w; x += 1) for (let y = g.y; y < g.y + g.h; y += 1) {
          assert.ok(x >= dx && x < dx + row.W && y >= dy && y < dy + row.H, `k=${row.k} inside`);
          assert.ok(!covered.has(`${x},${y}`), `k=${row.k} no overlap`);
          covered.add(`${x},${y}`);
        }
      }
      assert.equal(covered.size, row.W * row.H, `k=${row.k} solid`);
    }
  });

  it("returns null when the island is wider than the window", () => {
    assert.equal(islandPlacements({ k: 6, linkIds: ids(6), rows: 9, columns: 4 }), null); // W = 5
    assert.notEqual(islandPlacements({ k: 3, linkIds: ids(3), rows: 9, columns: 4 }), null); // W = 4
    assert.equal(islandPlacements({ k: 0, linkIds: [], rows: 9, columns: 2 }), null); // W = 3
    assert.notEqual(islandPlacements({ k: 6, linkIds: ids(6), rows: 9, columns: 6 }), null); // W = 5, 500x500
  });

  it("AS-POG-06 matrix: for every k and columns 2, 4, 6 the island applies iff W <= columns", () => {
    for (const row of TABLE) {
      for (const columns of [2, 4, 6]) {
        const map = islandPlacements({ k: row.k, linkIds: ids(row.k), rows: 9, columns });
        assert.equal(map === null, row.W > columns, `k=${row.k} columns=${columns}`);
      }
    }
  });

  it("returns null for k > 8, a link id count that is not k, or a bad k", () => {
    assert.equal(islandPlacements({ k: 9, linkIds: ids(9), rows: 9, columns: 14 }), null);
    assert.equal(islandPlacements({ k: 3, linkIds: ids(2), rows: 9, columns: 14 }), null);
    assert.equal(islandPlacements({ k: -1, linkIds: [], rows: 9, columns: 14 }), null);
    assert.equal(islandPlacements({ k: 1.5, linkIds: ids(1), rows: 9, columns: 14 }), null);
  });

  it("rows 4096 is the largest valid value, 4097 means dy = 0", () => {
    assert.equal(islandPlacements({ k: 3, linkIds: ids(3), rows: 4096, columns: 14 }).get("weather:temperature").y, centeredDefaultRow(4096, 4));
    assert.equal(islandPlacements({ k: 3, linkIds: ids(3), rows: 4097, columns: 14 }).get("weather:temperature").y, 0);
  });

  it("returns null for repeated link ids or a link id equal to a system id", () => {
    assert.equal(islandPlacements({ k: 2, linkIds: ["a", "a"], rows: 9, columns: 14 }), null);
    assert.equal(islandPlacements({ k: 1, linkIds: ["weather:uv"], rows: 9, columns: 14 }), null);
  });

  it("an invalid rows value gives dy = 0 (AS-POG-17)", () => {
    for (const rows of [0, -3, 1.5, "9", NaN, undefined, null, 5000]) {
      const map = islandPlacements({ k: 3, linkIds: ids(3), rows, columns: 14 });
      assert.equal(map.get("weather:temperature").y, 0, String(rows));
    }
  });
});

describe("isFreshDesk", () => {
  const grid = (id) => (id.startsWith("weather:") ? { x: 0, y: 0, w: id.endsWith("precipitation") || id.endsWith("airQuality") ? 2 : 1, h: 1 } : { x: 0, y: 0, w: 1, h: 1 });
  const fresh = () => DEFAULT_ENTRY_ORDER.map((id) =>
    id.startsWith("weather:")
      ? { id, type: "weather-metric", enabled: true, grid: grid(id) }
      : { id, type: "chrome", role: id.split(":")[1], grid: grid(id) });
  const favorite = (id = "fav-1") => ({ id, type: "favorite", url: "https://example.com/", grid: { x: 0, y: 9, w: 1, h: 1 } });
  const without = (items, id) => items.filter((item) => item.id !== id);
  const patch = (items, id, extra) => items.map((item) => (item.id === id ? { ...item, ...extra } : item));

  it("true for the six default items", () => {
    assert.equal(isFreshDesk(fresh()), true);
  });

  it("true although the positions were arranged by hand (accepted, decision 3)", () => {
    const items = fresh().map((item, i) => ({ ...item, grid: { ...item.grid, x: i * 3, y: 7 - i } }));
    assert.equal(isFreshDesk(items), true);
  });

  it("false with any favorite", () => {
    assert.equal(isFreshDesk([...fresh(), favorite()]), false);
  });

  it("false when a system item is missing (each of the six)", () => {
    for (const id of DEFAULT_ENTRY_ORDER) assert.equal(isFreshDesk(without(fresh(), id)), false, id);
  });

  it("false when a metric is hidden", () => {
    for (const id of DEFAULT_ENTRY_ORDER.filter((x) => x.startsWith("weather:"))) {
      assert.equal(isFreshDesk(patch(fresh(), id, { enabled: false })), false, id);
    }
  });

  it("false when a system item does not have its default footprint", () => {
    assert.equal(isFreshDesk(patch(fresh(), "weather:temperature", { grid: { x: 0, y: 0, w: 2, h: 1 } })), false);
    assert.equal(isFreshDesk(patch(fresh(), "weather:temperature", { grid: { x: 0, y: 0, w: 1, h: 2 } })), false);
    assert.equal(isFreshDesk(patch(fresh(), "weather:precipitation", { grid: { x: 0, y: 0, w: 1, h: 1 } })), false);
    assert.equal(isFreshDesk(patch(fresh(), "chrome:add", { grid: { x: 0, y: 0, w: 2, h: 1 } })), false);
  });

  it("false when a system item has no valid grid", () => {
    assert.equal(isFreshDesk(patch(fresh(), "weather:uv", { grid: undefined })), false);
    assert.equal(isFreshDesk(patch(fresh(), "weather:uv", { grid: { x: 0, y: 0, w: 3, h: 1 } })), false);
  });

  it("false when temperature is not the first metric in item order", () => {
    const items = fresh();
    const [t, p, ...rest] = items;
    assert.equal(isFreshDesk([p, t, ...rest]), false);
  });

  it("false for a foreign or duplicate id among six items, a null item, a wrong type, enabled not true", () => {
    assert.equal(isFreshDesk([...without(fresh(), "chrome:add"), favorite()]), false);
    assert.equal(isFreshDesk([...without(fresh(), "chrome:add"), { ...fresh()[0] }]), false, "duplicate id");
    assert.equal(isFreshDesk([...without(fresh(), "chrome:add"), null]), false);
    assert.equal(isFreshDesk(patch(fresh(), "chrome:add", { type: "favorite" })), false);
    assert.equal(isFreshDesk(patch(fresh(), "weather:uv", { type: "chrome" })), false);
    assert.equal(isFreshDesk(patch(fresh(), "weather:uv", { enabled: "true" })), false);
    assert.equal(isFreshDesk([]), false);
  });

  it("false for non-arrays and unknown extra items", () => {
    assert.equal(isFreshDesk(undefined), false);
    assert.equal(isFreshDesk([...fresh(), { id: "x", type: "mystery", grid: { x: 0, y: 0, w: 1, h: 1 } }]), false);
  });
});
