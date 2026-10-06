import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  WIDGETS_META_KEY, createWidgetsStore, inspectWidgetsMeta, isWidgetsState, widgetItemStorageKey,
  migrateWidgetsToV2, ensureWidgetsLayout
} from "../src/widgetsStore.js";
import { PlacementError, createWidgetsService } from "../src/widgetsService.js";
import { MAX_WIDGETS, WEATHER_METRIC_IDS } from "../src/widgetsShared.js";
import { CHROME_IDS, displayLayout, isValidGrid } from "../src/desktopLayout.js";
import * as api from "../src/widgetsStore.js"; // migrateWidgetsToV3 is called as api.migrateWidgetsToV3


const NOW = "2026-07-07T10:00:00.000Z";
const g = (x, y, w = 1, h = 1) => ({ x, y, w, h });
const fav = (id, extra = {}) => ({
  id, type: "favorite", url: `https://${id}.example.com/`, label: id, domain: `${id}.example.com`, iconMode: "favicon",
  customIconUrl: null, backgroundColor: "#24292f", backgroundColorSource: "auto", createdAt: NOW, updatedAt: NOW, ...extra
});
const metric = (id, extra = {}) => ({ id, type: "weather-metric", enabled: true, ...extra });
const chrome = (role, grid) => ({ id: `chrome:${role}`, type: "chrome", role, grid });

// Run 15: the current layout is version 3 and `grid.x` counts from the center line. `seedV3` takes STORED grids;
// `seedDisplayed` takes the cells a person sees at `columns` columns and stores them as displayed - floor(columns / 2).
async function seedV3(area, items) {
  await area.set({
    [WIDGETS_META_KEY]: { version: 3, order: items.map((i) => i.id), createdAt: NOW, updatedAt: NOW },
    ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i]))
  });
}
const originOf = (columns) => Math.floor(columns / 2); // independent of the engine
const shiftGrid = (grid, dx) => (grid ? { ...grid, x: grid.x + dx } : grid);
async function seedDisplayed(area, items, columns = 12) {
  await seedV3(area, items.map((item) => (item.grid ? { ...item, grid: shiftGrid(item.grid, -originOf(columns)) } : item)));
}
const shown = (grids, columns = 12) => Object.fromEntries(Object.entries(grids).map(([id, grid]) => [id, shiftGrid(grid, originOf(columns))]));

async function gridsOf(area) {
  const meta = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY];
  if (!meta?.order) return {};
  const result = {};
  const items = await area.get(meta.order.map(widgetItemStorageKey));
  for (const id of meta.order) {
    const item = items[widgetItemStorageKey(id)];
    result[id] = item?.grid;
  }
  return result;
}

describe("v3 schema (the desktop grid schema since v2; x signed from the center line since v3)", () => {
  const state = (items) => ({ version: 3, items, createdAt: NOW, updatedAt: NOW });
  it("accepts grid items without columns/position and rejects bad spans", () => {
    assert.equal(isWidgetsState(state([fav("a", { grid: g(0, 0) }), chrome("settings", g(1, 0))])), true);
    assert.equal(isWidgetsState(state([fav("a", { grid: g(0, 0, 3, 1) })])), false);
    assert.equal(isWidgetsState(state([fav("a")])), false); // strict: writes need a grid
    assert.equal(isWidgetsState(state([chrome("add", g(0, 0, 2, 1))])), false);
  });
  it("caps at 206 = 200 + 4 + 2", () => {
    assert.equal(MAX_WIDGETS, 206);
    const favs = Array.from({ length: 200 }, (_, i) => fav(`f${i}`, { grid: g(i % 12, Math.floor(i / 12)) }));
    const rest = [
      ...["temperature", "precipitation", "airQuality", "uv"].map((k, i) => metric(`weather:${k}`, { grid: g(i, 20) })),
      chrome("settings", g(0, 21)), chrome("add", g(1, 21))
    ];
    assert.equal(isWidgetsState(state([...favs, ...rest])), true);
    assert.equal(isWidgetsState(state([...favs, fav("extra", { grid: g(0, 30) }), ...rest])), false);
  });
  it("inspectWidgetsMeta knows v1 and v2", () => {
    const v1 = { [WIDGETS_META_KEY]: { version: 1, order: [], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW } };
    assert.equal(inspectWidgetsMeta(v1), "v1");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 2, order: [], createdAt: NOW, updatedAt: NOW } }), "v2");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 4 } }), "newer");
  });
});

describe("store reads (spec § Reading grid)", () => {
  it("keeps items with a missing or broken grid and never deletes keys", async () => {
    const area = createMemoryStorageArea();
    await seedV3(area, [fav("ok", { grid: g(0, 0) }), fav("nogrid"), fav("broken", { grid: g(0, 0, 3, 1) })]);
    const state = await createWidgetsStore(area).getState();
    assert.deepEqual(state.items.map((i) => i.id), ["ok", "nogrid", "broken"]);
    assert.equal(state.items[1].grid, undefined);
    assert.equal(state.items[2].grid, undefined);
    assert.equal(Object.keys(await area.get(null)).length, 4);
  });
  it("a v1 meta reads as an empty state (it is migrated before reads)", async () => {
    const area = createMemoryStorageArea();
    await area.set({ [WIDGETS_META_KEY]: { version: 1, order: [], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW } });
    assert.deepEqual((await createWidgetsStore(area).getState()).items, []);
  });
  it("a stored chrome item whose grid is not 1x1 is read unplaced, not dropped and not resized", async () => {
    const area = createMemoryStorageArea();
    await seedV3(area, [chrome("settings", g(0, 0, 2, 1)), chrome("add", g(1, 0))]);
    const state = await createWidgetsStore(area).getState();
    assert.deepEqual(state.items.map((i) => i.id), ["chrome:settings", "chrome:add"]);
    assert.equal(state.items[0].grid, undefined);
    assert.deepEqual(state.items[1].grid, g(1, 0));
    assert.equal(Object.keys(await area.get(null)).length, 3);
  });
});

describe("migrateWidgetsToV2 (AS-12)", () => {
  const v1Meta = (order, columns = 6) => ({ [WIDGETS_META_KEY]: { version: 1, order, columns, position: "center", createdAt: NOW, updatedAt: NOW } });
  const seedV1 = async (area, items, columns) => {
    await area.set({ ...v1Meta(items.map((i) => i.id), columns), ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i])) });
  };
  const v1Items = () => [
    fav("fw", { tileSize: "wide" }), fav("fs", { tileSize: "square" }),
    metric("weather:temperature", { tileSize: "square" }), metric("weather:precipitation", { tileSize: "wide" }),
    metric("weather:airQuality", { tileSize: "wide" }), metric("weather:uv", { tileSize: "square" })
  ];
  it("writes the exact AS-12 grids, v2 meta without columns/position, keeps tileSize", async () => {
    const area = createMemoryStorageArea();
    await seedV1(area, v1Items());
    assert.deepEqual(await migrateWidgetsToV2(area), { migrated: true });
    const meta = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY];
    assert.equal(meta.version, 2);
    assert.equal("columns" in meta, false);
    assert.equal("position" in meta, false);
    assert.deepEqual(await gridsOf(area), {
      fw: g(0, 0, 2, 1), fs: g(2, 0), "weather:temperature": g(3, 0), "weather:precipitation": g(4, 0, 2, 1),
      "weather:airQuality": g(0, 1, 2, 1), "weather:uv": g(2, 1), "chrome:settings": g(3, 1), "chrome:add": g(4, 1)
    });
    assert.equal((await area.get(widgetItemStorageKey("fw")))[widgetItemStorageKey("fw")].tileSize, "wide");
    assert.equal(inspectWidgetsMeta(await area.get(WIDGETS_META_KEY)), "v2"); // this step now ends at version 2; the v3 step follows
  });
  it("is a no-op for v3, v2, missing and newer metas", async () => {
    const a = createMemoryStorageArea();
    assert.equal((await migrateWidgetsToV2(a)).migrated, false);
    for (const [kind, version] of [["valid", 3], ["v2", 2]]) {
      const c = createMemoryStorageArea({ [WIDGETS_META_KEY]: { version, order: [], createdAt: NOW, updatedAt: NOW } });
      const before = await c.get(null);
      assert.deepEqual(await migrateWidgetsToV2(c), { migrated: false, meta: kind });
      assert.deepEqual(await c.get(null), before);
    }
    const b = createMemoryStorageArea();
    await b.set({ [WIDGETS_META_KEY]: { version: 9 } });
    assert.equal((await migrateWidgetsToV2(b)).meta, "newer");
    assert.deepEqual(await b.get(null), { [WIDGETS_META_KEY]: { version: 9 } });
  });
  it("AS-12b: aborted after chunk 1 then resumed equals an uninterrupted run (holes, 31 items)", async () => {
    const items = [
      ...Array.from({ length: 27 }, (_, i) => fav(`f${i}`, { tileSize: i % 3 === 2 ? "square" : "wide" })),
      metric("weather:temperature", { tileSize: "square" }), metric("weather:precipitation", { tileSize: "wide" }),
      metric("weather:airQuality", { tileSize: "wide" }), metric("weather:uv", { tileSize: "square" })
    ];
    const clean = createMemoryStorageArea();
    await seedV1(clean, items, 3);
    await migrateWidgetsToV2(clean);

    const flaky = createMemoryStorageArea();
    await seedV1(flaky, items, 3);
    let sets = 0;
    const realSet = flaky.set.bind(flaky);
    flaky.set = async (payload) => {
      sets += 1;
      if (sets === 2) throw new Error("aborted after chunk 1");
      return realSet(payload);
    };
    await assert.rejects(migrateWidgetsToV2(flaky));
    assert.equal(inspectWidgetsMeta(await flaky.get(WIDGETS_META_KEY)), "v1"); // meta is written last
    flaky.set = realSet;
    await migrateWidgetsToV2(flaky);
    assert.deepEqual(await gridsOf(flaky), await gridsOf(clean));
  });
  it("hidden metric (disabled) gets a placeholder grid and doesn't block other items", async () => {
    const area = createMemoryStorageArea();
    const v1Meta = (order, columns = 6) => ({ [WIDGETS_META_KEY]: { version: 1, order, columns, position: "center", createdAt: NOW, updatedAt: NOW } });
    const items = [
      fav("a", { tileSize: "square" }),
      metric("weather:precipitation", { enabled: false, tileSize: "wide" }),
      fav("b", { tileSize: "square" })
    ];
    await area.set({ ...v1Meta(items.map((i) => i.id), 6), ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i])) });
    await migrateWidgetsToV2(area);
    assert.deepEqual(await gridsOf(area), {
      a: g(0, 0), b: g(1, 0), "weather:precipitation": g(0, 0, 2, 1), "chrome:settings": g(2, 0), "chrome:add": g(3, 0)
    });
  });
  it("empty area returns no-op and leaves storage untouched", async () => {
    const area = createMemoryStorageArea();
    const result = await migrateWidgetsToV2(area);
    assert.deepEqual(result, { migrated: false, meta: "missing" });
    assert.deepEqual(await area.get(null), {});
  });
});

describe("ensureWidgetsLayout (Defaults, AS-1, AS-35; centered since run 15)", () => {
  it("fresh install writes the six default grids as one block around the center, stored -4..3 (AS-CG-01)", async () => {
    const area = createMemoryStorageArea();
    await ensureWidgetsLayout(area);
    assert.deepEqual(await gridsOf(area), {
      "weather:temperature": g(-4, 0), "weather:precipitation": g(-3, 0, 2, 1), "weather:airQuality": g(-1, 0, 2, 1),
      "weather:uv": g(1, 0), "chrome:settings": g(2, 0), "chrome:add": g(3, 0)
    });
    assert.equal(inspectWidgetsMeta(await area.get(WIDGETS_META_KEY)), "valid");
    assert.equal((await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY].version, 3);
  });
  it("is idempotent and writes nothing the second time", async () => {
    const area = createMemoryStorageArea();
    await ensureWidgetsLayout(area);
    const before = await area.get(null);
    assert.equal((await ensureWidgetsLayout(area)).changed, false);
    assert.deepEqual(await area.get(null), before);
  });
  it("self-heals a missing chrome tile around existing widgets: the nearest free cell to the center", async () => {
    const area = createMemoryStorageArea();
    // reference columns 0..8 are taken (row 0), Add at (0,1); stored = reference - 6
    await seedV3(area, [fav("a", { grid: g(-6, 0) }), ...["temperature", "precipitation", "airQuality", "uv"].map((k, i) => metric(`weather:${k}`, { grid: g(-5 + i * 2, 0, 2, 1) })), chrome("add", g(-6, 1))]);
    await ensureWidgetsLayout(area);
    const grids = await gridsOf(area);
    assert.deepEqual(grids["chrome:settings"], g(3, 0)); // free reference columns 9..11: 9 is the nearest to 6
    assert.deepEqual(grids.a, g(-6, 0));
  });
  it("leaves newer, invalid, v2 and v1 metas alone", async () => {
    const v2 = { version: 2, order: ["a"], createdAt: NOW, updatedAt: NOW };
    for (const meta of [{ version: 9 }, { version: 3, order: "x" }, v2, { version: 1, order: [], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW }]) {
      const area = createMemoryStorageArea();
      await area.set({ [WIDGETS_META_KEY]: meta });
      const result = await ensureWidgetsLayout(area);
      assert.equal(result.changed, false);
      assert.deepEqual(await area.get(null), { [WIDGETS_META_KEY]: meta });
    }
  });
  it("self-heals listed but absent item: meta.order has id but item key missing", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;
    // reference columns: a 0, temperature 1, precipitation 2..3, air quality 4..5, UV 6, Add 7; stored = reference - 6
    const items = [fav("a", { grid: g(-6, 0) }), metric("weather:temperature", { grid: g(-5, 0) }), metric("weather:precipitation", { grid: g(-4, 0, 2, 1) }), metric("weather:airQuality", { grid: g(-2, 0, 2, 1) }), metric("weather:uv", { grid: g(0, 0) }), chrome("add", g(1, 0))];
    const meta = { version: 3, order: items.map((i) => i.id).concat([CHROME_IDS.settings]), createdAt: now, updatedAt: now };
    await area.set({ [WIDGETS_META_KEY]: meta, ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i])) });
    const gridsBefore = await gridsOf(area);
    const originalOrder = [...meta.order];

    // Validate seed: all seeded items have valid grids
    for (const id of items.map((i) => i.id)) {
      assert.ok(isValidGrid(gridsBefore[id]), `seeded item ${id} has valid grid`);
    }

    const result = await ensureWidgetsLayout(area, { now: () => now });
    assert.equal(result.changed, true);
    assert.equal(result.meta, "valid");

    const metaAfter = (await area.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];
    const gridsAfter = await gridsOf(area);

    // Reference columns 0..7 are taken, so the nearest free cell to the center (6) is 8: stored 2
    assert.deepEqual(gridsAfter["chrome:settings"], g(2, 0));

    // Meta.order unchanged (no duplicates added)
    assert.deepEqual(metaAfter.order, originalOrder);
    assert.equal(new Set(metaAfter.order).size, metaAfter.order.length, "no duplicate ids in order");

    // All other items' grids unchanged
    assert.deepEqual(gridsAfter.a, gridsBefore.a);
    assert.deepEqual(gridsAfter["weather:temperature"], gridsBefore["weather:temperature"]);
    assert.deepEqual(gridsAfter["weather:precipitation"], gridsBefore["weather:precipitation"]);
    assert.deepEqual(gridsAfter["weather:airQuality"], gridsBefore["weather:airQuality"]);
    assert.deepEqual(gridsAfter["weather:uv"], gridsBefore["weather:uv"]);
    assert.deepEqual(gridsAfter["chrome:add"], gridsBefore["chrome:add"]);

    // Second call is idempotent
    const afterFirstCall = await area.get(null);
    const result2 = await ensureWidgetsLayout(area, { now: () => now });
    assert.equal(result2.changed, false);
    assert.deepEqual(await area.get(null), afterFirstCall);
  });
  it("AS-CG-15: Settings comes back to the cell it was in, between UV and Add, with links on both sides", async () => {
    const area = createMemoryStorageArea();
    const items = [
      fav("L1", { grid: g(4, 0) }), fav("L2", { grid: g(-5, 0) }),
      metric("weather:temperature", { grid: g(-4, 0) }), metric("weather:precipitation", { grid: g(-3, 0, 2, 1) }),
      metric("weather:airQuality", { grid: g(-1, 0, 2, 1) }), metric("weather:uv", { grid: g(1, 0) }), chrome("add", g(3, 0))
    ];
    await area.set({
      [WIDGETS_META_KEY]: { version: 3, order: [...items.map((i) => i.id), CHROME_IDS.settings], createdAt: NOW, updatedAt: NOW },
      ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i]))
    });
    const before = await gridsOf(area);
    await ensureWidgetsLayout(area, { now: () => "2026-10-06T00:00:00.000Z" });
    const after = await gridsOf(area);
    assert.deepEqual(after["chrome:settings"], g(2, 0));
    for (const id of Object.keys(before).filter((id) => id !== CHROME_IDS.settings)) assert.deepEqual(after[id], before[id], id);
    assert.equal((await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY].updatedAt, "2026-10-06T00:00:00.000Z");
  });
  it("AS-CG-09 b: the four missing metrics next to links and chrome tiles become one block in the first row with room", async () => {
    const area = createMemoryStorageArea();
    await seedV3(area, [fav("f0", { grid: g(-1, 0) }), fav("f1", { grid: g(0, 0) }), chrome("settings", g(-1, 1)), chrome("add", g(0, 1))]);
    await ensureWidgetsLayout(area);
    const grids = await gridsOf(area);
    assert.deepEqual([grids["weather:temperature"], grids["weather:precipitation"], grids["weather:airQuality"], grids["weather:uv"]], [g(-3, 2), g(-2, 2, 2, 1), g(0, 2, 2, 1), g(2, 2)]);
    assert.deepEqual(grids.f0, g(-1, 0));
  });
  it("write order: items written before meta in both migrations and ensures", async () => {
    const writeLog = [];
    const logSet = async (payload) => {
      for (const key of Object.keys(payload)) {
        writeLog.push(key);
      }
    };

    // Test ensureWidgetsLayout write order
    const area1 = createMemoryStorageArea();
    const originalSet1 = area1.set.bind(area1);
    area1.set = async (payload) => {
      await logSet(payload);
      return originalSet1(payload);
    };
    writeLog.length = 0;
    await ensureWidgetsLayout(area1);
    const metaIndex = writeLog.indexOf(WIDGETS_META_KEY);
    const itemIndices = writeLog
      .map((k, i) => (k.startsWith("quietTabWidget:") ? i : -1))
      .filter((i) => i !== -1);
    assert.ok(itemIndices.length > 0);
    assert.ok(itemIndices.every((i) => i < metaIndex), "all item keys written before meta");

    // Test migrateWidgetsToV2 write order: meta is written last
    const area2 = createMemoryStorageArea();
    const v1Meta = (order, columns = 6) => ({ [WIDGETS_META_KEY]: { version: 1, order, columns, position: "center", createdAt: NOW, updatedAt: NOW } });
    const seedV1 = async (area, items, columns) => {
      await area.set({ ...v1Meta(items.map((i) => i.id), columns), ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i])) });
    };
    await seedV1(area2, [fav("x"), fav("y")], 6);

    const originalSet2 = area2.set.bind(area2);
    area2.set = async (payload) => {
      await logSet(payload);
      return originalSet2(payload);
    };
    writeLog.length = 0;
    await migrateWidgetsToV2(area2);
    assert.equal(writeLog[writeLog.length - 1], WIDGETS_META_KEY, "meta written in last set call");
    const metaPos = writeLog.lastIndexOf(WIDGETS_META_KEY);
    assert.ok(!writeLog.slice(metaPos + 1).some((k) => k.startsWith("quietTabWidget:")), "no item keys after meta");
  });
});

describe("widgetsService (displayed-layout writes; stored from the center line)", () => {
  // Seeds are displayed cells at `columns` (default 12, origin 6) converted to the stored frame; gridsOf is stored, `shown` converts back.
  async function setup(items, columns = 12) {
    const area = createMemoryStorageArea();
    await seedDisplayed(area, items, columns);
    let n = 0;
    const service = createWidgetsService({ store: createWidgetsStore(area), now: () => NOW, createId: () => `new${++n}` });
    return { area, service };
  }
  it("requires the column count", async () => {
    const { service } = await setup([]);
    await assert.rejects(service.addFavorite({ url: "https://a.com" }), /column count/);
  });
  it("AS-17 (changed in run 15): add takes the free 1x1 nearest to the center, stored from the center line", async () => {
    const { area, service } = await setup([fav("a", { grid: g(0, 0) }), fav("b", { grid: g(1, 0) })]);
    await service.addFavorite({ url: "https://c.example.com" }, { columns: 12 });
    assert.deepEqual((await gridsOf(area)).new1, g(0, 0)); // displayed (6,0) at 12 columns, origin 6
    assert.deepEqual(shown(await gridsOf(area)).new1, g(6, 0));
  });
  it("AS-36: an edit while narrow persists the displayed grids of every widget, in the frame of that column count", async () => {
    const { area, service } = await setup([fav("A", { grid: g(0, 0) }), fav("B", { grid: g(5, 0, 2, 1) }), fav("D", { grid: g(8, 0, 2, 2) })]);
    await service.moveWidget("A", { x: 0, y: 2 }, { columns: 6 });
    assert.deepEqual(shown(await gridsOf(area), 6), { A: g(0, 2), B: g(2, 0, 2, 1), D: g(4, 0, 2, 2) });
    assert.deepEqual(await gridsOf(area), { A: g(-3, 2), B: g(-1, 0, 2, 1), D: g(1, 0, 2, 2) }); // stored = displayed - 3
  });
  it("viewport changes alone never write (getState + display has no side effects)", async () => {
    const { area } = await setup([fav("A", { grid: g(0, 0) }), fav("B", { grid: g(8, 0) })]);
    const before = await area.get(null);
    await createWidgetsStore(area).getState();
    assert.deepEqual(await area.get(null), before);
  });
  it("AS-18: a drop on an occupied cell is rejected and nothing is written", async () => {
    const { area, service } = await setup([fav("a", { grid: g(0, 0) }), fav("b", { grid: g(1, 0) })]);
    const before = await area.get(null);
    await assert.rejects(service.moveWidget("a", { x: 1, y: 0 }, { columns: 12 }), PlacementError);
    await assert.rejects(service.moveWidget("a", { x: 0, y: 5 }, { columns: 12 }), PlacementError); // too far below
    await assert.rejects(service.updateFavorite("a", { w: 2 }, { columns: 1 }), /column count/);
    assert.deepEqual(await area.get(null), before);
  });
  it("AS-19: a resize relocates by the scan rule (own row, to the right of its own column)", async () => {
    const { area, service } = await setup([fav("a", { grid: g(0, 0) }), fav("b", { grid: g(1, 0) })]);
    await service.updateFavorite("a", { w: 2 }, { columns: 12 });
    assert.deepEqual(shown(await gridsOf(area)).a, g(2, 0, 2, 1));
  });
  it("AS-7/AS-20 (changed in run 15): hide keeps others; restore takes the free block nearest to the center", async () => {
    const { area, service } = await setup([
      metric("weather:precipitation", { grid: g(0, 0, 2, 1) }), fav("a", { grid: g(2, 0) })
    ]);
    await service.updateWeatherMetric("weather:precipitation", { enabled: false }, { columns: 12 });
    assert.equal((await area.get(widgetItemStorageKey("weather:precipitation")))[widgetItemStorageKey("weather:precipitation")].enabled, false);
    await service.updateWeatherMetric("weather:precipitation", { enabled: true }, { columns: 12 });
    assert.deepEqual(shown(await gridsOf(area))["weather:precipitation"], g(5, 0, 2, 1)); // block center 6; the old rule took (0,0)
    assert.deepEqual(await gridsOf(area), { "weather:precipitation": g(-1, 0, 2, 1), a: g(-4, 0) });
  });
  it("delete removes the key and keeps the rest displayed", async () => {
    const { area, service } = await setup([fav("a", { grid: g(0, 0) }), fav("b", { grid: g(1, 0) })]);
    await service.deleteFavorite("a", { columns: 12 });
    assert.deepEqual(Object.keys(await gridsOf(area)), ["b"]);
    assert.equal(widgetItemStorageKey("a") in (await area.get(null)), false);
  });
  it("AS-28 (changed in run 15): items with a broken grid get valid grids on the next write and are not lost; unplaced ones go by the new-tile rule", async () => {
    const { area, service } = await setup([fav("ok", { grid: g(0, 0) }), fav("nogrid"), fav("broken", { grid: g(0, 0, 3, 1) }), fav("gone", { grid: g(5, 5) })]);
    await service.deleteFavorite("gone", { columns: 12 });
    assert.deepEqual(shown(await gridsOf(area)), { ok: g(0, 0), nogrid: g(6, 0), broken: g(5, 0) });
  });
  it("a newer meta refuses every mutation", async () => {
    const area = createMemoryStorageArea();
    await area.set({ [WIDGETS_META_KEY]: { version: 9 } });
    const service = createWidgetsService({ store: createWidgetsStore(area) });
    await assert.rejects(service.addFavorite({ url: "https://a.com" }, { columns: 12 }), /newer version/);
  });
});

describe("widgetsService stores the centered frame (AS-CG-04, 05, 06, 12, 13)", () => {
  const defaultRowStored = () => [
    metric("weather:temperature", { grid: g(-4, 0) }), metric("weather:precipitation", { grid: g(-3, 0, 2, 1) }),
    metric("weather:airQuality", { grid: g(-1, 0, 2, 1) }), metric("weather:uv", { grid: g(1, 0) }),
    chrome("settings", g(2, 0)), chrome("add", g(3, 0))
  ];
  async function setupStored(items) {
    const area = createMemoryStorageArea();
    await seedV3(area, items);
    let n = 0;
    const service = createWidgetsService({ store: createWidgetsStore(area), now: () => NOW, createId: () => `n${++n}` });
    return { area, service };
  }
  const C = { columns: 14 };
  it("AS-CG-04: nine new links fill outwards from the center; stored x 4, -5, 5, -6, 6, -7, 0, -1, 1", async () => {
    const { area, service } = await setupStored(defaultRowStored());
    for (let i = 0; i < 9; i += 1) await service.addFavorite({ url: `https://l${i}.example.com` }, C);
    const grids = await gridsOf(area);
    assert.deepEqual(Array.from({ length: 9 }, (_, i) => [grids[`n${i + 1}`].x, grids[`n${i + 1}`].y]), [[4, 0], [-5, 0], [5, 0], [-6, 0], [6, 0], [-7, 0], [0, 1], [-1, 1], [1, 1]]);
    assert.deepEqual(shown(grids, 14).n1, g(11, 0));
  });
  it("AS-CG-05: a restored weather tile takes the nearest block and is stored from the center line", async () => {
    const items = defaultRowStored().map((item) => (item.id === "weather:precipitation" ? { ...item, enabled: false } : item));
    const { area, service } = await setupStored([...items, fav("L", { grid: g(4, 0) })]);
    await service.updateWeatherMetric("weather:precipitation", { enabled: true }, C);
    assert.deepEqual((await gridsOf(area))["weather:precipitation"], g(-3, 0, 2, 1)); // displayed (4,0)
  });
  it("AS-CG-06: a drag is stored relative to the center; another width keeps the distance from the center", async () => {
    const { area, service } = await setupStored([...defaultRowStored(), fav("A", { grid: g(4, 0) })]);
    await service.moveWidget("A", { x: 13, y: 2 }, { ...C, viewportRows: 9 }); // as the page passes it: the first screen is a drop target
    assert.deepEqual((await gridsOf(area)).A, g(6, 2));
    assert.deepEqual(shown(await gridsOf(area), 22).A, g(17, 2)); // 22 columns: still 6 right of the center line
  });
  it("AS-CG-12: an edit on a narrow window stores the far tile at its displayed cell and leaves the other widgets alone", async () => {
    const { area, service } = await setupStored([...defaultRowStored(), fav("F", { grid: g(10, 0) })]);
    const before = await gridsOf(area);
    await service.updateFavorite("F", { label: "Far" }, C);
    const after = await gridsOf(area);
    assert.deepEqual(after.F, g(6, 0)); // displayed 13 at 14 columns
    for (const id of Object.keys(before).filter((id) => id !== "F")) assert.deepEqual(after[id], before[id], id);
  });
  it("AS-CG-13: a resize near the edge: (a) next row from the left, (b) the block at the end of its own row", async () => {
    const a = await setupStored([...defaultRowStored(), fav("D", { grid: g(5, 0) }), fav("B", { grid: g(6, 0) })]);
    await a.service.updateFavorite("B", { w: 2 }, C);
    assert.deepEqual((await gridsOf(a.area)).B, g(-7, 1, 2, 1));
    const b = await setupStored([...defaultRowStored(), fav("B", { grid: g(6, 0) })]);
    await b.service.updateFavorite("B", { w: 2 }, C);
    assert.deepEqual((await gridsOf(b.area)).B, g(5, 0, 2, 1));
  });
  it("a hidden metric keeps its stored placeholder (not shifted again) and a missing one gets a stored-frame placeholder", async () => {
    const items = defaultRowStored().map((item) => (item.id === "weather:uv" ? { ...item, enabled: false } : item));
    const { area, service } = await setupStored(items);
    await service.addFavorite({ url: "https://x.example.com" }, C);
    assert.deepEqual((await gridsOf(area))["weather:uv"], g(1, 0));
    const bare = await setupStored([{ ...metric("weather:precipitation", { enabled: false }) }, fav("a", { grid: g(0, 0) })].map((item) => item));
    await bare.service.addFavorite({ url: "https://y.example.com" }, C);
    assert.deepEqual((await gridsOf(bare.area))["weather:precipitation"], g(0, 0, 2, 1));
  });
  it("a v2 meta (an upgrade in progress) refuses every mutation and writes nothing (AS-CG-11 b)", async () => {
    const area = createMemoryStorageArea();
    await seedV3(area, [fav("a", { grid: g(0, 0) })]);
    await area.set({ [WIDGETS_META_KEY]: { version: 2, order: ["a"], createdAt: NOW, updatedAt: NOW } });
    const before = await area.get(null);
    const service = createWidgetsService({ store: createWidgetsStore(area), now: () => NOW });
    const message = { message: "Your saved widgets are still being updated to the new layout. Reload this tab to finish." };
    await assert.rejects(service.addFavorite({ url: "https://c.example.com" }, C), message);
    await assert.rejects(service.moveWidget("a", { x: 3, y: 0 }, C), message);
    await assert.rejects(service.updateFavorite("a", { label: "x" }, C), message);
    await assert.rejects(service.updateWeatherMetric("weather:uv", { enabled: false }, C), message);
    await assert.rejects(service.deleteFavorite("a", C), message);
    assert.deepEqual(await area.get(null), before);
  });
});

describe("write guard: only a valid or missing meta may be written (final review I1)", () => {
  const V1_MESSAGE = "Your saved widgets are still being updated to the new layout. Reload this tab to finish.";
  const INVALID_MESSAGE = "Your saved widgets data could not be read, so changes are paused. Reload this tab; if this keeps happening, update Quiet Tab.";
  const v1Seed = {
    [WIDGETS_META_KEY]: { version: 1, order: ["a", "b"], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW },
    [widgetItemStorageKey("a")]: fav("a", { tileSize: "square" }),
    [widgetItemStorageKey("b")]: fav("b", { tileSize: "wide" })
  };
  const v2Seed = {
    [WIDGETS_META_KEY]: { version: 2, order: ["a"], createdAt: NOW, updatedAt: NOW },
    [widgetItemStorageKey("a")]: fav("a", { grid: g(0, 0) })
  };
  const invalidSeed = { [WIDGETS_META_KEY]: { version: 3, order: "x" }, [widgetItemStorageKey("a")]: fav("a", { grid: g(0, 0) }) };
  for (const [kind, seed, message] of [["v1", v1Seed, V1_MESSAGE], ["v2", v2Seed, V1_MESSAGE], ["invalid", invalidSeed, INVALID_MESSAGE]]) {
    it(`${kind === "invalid" ? "an invalid" : `a ${kind}`} meta refuses addFavorite, moveWidget, updateFavorite and setState and writes nothing`, async () => {
      const area = createMemoryStorageArea(seed);
      const store = createWidgetsStore(area, { now: () => NOW });
      const service = createWidgetsService({ store, now: () => NOW, createId: () => "new1" });
      const before = await area.get(null);
      await assert.rejects(service.addFavorite({ url: "https://c.example.com" }, { columns: 12 }), { message });
      await assert.rejects(service.moveWidget("a", { x: 3, y: 0 }, { columns: 12 }), { message });
      await assert.rejects(service.updateFavorite("a", { backgroundColor: "#112233", backgroundColorSource: "auto" }, { columns: 12 }), { message });
      await assert.rejects(store.setState({ version: 3, items: [fav("z", { grid: g(0, 0) })], createdAt: NOW, updatedAt: NOW }), { message });
      await assert.rejects(store.assertWritable(), { message });
      assert.deepEqual(await area.get(null), before);
    });
  }
  it("a valid and a missing meta still write", async () => {
    const valid = createMemoryStorageArea();
    await seedDisplayed(valid, [fav("a", { grid: g(0, 0) })]);
    const s1 = createWidgetsService({ store: createWidgetsStore(valid), now: () => NOW, createId: () => "new1" });
    await s1.addFavorite({ url: "https://c.example.com" }, { columns: 12 });
    assert.deepEqual(shown(await gridsOf(valid)).new1, g(6, 0));
    const missing = createMemoryStorageArea();
    const s2 = createWidgetsService({ store: createWidgetsStore(missing), now: () => NOW, createId: () => "new1" });
    await s2.addFavorite({ url: "https://c.example.com" }, { columns: 12 });
    assert.deepEqual(await gridsOf(missing), { new1: g(0, 0) }); // displayed (6,0), stored from the center line
    assert.equal((await missing.get(WIDGETS_META_KEY))[WIDGETS_META_KEY].version, 3);
  });
});

describe("migrateWidgetsToV2 keeps listed ids whose item has not synced yet (final review I2)", () => {
  const seedV1 = async (area, order, items) => {
    await area.set({
      [WIDGETS_META_KEY]: { version: 1, order, columns: 6, position: "top", createdAt: NOW, updatedAt: NOW },
      ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i]))
    });
  };
  it("an absent id stays in the v2 order (after the written items); a present-but-invalid item is dropped", async () => {
    const area = createMemoryStorageArea();
    await seedV1(area, ["a", "ghost", "bad", "b"], [fav("a", { tileSize: "square" }), { id: "bad", type: "favorite" }, fav("b", { tileSize: "square" })]);
    await migrateWidgetsToV2(area);
    const meta = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY];
    assert.equal(inspectWidgetsMeta(await area.get(WIDGETS_META_KEY)), "v2");
    assert.deepEqual(meta.order, ["a", "b", "chrome:settings", "chrome:add", "ghost"]);
    assert.deepEqual(await gridsOf(area), { a: g(0, 0), b: g(1, 0), "chrome:settings": g(2, 0), "chrome:add": g(3, 0), ghost: undefined });
  });
  it("the late item is read unplaced and shown by displayLayout at the first free block", async () => {
    const area = createMemoryStorageArea();
    await seedV1(area, ["a", "ghost"], [fav("a", { tileSize: "square" })]);
    await migrateWidgetsToV2(area);
    await api.migrateWidgetsToV3(area); // a, Settings, Add at 0..2 shift by -1 (the box [0, 3) is centered)
    const before = await createWidgetsStore(area).getState();
    assert.deepEqual(before.items.map((i) => i.id), ["a", "chrome:settings", "chrome:add"]); // filtered until it arrives
    await area.set({ [widgetItemStorageKey("ghost")]: fav("ghost", { tileSize: "wide" }) }); // the v1 item syncs in late
    const state = await createWidgetsStore(area).getState();
    const ghost = state.items.find((i) => i.id === "ghost");
    assert.ok(ghost, "the late item is read");
    assert.equal(ghost.grid, undefined);
    assert.deepEqual(displayLayout(state.items, 12).get("ghost"), g(3, 0, 2, 1)); // a at 5, Settings 6, Add 7: the nearest free pair is 3..4
  });
});
