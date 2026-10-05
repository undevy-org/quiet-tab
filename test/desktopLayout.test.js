
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHROME_IDS, canPlace, cellFromPoint, displayLayout, effectiveColumns, gridMetrics, isValidGrid,
  migrateV1ToV2, placeMissing, placeNew, placeResized
} from "../src/desktopLayout.js";
import * as engine from "../src/desktopLayout.js"; // the whole-window drag helpers (AS-DL-01..06, 11)

const g = (x, y, w = 1, h = 1) => ({ x, y, w, h });
const fav = (id, grid) => ({ id, type: "favorite", grid });
const plain = (map) => Object.fromEntries(map);

describe("effectiveColumns / gridMetrics", () => {
  it("matches the spec reference values", () => {
    assert.equal(effectiveColumns(1280), 15);
    assert.equal(effectiveColumns(1920), 23);
    assert.equal(effectiveColumns(2560), 31);
    assert.equal(effectiveColumns(500), 6);
    assert.equal(effectiveColumns(360), 5);
    assert.equal(effectiveColumns(361), 4);
    assert.equal(effectiveColumns(320), 5);
    assert.equal(effectiveColumns(305), 4); // 320 px with a 15 px classic scrollbar
  });
  it("never goes below 2 columns and has no upper bound (AS-DL-01)", () => {
    assert.equal(effectiveColumns(100), 2);
    assert.equal(effectiveColumns(5000), 62); // floor((5000 - 32 + 8) / 80)
  });
  it("picks metrics by width", () => {
    assert.deepEqual(gridMetrics(360), { maxWidth: 360, cell: 56, gap: 6, pad: 8 });
    assert.equal(gridMetrics(600).cell, 64);
    assert.equal(gridMetrics(601).cell, 72);
  });
  it("the block never exceeds the content width and leaves less than one cell step over", () => {
    for (let w = 120; w <= 5000; w += 1) {
      const c = effectiveColumns(w);
      const { cell, gap, pad } = gridMetrics(w);
      if (c > 2) {
        const block = c * cell + (c - 1) * gap;
        assert.ok(block <= w - 2 * pad, `width ${w}`);
        assert.ok(w - 2 * pad - block < cell + gap, `width ${w}: left over ${w - 2 * pad - block}`);
      }
    }
  });
});

describe("viewportRows (AS-DL-04, decision 2)", () => {
  it("matches the spec reference values", () => {
    assert.equal(engine.viewportRows(800, 1280), 9);
    assert.equal(engine.viewportRows(1080, 1920), 13);
    assert.equal(engine.viewportRows(1440, 2560), 17);
    assert.equal(engine.viewportRows(700, 1280), 8);
    assert.equal(engine.viewportRows(600, 1280), 7);
    assert.equal(engine.viewportRows(800, 500), 10);
    assert.equal(engine.viewportRows(600, 320), 9);
  });
  it("is at least 1 for any height", () => {
    assert.equal(engine.viewportRows(0, 1280), 1);
    assert.equal(engine.viewportRows(10, 1280), 1);
    assert.equal(engine.viewportRows(70, 320), 1);
  });
  it("rows of that count fit the height", () => {
    for (let h = 200; h <= 2000; h += 1) {
      const { cell, gap, pad } = gridMetrics(1280);
      const n = engine.viewportRows(h, 1280);
      assert.ok(n * cell + (n - 1) * gap + 2 * pad <= h, `height ${h}`);
      assert.ok((n + 1) * cell + n * gap + 2 * pad > h, `height ${h}`);
    }
  });
});

describe("isValidGrid", () => {
  it("accepts 1/2 spans and non-negative integers only", () => {
    assert.equal(isValidGrid(g(0, 0, 2, 2)), true);
    assert.equal(isValidGrid(g(0, 0, 3, 1)), false);
    assert.equal(isValidGrid(g(-1, 0)), false);
    assert.equal(isValidGrid(g(0.5, 0)), false);
    assert.equal(isValidGrid(undefined), false);
  });
});

describe("displayLayout (spec AS-9 worked example)", () => {
  const items = [fav("A", g(0, 0)), fav("B", g(5, 0, 2, 1)), fav("D", g(8, 0, 2, 2))];
  it("repacks at C=6", () => {
    assert.deepEqual(plain(displayLayout(items, 6)), { A: g(0, 0), B: g(1, 0, 2, 1), D: g(3, 0, 2, 2) });
  });
  it("equals the stored layout at C=12", () => {
    assert.deepEqual(plain(displayLayout(items, 12)), { A: g(0, 0), B: g(5, 0, 2, 1), D: g(8, 0, 2, 2) });
  });
  it("is stateless: widening restores the stored cells", () => {
    displayLayout(items, 6);
    assert.deepEqual(displayLayout(items, 12).get("D"), g(8, 0, 2, 2));
  });
  it("ignores hidden metrics", () => {
    const withHidden = [...items, { id: "weather:uv", type: "weather-metric", enabled: false, grid: g(0, 0) }];
    assert.equal(displayLayout(withHidden, 12).has("weather:uv"), false);
    assert.deepEqual(displayLayout(withHidden, 12).get("A"), g(0, 0));
  });
  it("places unplaced widgets after the positioned ones, in order (spec § Reading grid)", () => {
    const broken = [fav("A", g(0, 0)), { id: "X", type: "favorite" }, { id: "Y", type: "favorite", grid: g(0, 0, 3, 1) }];
    assert.deepEqual(plain(displayLayout(broken, 12)), { A: g(0, 0), X: g(1, 0), Y: g(2, 0) });
  });
  it("never overlaps for any column count", () => {
    const many = Array.from({ length: 30 }, (_, i) => fav(`f${i}`, g((i * 3) % 12, Math.floor(i / 4), i % 3 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1)));
    for (let c = 2; c <= 12; c += 1) {
      const seen = new Set();
      for (const { x, y, w, h } of displayLayout(many, c).values()) {
        assert.ok(x + w <= c);
        for (let dx = 0; dx < w; dx += 1) for (let dy = 0; dy < h; dy += 1) {
          assert.equal(seen.has(`${x + dx},${y + dy}`), false);
          seen.add(`${x + dx},${y + dy}`);
        }
      }
    }
  });
});

describe("defaults (spec § Defaults)", () => {
  it("fresh install at 12 columns", () => {
    const ids = ["weather:temperature", "weather:precipitation", "weather:airQuality", "weather:uv", CHROME_IDS.settings, CHROME_IDS.add];
    assert.deepEqual(plain(placeMissing(ids, [])), {
      "weather:temperature": g(0, 0), "weather:precipitation": g(1, 0, 2, 1), "weather:airQuality": g(3, 0, 2, 1),
      "weather:uv": g(5, 0), "chrome:settings": g(6, 0), "chrome:add": g(7, 0)
    });
  });
  it("displays at C=2 per the repack rules", () => {
    const stored = [
      { id: "weather:temperature", type: "weather-metric", enabled: true, grid: g(0, 0) },
      { id: "weather:precipitation", type: "weather-metric", enabled: true, grid: g(1, 0, 2, 1) },
      { id: "weather:airQuality", type: "weather-metric", enabled: true, grid: g(3, 0, 2, 1) },
      { id: "weather:uv", type: "weather-metric", enabled: true, grid: g(5, 0) },
      { id: "chrome:settings", type: "chrome", grid: g(6, 0) },
      { id: "chrome:add", type: "chrome", grid: g(7, 0) }
    ];
    assert.deepEqual(plain(displayLayout(stored, 2)), {
      "weather:temperature": g(0, 0), "weather:precipitation": g(0, 1, 2, 1), "weather:airQuality": g(0, 2, 2, 1),
      "weather:uv": g(1, 0), "chrome:settings": g(0, 3), "chrome:add": g(1, 3)
    });
  });
  it("ensure only places the missing ids around existing widgets", () => {
    const existing = [{ id: "f", type: "favorite", grid: g(0, 0) }];
    assert.deepEqual(plain(placeMissing([CHROME_IDS.settings], existing)), { "chrome:settings": g(1, 0) });
  });
});

describe("placement rules", () => {
  const layout = displayLayout([fav("a", g(0, 0)), fav("b", g(1, 0))], 12);
  it("rejects overlap, overflow and rows further than one below the lowest", () => {
    assert.equal(canPlace(layout, "a", g(1, 0), 12), false);
    assert.equal(canPlace(layout, "a", g(11, 0, 2, 1), 12), false);
    assert.equal(canPlace(layout, "a", g(0, 2), 12), false);
    assert.equal(canPlace(layout, "a", g(0, 1), 12), true);
    assert.equal(canPlace(layout, "a", g(3, 0), 12), true);
  });
  it("a viewportRows that is not an integer >= 0 only narrows the area: same as omitted", () => {
    const lone = displayLayout([fav("a", g(0, 0))], 15);
    for (const bad of [undefined, 0, NaN, 1.5, -1, "9", null, Infinity]) {
      assert.equal(canPlace(lone, "a", g(3, 0), 15, bad), true, String(bad));
      assert.equal(canPlace(lone, "a", g(3, 1), 15, bad), false, String(bad)); // lowest is -1: the old rule allows row 0 only
    }
  });
  it("AS-19: resize relocates to the first free block from its own row", () => {
    assert.deepEqual(placeResized(layout, "a", { w: 2, h: 1 }, 12), g(2, 0, 2, 1));
    const full = displayLayout([fav("a", g(0, 0)), fav("b", g(1, 0)), fav("c", g(2, 0))], 3);
    assert.deepEqual(placeResized(full, "a", { w: 2, h: 1 }, 3), g(0, 1, 2, 1));
  });
  it("resize keeps its cell when the block still fits", () => {
    const solo = displayLayout([fav("a", g(4, 0))], 12);
    assert.deepEqual(placeResized(solo, "a", { w: 2, h: 2 }, 12), g(4, 0, 2, 2));
  });
  it("placeNew takes the first free block from (0,0)", () => {
    assert.deepEqual(placeNew(layout, { w: 1, h: 1 }, 12), g(2, 0));
    assert.deepEqual(placeNew(layout, { w: 2, h: 2 }, 12), g(2, 0, 2, 2));
  });
  it("cellFromPoint subtracts the grab offset and clamps at 0", () => {
    const metrics = { cell: 72, gap: 8 };
    assert.deepEqual(cellFromPoint({ x: 100, y: 100 }, { left: 20, top: 20 }, metrics), { x: 1, y: 1 });
    assert.deepEqual(cellFromPoint({ x: 100, y: 100 }, { left: 20, top: 20 }, metrics, { x: 1, y: 1 }), { x: 0, y: 0 });
    assert.deepEqual(cellFromPoint({ x: 0, y: 0 }, { left: 20, top: 20 }, metrics, { x: 2, y: 0 }), { x: 0, y: 0 });
  });
});

describe("canPlace with viewportRows (AS-DL-04..06, 11; decision 2)", () => {
  // maxY(h) = max(lowest + 1, viewportRows - h, y0); lowest = lowest occupied row without the dragged tile.
  const stack = (lowest) => displayLayout([fav("a", g(0, 0)), ...(lowest >= 0 ? [fav("l", g(10, lowest))] : [])], 15);
  const reach = (layout, h, vr, id = "a") => {
    let top = -1;
    for (let y = 0; y < 40; y += 1) if (canPlace(layout, id, g(3, y, 1, h), 15, vr)) top = y;
    return top;
  };
  it("every row of the first screen is a target: lowest row 0 or none, 1x1, 9 rows", () => {
    assert.equal(reach(stack(-1), 1, 9), 8);
    assert.equal(reach(stack(0), 1, 9), 8);
    assert.equal(reach(stack(7), 1, 9), 8); // lowest + 1 = 8 = viewportRows - 1
  });
  it("below the first screen the one-row rule stays (lowest 8 and 12)", () => {
    assert.equal(reach(stack(8), 1, 9), 9);
    assert.equal(reach(stack(12), 1, 9), 13);
    assert.equal(canPlace(stack(12), "a", g(3, 13), 15, 9), true);
    assert.equal(canPlace(stack(12), "a", g(3, 14), 15, 9), false);
  });
  it("a 2x2 block ends inside the first screen: viewportRows - 2 true, - 1 false", () => {
    const layout = displayLayout([fav("w", g(10, 0, 2, 2)), fav("o", g(0, 0))], 15);
    assert.equal(canPlace(layout, "w", g(10, 7, 2, 2), 15, 9), true);
    assert.equal(canPlace(layout, "w", g(10, 8, 2, 2), 15, 9), false);
    assert.equal(reach(layout, 2, 9, "w"), 7);
  });
  it("a 2x2 block below the first screen: lowest + 1 wins over viewportRows - h", () => {
    const layout = displayLayout([fav("w", g(10, 0, 2, 2)), fav("o", g(0, 12))], 15);
    assert.equal(reach(layout, 2, 9, "w"), 13);
  });
  it("overlap and the columns still decide: occupied is false, past C - w is false, the last column is true", () => {
    const layout = displayLayout([fav("a", g(0, 0)), fav("b", g(5, 4)), fav("w", g(1, 0, 2, 1))], 15);
    assert.equal(canPlace(layout, "a", g(5, 4), 15, 9), false);
    assert.equal(canPlace(layout, "a", g(14, 0), 15, 9), true);
    assert.equal(canPlace(layout, "a", g(15, 0), 15, 9), false);
    assert.equal(canPlace(layout, "w", g(13, 8, 2, 1), 15, 9), true);
    assert.equal(canPlace(layout, "w", g(14, 8, 2, 1), 15, 9), false);
  });
  it("own row: a tile that sits below the allowed area may stay in its row or move up, not lower (with or without viewportRows)", () => {
    const layout = displayLayout([fav("a", g(0, 16)), fav("b", g(2, 0))], 15);
    for (const vr of [undefined, 9]) {
      assert.equal(canPlace(layout, "a", g(3, 16), 15, vr), true, `stay, vr ${vr}`);
      assert.equal(canPlace(layout, "a", g(3, 8), 15, vr), true, `up, vr ${vr}`);
      assert.equal(canPlace(layout, "a", g(3, 17), 15, vr), false, `down, vr ${vr}`);
    }
  });
  it("maxDropRow is the same number canPlace uses", () => {
    assert.equal(engine.maxDropRow(stack(-1), "a", 1, 9), 8);
    assert.equal(engine.maxDropRow(stack(7), "a", 1, 9), 8);
    assert.equal(engine.maxDropRow(stack(8), "a", 1, 9), 9);
    assert.equal(engine.maxDropRow(stack(12), "a", 1, 9), 13);
    assert.equal(engine.maxDropRow(stack(0), "a", 2, 9), 7);
    assert.equal(engine.maxDropRow(stack(0), "a", 1), 1);
    assert.equal(engine.maxDropRow(stack(0), "a", 1, NaN), 1);
    assert.equal(engine.maxDropRow(displayLayout([fav("a", g(0, 5)), fav("b", g(1, 0))], 15), "a", 1), 5);
  });
});

describe("clampDropCell (AS-DL-02, 03, 05, 08; decision 3)", () => {
  const clamp = (cell, size, columns = 15, maxY = 8) => engine.clampDropCell(cell, size, columns, maxY);
  it("leaves a cell inside the allowed area alone", () => {
    assert.deepEqual(clamp({ x: 3, y: 4 }, { w: 1, h: 1 }), { x: 3, y: 4 });
    assert.deepEqual(clamp({ x: 0, y: 0 }, { w: 2, h: 2 }), { x: 0, y: 0 });
    assert.deepEqual(clamp({ x: 13, y: 8 }, { w: 2, h: 1 }), { x: 13, y: 8 });
  });
  it("snaps a cell beyond the columns to C - w (1x1 and 2-wide)", () => {
    assert.deepEqual(clamp({ x: 40, y: 0 }, { w: 1, h: 1 }), { x: 14, y: 0 });
    assert.deepEqual(clamp({ x: 14, y: 0 }, { w: 2, h: 1 }), { x: 13, y: 0 });
    assert.deepEqual(clamp({ x: 22, y: 1 }, { w: 2, h: 2 }, 23), { x: 21, y: 1 });
  });
  it("snaps a negative cell to 0", () => {
    assert.deepEqual(clamp({ x: -3, y: -1 }, { w: 2, h: 1 }), { x: 0, y: 0 });
  });
  it("snaps a row beyond maxY to maxY", () => {
    assert.deepEqual(clamp({ x: 3, y: 20 }, { w: 1, h: 1 }), { x: 3, y: 8 });
    assert.deepEqual(clamp({ x: 3, y: 9 }, { w: 1, h: 1 }, 15, 8), { x: 3, y: 8 });
    assert.deepEqual(clamp({ x: 10, y: 9 }, { w: 2, h: 2 }, 15, 7), { x: 10, y: 7 });
  });
  it("the corner: pointer bottom-right on 15 x 9, 6 x 10 and 5 x 9", () => {
    assert.deepEqual(clamp({ x: 99, y: 99 }, { w: 1, h: 1 }, 15, 8), { x: 14, y: 8 });
    assert.deepEqual(clamp({ x: 99, y: 99 }, { w: 1, h: 1 }, 6, 9), { x: 5, y: 9 });
    assert.deepEqual(clamp({ x: 99, y: 99 }, { w: 1, h: 1 }, 5, 8), { x: 4, y: 8 });
  });
  it("a block wider than the grid still lands on column 0, never negative", () => {
    assert.deepEqual(engine.clampDropCell({ x: 5, y: 0 }, { w: 2, h: 1 }, 1, 3), { x: 0, y: 0 });
  });
});

describe("migrateV1ToV2 (spec AS-12, AS-12b)", () => {
  const metric = (id, size, enabled = true) => ({ id, type: "weather-metric", tileSize: size, enabled });
  const v1 = [
    { id: "fw", type: "favorite", tileSize: "wide" }, { id: "fs", type: "favorite", tileSize: "square" },
    metric("weather:temperature", "square"), metric("weather:precipitation", "wide"),
    metric("weather:airQuality", "wide"), metric("weather:uv", "square")
  ];
  it("AS-12: exact grids at 6 columns", () => {
    assert.deepEqual(plain(migrateV1ToV2(v1, 6)), {
      fw: g(0, 0, 2, 1), fs: g(2, 0), "weather:temperature": g(3, 0), "weather:precipitation": g(4, 0, 2, 1),
      "weather:airQuality": g(0, 1, 2, 1), "weather:uv": g(2, 1), "chrome:settings": g(3, 1), "chrome:add": g(4, 1)
    });
  });
  it("backfills a hole (first-free rule)", () => {
    const items = [{ id: "a", type: "favorite", tileSize: "wide" }, { id: "b", type: "favorite", tileSize: "wide" }, { id: "c", type: "favorite", tileSize: "square" }];
    const out = migrateV1ToV2(items, 3);
    assert.deepEqual([out.get("a"), out.get("b"), out.get("c")], [g(0, 0, 2, 1), g(0, 1, 2, 1), g(2, 0)]);
  });
  it("a wide item at 1 column becomes 1×1", () => {
    assert.deepEqual(migrateV1ToV2([{ id: "a", type: "favorite", tileSize: "wide" }], 1).get("a"), g(0, 0));
  });
  it("hidden metrics take no cell and get a placeholder sized from tileSize", () => {
    const out = migrateV1ToV2([{ id: "a", type: "favorite", tileSize: "square" }, metric("weather:precipitation", "wide", false)], 6);
    assert.deepEqual(out.get("weather:precipitation"), g(0, 0, 2, 1));
    assert.deepEqual(out.get("chrome:settings"), g(1, 0));
  });
  it("AS-12b: resume after an interrupted run equals an uninterrupted run, with holes and >25 items", () => {
    const items = Array.from({ length: 27 }, (_, i) => ({ id: `f${i}`, type: "favorite", tileSize: i % 3 === 2 ? "square" : "wide" }));
    const full = migrateV1ToV2(items, 3);
    const resumed = migrateV1ToV2(items.map((item, i) => (i < 25 ? { ...item, grid: full.get(item.id) } : item)), 3);
    assert.deepEqual(plain(resumed), plain(full));
  });
  it("a v1 columns value above 12 (never stored by v1) still packs over 12 columns", () => {
    const items = Array.from({ length: 14 }, (_, i) => ({ id: `f${i}`, type: "favorite", tileSize: "square" }));
    const out = migrateV1ToV2(items, 40);
    assert.deepEqual(out.get("f11"), g(11, 0));
    assert.deepEqual(out.get("f12"), g(0, 1));
  });
  it("resume keeps an existing chrome grid", () => {
    const items = [{ id: "a", type: "favorite", tileSize: "square", grid: g(0, 0) }, { id: "chrome:settings", type: "chrome", grid: g(5, 0) }];
    assert.deepEqual(migrateV1ToV2(items, 6).get("chrome:settings"), g(5, 0));
  });
});
