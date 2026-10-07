
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHROME_IDS, canPlace, cellFromPoint, displayLayout, effectiveColumns, gridMetrics, isValidGrid,
  migrateV1ToV2, placeMissing, placeNew, placeResized, viewportRows
} from "../src/desktopLayout.js";
import * as engine from "../src/desktopLayout.js"; // the whole-window drag helpers (AS-DL-01..06, 11)

const g = (x, y, w = 1, h = 1) => ({ x, y, w, h });
const fav = (id, grid) => ({ id, type: "favorite", grid });
const plain = (map) => Object.fromEntries(map);
// Run 15 (centered grid): stored `grid.x` counts from the center line. These helpers are independent of the engine.
const originOf = (columns) => Math.floor(columns / 2);
const st = (columns, x, y, w = 1, h = 1) => g(x - originOf(columns), y, w, h); // displayed cell at `columns` -> stored grid
const favAt = (columns) => (id, grid) => fav(id, g(grid.x - originOf(columns), grid.y, grid.w, grid.h));
const metricItem = (id, grid, enabled = true) => ({ id, type: "weather-metric", enabled, grid });
const chromeItem = (id, grid) => ({ id, type: "chrome", grid });
// The default row, stored in the centered frame (AS-CG-01): temperature -4, precipitation -3..-2, air quality -1..0, UV 1, Settings 2, Add 3.
const defaultRow = () => [
  metricItem("weather:temperature", g(-4, 0)), metricItem("weather:precipitation", g(-3, 0, 2, 1)),
  metricItem("weather:airQuality", g(-1, 0, 2, 1)), metricItem("weather:uv", g(1, 0)),
  chromeItem("chrome:settings", g(2, 0)), chromeItem("chrome:add", g(3, 0))
];

describe("effectiveColumns / gridMetrics", () => {
  it("matches the spec reference values: always even (centered grid decision 1)", () => {
    assert.equal(effectiveColumns(1280), 14);
    assert.equal(effectiveColumns(1920), 22);
    assert.equal(effectiveColumns(2560), 30);
    assert.equal(effectiveColumns(500), 6);
    assert.equal(effectiveColumns(360), 4);
    assert.equal(effectiveColumns(361), 4);
    assert.equal(effectiveColumns(320), 4);
    assert.equal(effectiveColumns(305), 4); // 320 px with a 15 px classic scrollbar
  });
  it("the count is even for every width and never loses more than one column to evenness", () => {
    for (let w = 100; w <= 5000; w += 1) {
      const c = effectiveColumns(w);
      const { cell, gap, pad } = gridMetrics(w);
      const fit = Math.max(2, Math.floor((w - 2 * pad + gap) / (cell + gap)));
      assert.equal(c % 2, 0, `width ${w}`);
      assert.ok(c === fit || c === fit - 1, `width ${w}: ${c} vs fit ${fit}`);
    }
  });
  it("the margins of the centered grid box are equal on both sides (decision 1 reference margins)", () => {
    const margin = (w) => {
      const { cell, gap } = gridMetrics(w);
      const c = effectiveColumns(w);
      return (w - (c * cell + (c - 1) * gap)) / 2;
    };
    assert.equal(margin(1280), 84);
    assert.equal(margin(1920), 84);
    assert.equal(margin(2560), 84);
    assert.equal(margin(500), 38);
    assert.equal(margin(361), 40.5);
    assert.equal(margin(360), 59);
    assert.equal(margin(320), 39);
    assert.equal(margin(305), 31.5);
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
  it("the block never exceeds the content width and leaves less than two cell steps over (one edge column goes to the margins)", () => {
    for (let w = 120; w <= 5000; w += 1) {
      const c = effectiveColumns(w);
      const { cell, gap, pad } = gridMetrics(w);
      if (c > 2) {
        const block = c * cell + (c - 1) * gap;
        assert.ok(block <= w - 2 * pad, `width ${w}`);
        assert.ok(w - 2 * pad - block < 2 * (cell + gap), `width ${w}: left over ${w - 2 * pad - block}`);
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

describe("isValidGrid (v3: a signed x counts from the center line)", () => {
  it("accepts 1/2 spans, an integer x of either sign and a non-negative integer y", () => {
    assert.equal(isValidGrid(g(0, 0, 2, 2)), true);
    assert.equal(isValidGrid(g(-7, 0)), true);
    assert.equal(isValidGrid(g(6, 3, 2, 1)), true);
    assert.equal(isValidGrid(g(0, 0, 3, 1)), false);
    assert.equal(isValidGrid(g(0, -1)), false);
    assert.equal(isValidGrid(g(0.5, 0)), false);
    assert.equal(isValidGrid(g(-0.5, 0)), false);
    assert.equal(isValidGrid(undefined), false);
  });
  it("isValidGridV2 keeps the non-negative x of the v1/v2 readers", () => {
    assert.equal(engine.isValidGridV2(g(0, 0, 2, 2)), true);
    assert.equal(engine.isValidGridV2(g(11, 4)), true);
    assert.equal(engine.isValidGridV2(g(-1, 0)), false);
    assert.equal(engine.isValidGridV2(g(0, -1)), false);
    assert.equal(engine.isValidGridV2(g(0, 0, 3, 1)), false);
    assert.equal(engine.isValidGridV2(undefined), false);
  });
});

describe("originColumn, toStored, toDisplayed (decision 2)", () => {
  it("origin is floor(C / 2): the window's center line for an even count", () => {
    assert.equal(engine.originColumn(2), 1);
    assert.equal(engine.originColumn(4), 2);
    assert.equal(engine.originColumn(14), 7);
    assert.equal(engine.originColumn(22), 11);
    assert.equal(engine.originColumn(30), 15);
    assert.equal(engine.originColumn(15), 7); // an odd caller count still works
  });
  it("displayed = stored + origin, stored = displayed - origin; y, w and h stay", () => {
    assert.deepEqual(engine.toStored(g(11, 2, 2, 1), 14), g(4, 2, 2, 1));
    assert.deepEqual(engine.toStored(g(0, 0), 14), g(-7, 0));
    assert.deepEqual(engine.toDisplayed(g(-4, 1), 14), g(3, 1));
    assert.deepEqual(engine.toDisplayed(g(4, 0), 22), g(15, 0));
  });
  it("round-trips at every column count and does not mutate its input", () => {
    const grid = g(5, 3, 2, 2);
    for (let c = 2; c <= 40; c += 1) {
      assert.deepEqual(engine.toDisplayed(engine.toStored(grid, c), c), grid);
      assert.deepEqual(engine.toStored(engine.toDisplayed(grid, c), c), grid);
    }
    assert.deepEqual(grid, g(5, 3, 2, 2));
  });
});

describe("displayLayout (spec AS-9 worked example, seeds converted to the centered frame)", () => {
  // The same arrangement as before run 15, stored from the center line of a 12-column grid.
  const items = [fav("A", st(12, 0, 0)), fav("B", st(12, 5, 0, 2, 1)), fav("D", st(12, 8, 0, 2, 2))];
  it("repacks at C=6: A is anchored left of the edge, D beyond the right one", () => {
    assert.deepEqual(plain(displayLayout(items, 6)), { A: g(0, 0), B: g(2, 0, 2, 1), D: g(4, 0, 2, 2) });
  });
  it("equals the stored layout at C=12", () => {
    assert.deepEqual(plain(displayLayout(items, 12)), { A: g(0, 0), B: g(5, 0, 2, 1), D: g(8, 0, 2, 2) });
  });
  it("is stateless: widening restores the stored cells", () => {
    displayLayout(items, 6);
    assert.deepEqual(displayLayout(items, 12).get("D"), g(8, 0, 2, 2));
  });
  it("ignores hidden metrics", () => {
    const withHidden = [...items, { id: "weather:uv", type: "weather-metric", enabled: false, grid: st(12, 0, 0) }];
    assert.equal(displayLayout(withHidden, 12).has("weather:uv"), false);
    assert.deepEqual(displayLayout(withHidden, 12).get("A"), g(0, 0));
  });
  it("places unplaced widgets after the positioned ones by the new-tile rule (nearest the center, ties right)", () => {
    const broken = [fav("A", st(12, 0, 0)), { id: "X", type: "favorite" }, { id: "Y", type: "favorite", grid: g(0, 0, 3, 1) }];
    assert.deepEqual(plain(displayLayout(broken, 12)), { A: g(0, 0), X: g(6, 0), Y: g(5, 0) });
  });
  it("never overlaps and stays inside the columns for any column count", () => {
    const many = Array.from({ length: 30 }, (_, i) => fav(`f${i}`, g(((i * 3) % 12) - 6, Math.floor(i / 4), i % 3 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1)));
    for (let c = 2; c <= 40; c += 1) {
      const seen = new Set();
      const layout = displayLayout(many, c);
      assert.equal(layout.size, 30, `nothing lost at ${c}`);
      for (const { x, y, w, h } of layout.values()) {
        assert.ok(x >= 0 && x + w <= c, `inside ${c} columns`);
        for (let dx = 0; dx < w; dx += 1) for (let dy = 0; dy < h; dy += 1) {
          assert.equal(seen.has(`${x + dx},${y + dy}`), false);
          seen.add(`${x + dx},${y + dy}`);
        }
      }
    }
  });
});

describe("displayLayout anchored at the center line (decisions 2-3; AS-CG-01, 03, 07, 08, 12)", () => {
  const cells = (items, c) => plain(displayLayout(items, c));
  it("draws the default row exactly as stored at 14, 22 and 30 columns: columns 3..10, 7..14, 11..18", () => {
    const at = (c) => ({
      "weather:temperature": g(c, 0), "weather:precipitation": g(c + 1, 0, 2, 1), "weather:airQuality": g(c + 3, 0, 2, 1),
      "weather:uv": g(c + 5, 0), "chrome:settings": g(c + 6, 0), "chrome:add": g(c + 7, 0)
    });
    assert.deepEqual(cells(defaultRow(), 14), at(3));
    assert.deepEqual(cells(defaultRow(), 22), at(7));
    assert.deepEqual(cells(defaultRow(), 30), at(11));
  });
  it("widening or narrowing keeps the tiles at the same distance from the center: 16 columns 4..11, back at 14 3..10", () => {
    assert.deepEqual(cells(defaultRow(), 16)["weather:temperature"], g(4, 0));
    assert.deepEqual(cells(defaultRow(), 16)["chrome:add"], g(11, 0));
    assert.deepEqual(cells(defaultRow(), 18)["weather:temperature"], g(5, 0));
    assert.deepEqual(cells(defaultRow(), 14)["weather:temperature"], g(3, 0));
  });
  it("at 6 columns the default row wraps from the left, as main wraps it (AS-CG-07)", () => {
    assert.deepEqual(cells(defaultRow(), 6), {
      "weather:temperature": g(0, 0), "weather:precipitation": g(1, 0, 2, 1), "weather:airQuality": g(3, 0, 2, 1),
      "weather:uv": g(5, 0), "chrome:settings": g(0, 1), "chrome:add": g(1, 1)
    });
  });
  it("at 4 columns the default row wraps from the left, as main wraps it (AS-CG-07)", () => {
    assert.deepEqual(cells(defaultRow(), 4), {
      "weather:temperature": g(0, 0), "weather:precipitation": g(1, 0, 2, 1), "weather:uv": g(3, 0),
      "weather:airQuality": g(0, 1, 2, 1), "chrome:settings": g(2, 1), "chrome:add": g(3, 1)
    });
  });
  it("a tile stored far from the center lands at the right end of its own row on a narrower window (AS-CG-12)", () => {
    const items = [...defaultRow(), fav("F", g(10, 0))];
    assert.deepEqual(displayLayout(items, 22).get("F"), g(21, 0));
    assert.deepEqual(displayLayout(items, 14).get("F"), g(13, 0));
  });
  it("a tile anchored left of column 0 takes the first free cell of its own row from the left", () => {
    assert.deepEqual(displayLayout([fav("F", g(-9, 0)), fav("G", g(-9, 0))], 14).get("F"), g(0, 0));
    assert.deepEqual(displayLayout([fav("F", g(-9, 0)), fav("G", g(-9, 0))], 14).get("G"), g(1, 0));
  });
  it("a tile anchored beyond the right edge with a full row end goes to the rows below from column 0", () => {
    const row = [fav("a", g(5, 0)), fav("b", g(6, 0)), fav("c", g(9, 0))]; // C=14, origin 7: columns 12, 13 and 16 (beyond)
    assert.deepEqual(plain(displayLayout(row, 14)), { a: g(12, 0), b: g(13, 0), c: g(0, 1) });
  });
  it("a 15-wide layout migrated from main fits 14 columns except its last tile (AS-CG-08 b)", () => {
    const row = [
      metricItem("weather:temperature", g(-7, 0)), metricItem("weather:precipitation", g(-6, 0, 2, 1)),
      metricItem("weather:airQuality", g(-4, 0, 2, 1)), metricItem("weather:uv", g(-2, 0)),
      chromeItem("chrome:settings", g(-1, 0)), chromeItem("chrome:add", g(0, 0)),
      ...Array.from({ length: 7 }, (_, i) => fav(`f${i}`, g(1 + i, 0)))
    ];
    const layout = plain(displayLayout(row, 14));
    assert.deepEqual(layout.f6, g(0, 1), "anchored at 14, beyond 13");
    assert.deepEqual(layout.f5, g(13, 0));
    assert.deepEqual(layout["weather:temperature"], g(0, 0));
    assert.deepEqual(layout["chrome:add"], g(7, 0));
    // at 16 columns the 15-wide row is drawn as stored, centered on the center line (origin 8)
    assert.deepEqual(plain(displayLayout(row, 16)).f6, g(15, 0));
  });
  it("an unplaced item takes the nearest free cell to the center, after the positioned ones (AS-CG-08 a)", () => {
    const items = [
      metricItem("weather:temperature", g(-4, 0)), metricItem("weather:precipitation", g(-3, 0, 2, 1)),
      metricItem("weather:airQuality", g(-1, 0, 2, 1)), metricItem("weather:uv", g(1, 0), false),
      chromeItem("chrome:settings", g(2, 0)), chromeItem("chrome:add", g(3, 0)),
      fav("f0", g(-4, 1)), fav("f1", g(-3, 1, 2, 1)), { id: "f2", type: "favorite" }
    ];
    const layout = plain(displayLayout(items, 14));
    assert.deepEqual(layout.f2, g(8, 0)); // UV is hidden: its cell is free, block center 8.5, |8.5 - 7| = 1.5
    assert.deepEqual(layout.f0, g(3, 1));
    assert.deepEqual(layout.f1, g(4, 1, 2, 1));
    assert.equal("weather:uv" in layout, false);
  });
  it("a legacy tileSize sizes an unplaced item", () => {
    const layout = plain(displayLayout([{ id: "w", type: "favorite", tileSize: "wide" }], 14));
    assert.deepEqual(layout.w, g(6, 0, 2, 1));
  });
  it("keeps (y, x, order) processing: an item that keeps its anchored cell never moves for a later one", () => {
    const items = [fav("late", g(-2, 0)), fav("early", g(-2, 0)), fav("other", g(-3, 0))];
    const layout = plain(displayLayout(items, 14));
    assert.deepEqual(layout.other, g(4, 0));
    assert.deepEqual(layout.late, g(5, 0)); // same stored cell: the earlier in order wins
    assert.deepEqual(layout.early, g(6, 0));
  });
});

describe("defaults and self-heal (decision 6; AS-CG-01, 09 b, 15)", () => {
  const ids = ["weather:temperature", "weather:precipitation", "weather:airQuality", "weather:uv", CHROME_IDS.settings, CHROME_IDS.add];
  it("fresh install: one contiguous block of 8 around the center, stored -4..3 (AS-CG-01)", () => {
    assert.deepEqual(plain(placeMissing(ids, [])), {
      "weather:temperature": g(-4, 0), "weather:precipitation": g(-3, 0, 2, 1), "weather:airQuality": g(-1, 0, 2, 1),
      "weather:uv": g(1, 0), "chrome:settings": g(2, 0), "chrome:add": g(3, 0)
    });
  });
  it("displays at C=2 per the repack rules", () => {
    assert.deepEqual(plain(displayLayout(defaultRow(), 2)), {
      "weather:temperature": g(0, 0), "weather:precipitation": g(0, 1, 2, 1), "weather:airQuality": g(0, 2, 2, 1),
      "weather:uv": g(1, 0), "chrome:settings": g(0, 3), "chrome:add": g(1, 3)
    });
  });
  it("one missing tile takes the nearest free cell of the first row that has one, ties to the right", () => {
    const existing = [{ id: "f", type: "favorite", grid: g(-6, 0) }]; // reference column 0
    assert.deepEqual(plain(placeMissing([CHROME_IDS.settings], existing)), { "chrome:settings": g(0, 0) });
    assert.deepEqual(plain(placeMissing([CHROME_IDS.settings], [])), { "chrome:settings": g(0, 0) });
  });
  it("missing ids keep DEFAULT_ENTRY_ORDER and stay one contiguous block whatever order they are passed in", () => {
    assert.deepEqual(plain(placeMissing([CHROME_IDS.add, CHROME_IDS.settings], [])), {
      "chrome:settings": g(-1, 0), "chrome:add": g(0, 0)
    });
  });
  it("self-heal: Settings goes back to its place between UV and Add, links on both sides (AS-CG-15)", () => {
    const existing = [
      fav("L1", g(4, 0)), fav("L2", g(-5, 0)), ...defaultRow().filter((item) => item.id !== CHROME_IDS.settings)
    ];
    assert.deepEqual(plain(placeMissing([CHROME_IDS.settings], existing)), { "chrome:settings": g(2, 0) });
  });
  it("legacy upgrade: the four metrics become one centered block in the first row with room for all of them (AS-CG-09 b)", () => {
    const existing = [fav("f0", g(-1, 0)), fav("f1", g(0, 0)), chromeItem("chrome:settings", g(-1, 1)), chromeItem("chrome:add", g(0, 1))];
    assert.deepEqual(plain(placeMissing(ids.slice(0, 4), existing)), {
      "weather:temperature": g(-3, 2), "weather:precipitation": g(-2, 2, 2, 1), "weather:airQuality": g(0, 2, 2, 1), "weather:uv": g(2, 2)
    });
  });
  it("a hidden metric does not occupy a cell", () => {
    const hidden = [metricItem("weather:uv", g(0, 0), false)];
    assert.deepEqual(plain(placeMissing([CHROME_IDS.settings], hidden)), { "chrome:settings": g(0, 0) });
  });
  it("a 2-high item occupies the row below too: the block skips the cells it covers", () => {
    // reference columns: tall 2x2 at 5..6, singles at 1, 3, 8, 10 in row 0 (only single cells are free there)
    const existing = [fav("tall", g(-1, 0, 2, 2)), fav("a", g(-5, 0)), fav("b", g(-3, 0)), fav("c", g(2, 0)), fav("d", g(4, 0))];
    assert.deepEqual(plain(placeMissing([CHROME_IDS.settings, CHROME_IDS.add], existing)), {
      "chrome:settings": g(1, 1), "chrome:add": g(2, 1) // row 1 runs 0..4 and 7..11: the pair at 7..8 (ties right with 3..4)
    });
  });
  it("tiles far from the reference columns do not disturb the block", () => {
    const far = [fav("far", g(40, 0)), fav("farLeft", g(-40, 0))];
    assert.deepEqual(plain(placeMissing(ids, far))["weather:temperature"], g(-4, 0));
  });
});

describe("centerShift (decision 7; AS-CG-08)", () => {
  const on = (id, x, w = 1, y = 0) => ({ id, type: "favorite", grid: g(x, y, w, 1) });
  const defaultRowV2 = () => [
    metricItem("weather:temperature", g(0, 0)), metricItem("weather:precipitation", g(1, 0, 2, 1)),
    metricItem("weather:airQuality", g(3, 0, 2, 1)), metricItem("weather:uv", g(5, 0)),
    chromeItem("chrome:settings", g(6, 0)), chromeItem("chrome:add", g(7, 0))
  ];
  it("centers the bounding box of the on-grid items: 8 wide -4, 15 wide -7, 11 wide -5", () => {
    assert.equal(engine.centerShift(defaultRowV2()), -4);
    assert.equal(engine.centerShift([...defaultRowV2(), ...Array.from({ length: 7 }, (_, i) => on(`f${i}`, 8 + i))]), -7);
    assert.equal(engine.centerShift(Array.from({ length: 11 }, (_, i) => on(`f${i}`, i))), -5);
  });
  it("uses the left edge and the right end of a wide tile", () => {
    assert.equal(engine.centerShift([on("a", 0), on("b", 3, 2)]), -2); // [0, 5): floor(5/2) = 2
    assert.equal(engine.centerShift([on("a", 4), on("b", 6)]), -(4 + 1)); // [4, 7): minX 4 + floor(3/2)
  });
  it("hidden metrics and items without a valid grid do not count", () => {
    const items = [...defaultRowV2().filter((item) => item.id !== "weather:uv"), metricItem("weather:uv", g(20, 0), false), { id: "loose", type: "favorite" }];
    assert.equal(engine.centerShift(items), -4); // on-grid columns [0, 8)
  });
  it("nothing on the grid means no shift, and the shift is a plain +0", () => {
    assert.equal(Object.is(engine.centerShift([]), 0), true);
    assert.equal(Object.is(engine.centerShift([{ id: "x", type: "favorite" }, metricItem("weather:uv", g(3, 0), false)]), 0), true);
    assert.equal(Object.is(engine.centerShift([on("a", 0)]), 0), true); // a single tile at column 0: no -0
  });
});

describe("placement rules", () => {
  const layout = displayLayout([favAt(12)("a", g(0, 0)), favAt(12)("b", g(1, 0))], 12);
  it("rejects overlap, overflow and rows further than one below the lowest", () => {
    assert.equal(canPlace(layout, "a", g(1, 0), 12), false);
    assert.equal(canPlace(layout, "a", g(11, 0, 2, 1), 12), false);
    assert.equal(canPlace(layout, "a", g(0, 2), 12), false);
    assert.equal(canPlace(layout, "a", g(0, 1), 12), true);
    assert.equal(canPlace(layout, "a", g(3, 0), 12), true);
  });
  it("a viewportRows that is not an integer >= 0 only narrows the area: same as omitted", () => {
    const lone = displayLayout([favAt(15)("a", g(0, 0))], 15);
    for (const bad of [undefined, 0, NaN, 1.5, -1, "9", null, Infinity]) {
      assert.equal(canPlace(lone, "a", g(3, 0), 15, bad), true, String(bad));
      assert.equal(canPlace(lone, "a", g(3, 1), 15, bad), false, String(bad)); // lowest is -1: the old rule allows row 0 only
    }
  });
  it("AS-19: resize relocates to the first free block from its own column, to the right", () => {
    assert.deepEqual(placeResized(layout, "a", { w: 2, h: 1 }, 12), g(2, 0, 2, 1));
    const full = displayLayout([favAt(3)("a", g(0, 0)), favAt(3)("b", g(1, 0)), favAt(3)("c", g(2, 0))], 3);
    assert.deepEqual(placeResized(full, "a", { w: 2, h: 1 }, 3), g(0, 1, 2, 1));
  });
  it("resize keeps its cell when the block still fits", () => {
    const solo = displayLayout([favAt(12)("a", g(4, 0))], 12);
    assert.deepEqual(placeResized(solo, "a", { w: 2, h: 2 }, 12), g(4, 0, 2, 2));
  });
  it("resize never moves a tile left within its own row (decision 5)", () => {
    const row = displayLayout([favAt(12)("a", g(5, 0)), favAt(12)("b", g(6, 0))], 12);
    assert.deepEqual(placeResized(row, "a", { w: 2, h: 1 }, 12), g(7, 0, 2, 1)); // the scan starts at column 5, not 0
    const edge = displayLayout([favAt(12)("a", g(10, 0)), favAt(12)("b", g(11, 0))], 12);
    assert.deepEqual(placeResized(edge, "a", { w: 2, h: 1 }, 12), g(0, 1, 2, 1)); // nothing free to the right: next row from the left
  });
  it("AS-CG-13: resize near the right edge scans from clamp(x, 0, C - w)", () => {
    const at14 = (extra) => displayLayout([...defaultRow(), ...extra], 14);
    const withD = at14([fav("D", g(5, 0)), fav("B", g(6, 0))]); // displayed 12 and 13
    assert.deepEqual(placeResized(withD, "B", { w: 2, h: 1 }, 14), g(0, 1, 2, 1)); // (a): block at 12 is D's
    const withoutD = at14([fav("B", g(6, 0))]);
    assert.deepEqual(placeResized(withoutD, "B", { w: 2, h: 1 }, 14), g(12, 0, 2, 1)); // (b): the scan from column 12 finds it
  });
  it("placeNew takes the free block nearest to the center, ties to the right (decision 4)", () => {
    assert.deepEqual(placeNew(layout, { w: 1, h: 1 }, 12), g(6, 0)); // columns 5 and 6 tie, 6 wins
    assert.deepEqual(placeNew(layout, { w: 2, h: 2 }, 12), g(5, 0, 2, 2)); // block center 6
  });
  it("cellFromPoint subtracts the grab offset and clamps at 0", () => {
    const metrics = { cell: 72, gap: 8 };
    assert.deepEqual(cellFromPoint({ x: 100, y: 100 }, { left: 20, top: 20 }, metrics), { x: 1, y: 1 });
    assert.deepEqual(cellFromPoint({ x: 100, y: 100 }, { left: 20, top: 20 }, metrics, { x: 1, y: 1 }), { x: 0, y: 0 });
    assert.deepEqual(cellFromPoint({ x: 0, y: 0 }, { left: 20, top: 20 }, metrics, { x: 2, y: 0 }), { x: 0, y: 0 });
  });
});

describe("placeNew order (decision 4; AS-CG-04)", () => {
  const fill = (size, count, columns = 14) => {
    const layout = displayLayout(defaultRow(), columns);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const spot = engine.placeNew(layout, size, columns);
      layout.set(`n${i}`, spot);
      out.push(spot);
    }
    return out;
  };
  it("nine 1x1 links fill row 0 from the center outwards, then row 1 from the middle", () => {
    const spots = fill({ w: 1, h: 1 }, 9);
    assert.deepEqual(spots.map(({ x, y }) => [x, y]), [[11, 0], [2, 0], [12, 0], [1, 0], [13, 0], [0, 0], [7, 1], [6, 1], [8, 1]]);
    assert.deepEqual(spots.map((spot) => engine.toStored(spot, 14).x), [4, -5, 5, -6, 6, -7, 0, -1, 1]);
  });
  it("2x1 blocks: the nearest free pair, ties right, then the next one", () => {
    assert.deepEqual(fill({ w: 2, h: 1 }, 2), [g(11, 0, 2, 1), g(1, 0, 2, 1)]);
  });
  it("2x2 blocks need both rows free; a tile in row 1 pushes the block to the next free place", () => {
    assert.deepEqual(fill({ w: 2, h: 2 }, 1), [g(11, 0, 2, 2)]);
    const layout = displayLayout([...defaultRow(), fav("blocker", g(4, 1))], 14); // displayed (11,1)
    assert.deepEqual(engine.placeNew(layout, { w: 2, h: 2 }, 14), g(1, 0, 2, 2));
  });
  it("a row without a free block of the size is skipped: the first row that has one wins", () => {
    const layout = displayLayout([fav("a", g(-1, 0)), fav("b", g(1, 0))], 4); // displayed 1 and 3: only single cells free
    assert.deepEqual(engine.placeNew(layout, { w: 2, h: 1 }, 4), g(1, 1, 2, 1));
  });
  it("an empty layout: 1x1 at the right of the center on an even count, 2x1 across it", () => {
    assert.deepEqual(engine.placeNew(new Map(), { w: 1, h: 1 }, 14), g(7, 0));
    assert.deepEqual(engine.placeNew(new Map(), { w: 2, h: 1 }, 14), g(6, 0, 2, 1));
  });
  it("an odd caller column count still has a middle cell", () => {
    assert.deepEqual(engine.placeNew(new Map(), { w: 1, h: 1 }, 13), g(6, 0));
    assert.deepEqual(engine.placeNew(new Map(), { w: 2, h: 1 }, 13), g(6, 0, 2, 1)); // 5..6 and 6..7 tie at center 6.5: right wins
  });
});

describe("canPlace with viewportRows (AS-DL-04..06, 11; decision 2)", () => {
  // Seeds are written as displayed cells at 15 columns and converted to the centered frame (run 15); the layouts are unchanged.
  const fav = favAt(15);
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
  it("resume reads existing grids with the non-negative v2 check: a negative x is unplaced and is packed again (decision 8)", () => {
    const items = [{ id: "a", type: "favorite", tileSize: "square", grid: g(-1, 0) }, { id: "b", type: "favorite", tileSize: "square", grid: g(2, 0) }];
    const out = migrateV1ToV2(items, 6);
    assert.deepEqual(out.get("b"), g(2, 0));
    assert.deepEqual(out.get("a"), g(0, 0));
  });
  it("resume keeps an existing chrome grid", () => {
    const items = [{ id: "a", type: "favorite", tileSize: "square", grid: g(0, 0) }, { id: "chrome:settings", type: "chrome", grid: g(5, 0) }];
    assert.deepEqual(migrateV1ToV2(items, 6).get("chrome:settings"), g(5, 0));
  });
});

describe("vertically centered defaults (docs/vertically-centered-defaults.md; AS-VC-13)", () => {
  const six = ["weather:temperature", "weather:precipitation", "weather:airQuality", "weather:uv", CHROME_IDS.settings, CHROME_IDS.add];
  const SIX_X = [-4, -3, -1, 1, 2, 3];
  const ys = (map) => six.map((id) => map.get(id).y);
  const xs = (map) => six.map((id) => map.get(id).x);
  const link = (refColumn, y, w = 1, h = 1) => fav(`l${refColumn}-${y}`, g(refColumn - 6, y, w, h)); // reference column -> stored

  it("centeredDefaultRow(R, b) = max(0, floor((R - b) / 2)): tables", () => {
    const one = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6];
    one.forEach((y, i) => assert.equal(engine.centeredDefaultRow(i + 1, 1), y, `R=${i + 1}, b=1`));
    const two = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4];
    two.forEach((y, i) => assert.equal(engine.centeredDefaultRow(i + 1, 2), y, `R=${i + 1}, b=2`));
  });
  it("centeredDefaultRow: R < b, R = b and the spec examples", () => {
    assert.equal(engine.centeredDefaultRow(1, 4), 0);
    assert.equal(engine.centeredDefaultRow(3, 4), 0);
    assert.equal(engine.centeredDefaultRow(2, 2), 0);
    assert.equal(engine.centeredDefaultRow(4, 4), 0);
    for (const [R, b, y] of [[9, 1, 4], [8, 1, 3], [7, 1, 3], [5, 1, 2], [4, 1, 1], [3, 1, 1], [2, 1, 0], [1, 1, 0], [13, 1, 6], [17, 1, 8], [26, 1, 12], [10, 2, 4], [9, 2, 3]]) {
      assert.equal(engine.centeredDefaultRow(R, b), y, `(${R}, ${b})`);
    }
  });
  it("defaultBlockRows(C) is the displayed height of the six tiles (decision 3)", () => {
    for (const C of [8, 10, 14, 22, 30]) assert.equal(engine.defaultBlockRows(C), 1, `C=${C}`);
    assert.equal(engine.defaultBlockRows(4), 2);
    assert.equal(engine.defaultBlockRows(6), 2);
    assert.equal(engine.defaultBlockRows(2), 4);
  });
  it("placeMissing with a screen: run 15 x, centered y", () => {
    const m = placeMissing(six, [], { rows: 9, columns: 14 });
    assert.deepEqual(xs(m), SIX_X);
    assert.deepEqual(six.map((id) => [m.get(id).w, m.get(id).h]), [[1, 1], [2, 1], [2, 1], [1, 1], [1, 1], [1, 1]]);
    assert.deepEqual(ys(m), [4, 4, 4, 4, 4, 4]);
    assert.deepEqual(ys(placeMissing(six, [], { rows: 10, columns: 6 })), Array(6).fill(4));
    assert.deepEqual(ys(placeMissing(six, [], { rows: 9, columns: 4 })), Array(6).fill(3));
    assert.deepEqual(ys(placeMissing(six, [], { rows: 1, columns: 14 })), Array(6).fill(0));
  });
  it("no screen and invalid screens give exactly today's result (row 0)", () => {
    const today = plain(placeMissing(six, []));
    assert.deepEqual(Object.values(today).map((x) => x.y), Array(6).fill(0));
    const bad = [
      { rows: 0, columns: 14 }, { rows: 1.5, columns: 14 }, { rows: NaN, columns: 14 }, { rows: Infinity, columns: 14 }, { rows: "9", columns: 14 },
      { rows: 9, columns: 1 }, { rows: 9 }, { rows: 9, columns: null }, {}, null, undefined, 9
    ];
    for (const screen of bad) assert.deepEqual(plain(placeMissing(six, [], screen)), today, JSON.stringify(screen));
  });
  it("the measurement: viewportRows of a broken clientHeight (decision 2)", () => {
    for (const h of [0, -5]) assert.deepEqual(ys(placeMissing(six, [], { rows: viewportRows(h, 1280), columns: 14 })), Array(6).fill(0));
    const today = plain(placeMissing(six, []));
    for (const h of [NaN, undefined, Infinity]) assert.deepEqual(plain(placeMissing(six, [], { rows: viewportRows(h, 1280), columns: 14 })), today);
  });
  it("1..5 ids with a valid screen equal the same call with no screen (decision 1)", () => {
    const screen = { rows: 9, columns: 14 };
    const subsets = [[CHROME_IDS.settings], [CHROME_IDS.add], six.slice(0, 4), six.slice(0, 5), [...six.slice(0, 4), CHROME_IDS.settings], [CHROME_IDS.settings, CHROME_IDS.add]];
    const existingSets = [[], [fav("a", g(-5, 0)), fav("b", g(4, 0))], [fav("tall", g(-1, 0, 2, 2))]];
    for (const ids of subsets) for (const existing of existingSets) {
      assert.deepEqual(plain(placeMissing(ids, existing, screen)), plain(placeMissing(ids, existing)), ids.join());
    }
  });
  describe("a target row that is not free (decision 5; AS-VC-10)", () => {
    const screen = { rows: 9, columns: 14 }; // Y0 = 4
    const run = (existing, s = screen) => placeMissing(six, existing, s);
    it("links at reference 4 and 8 in the target row: the row above", () => {
      const m = run([link(4, 4), link(8, 4)]);
      assert.deepEqual(ys(m), Array(6).fill(3));
      assert.deepEqual(xs(m), SIX_X);
    });
    it("rows 4 and 3 blocked: the row below (distance 1, above first, then below)", () => {
      assert.deepEqual(ys(run([link(4, 4), link(8, 4), link(4, 3), link(8, 3)])), Array(6).fill(5));
    });
    it("a block in row 0 only does not matter", () => {
      assert.deepEqual(ys(run([link(4, 0), link(8, 0)])), Array(6).fill(4));
    });
    it("Y0 = 0 with row 0 blocked: row 1 (row -1 is skipped)", () => {
      assert.deepEqual(ys(run([link(4, 0), link(8, 0)], { rows: 1, columns: 14 })), Array(6).fill(1));
    });
    it("144 one-cell links fill rows 0..11: row 12", () => {
      const links = [];
      for (let y = 0; y < 12; y += 1) for (let c = 0; c < 12; c += 1) links.push(link(c, y));
      assert.deepEqual(ys(run(links)), Array(6).fill(12));
    });
    it("a 2x2 item covers rows 4 and 5, a link blocks row 3: the first free row by distance is row 2", () => {
      const existing = [fav("tall", g(4 - 6, 4, 2, 2)), link(6, 3)];
      assert.deepEqual(ys(run(existing)), Array(6).fill(2));
    });
    it("hidden metrics occupy nothing; items far outside the 12 columns do not block", () => {
      const existing = [metricItem("weather:uv", g(-2, 4), false), fav("far", g(40, 4)), fav("farLeft", g(-40, 4))];
      assert.deepEqual(ys(run(existing)), Array(6).fill(4));
    });
  });
});
