import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  INVALID_WIDGETS_MESSAGE,
  WIDGETS_META_KEY,
  createWidgetsStore,
  createInitialWidgetsState,
  inspectWidgetsMeta,
  isWidgetItem,
  isWidgetsState,
  widgetItemStorageKey
} from "../src/widgetsStore.js";
import { MAX_FAVORITE_WIDGETS, NEWER_WIDGETS_MESSAGE, WEATHER_METRIC_IDS } from "../src/widgetsShared.js";

const NOW = "2026-07-07T10:00:00.000Z";

function favorite(overrides = {}) {
  return {
    id: "fav-1",
    type: "favorite",
    url: "https://example.com/",
    label: "Example",
    domain: "example.com",
    iconMode: "favicon",
    customIconUrl: null,
    backgroundColor: "#24292f",
    backgroundColorSource: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

const cell = (x = 0, y = 0, w = 1, h = 1) => ({ x, y, w, h });
// A favorite placed at grid column `i` of row 0 (writes always carry a grid; since layout version 3 `x` counts from the center line).
const placed = (overrides = {}, i = 0) => favorite({ grid: cell(i % 12, Math.floor(i / 12)), ...overrides });
const currentState = (items = [placed()]) => ({ version: 3, items, createdAt: NOW, updatedAt: NOW });

describe("widgetsStore", () => {
  it("creates an empty initial favorites state", () => {
    assert.deepEqual(createInitialWidgetsState(NOW), {
      version: 3,
      items: [],
      createdAt: NOW,
      updatedAt: NOW
    });
  });

  it("accepts a valid favorites state", () => {
    assert.equal(isWidgetsState(currentState()), true);
  });

  it("rejects invalid favorites state shapes", () => {
    const valid = currentState();

    assert.equal(isWidgetsState(null), false);
    assert.equal(isWidgetsState([]), false);
    assert.equal(isWidgetsState({ ...valid, version: 1 }), false);
    assert.equal(isWidgetsState({ ...valid, version: 2 }), false);
    assert.equal(isWidgetsState({ ...valid, version: 4 }), false);
    assert.equal(isWidgetsState({ ...valid, items: "bad" }), false);
    assert.equal(isWidgetsState({ ...valid, createdAt: "bad-date" }), false);
    assert.equal(isWidgetsState({ ...valid, updatedAt: "" }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ id: "" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ url: "javascript:alert(1)" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ iconMode: "unknown" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ customIconUrl: "file:///tmp/a.png" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ backgroundColor: "red" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ backgroundColorSource: "remote" })] }), false);
  });

  it("validates an explicit tileSize when present, but tolerates its absence", () => {
    const base = currentState();

    assert.equal(isWidgetsState(base), true, "absent tileSize (legacy item)");
    assert.equal(
      isWidgetsState({ ...base, items: [placed({ tileSize: "square" })] }),
      true,
      "square"
    );
    assert.equal(
      isWidgetsState({ ...base, items: [placed({ tileSize: "wide" })] }),
      true,
      "wide"
    );
    assert.equal(
      isWidgetsState({ ...base, items: [placed({ tileSize: "huge" })] }),
      false,
      "unknown tileSize"
    );
  });

  it("rejects states above the item cap", () => {
    const state = currentState(
      Array.from({ length: MAX_FAVORITE_WIDGETS + 1 }, (_, index) =>
        placed({
          id: `fav-${index}`,
          url: `https://example-${index}.com/`,
          domain: `example-${index}.com`
        }, index)
      )
    );

    assert.equal(isWidgetsState(state), false);
  });

  it("rejects invalid favorites state on set", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const invalidState = { version: 3, items: "bad", createdAt: NOW, updatedAt: NOW };

    await assert.rejects(() => store.setState(invalidState), {
      message: "Invalid grid state"
    });
  });

  it("persists, reads, clears, and clones favorites state across a meta key and per-item keys", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const state = currentState();

    await store.setState(state);
    state.items[0].label = "Mutated after set";

    const loaded = await store.getState();
    assert.equal(loaded.items[0].label, "Example");
    assert.deepEqual(await storageArea.get(WIDGETS_META_KEY), {
      [WIDGETS_META_KEY]: {
        version: 3,
        order: ["fav-1"],
        createdAt: NOW,
        updatedAt: NOW
      }
    });
    assert.deepEqual(await storageArea.get(widgetItemStorageKey("fav-1")), {
      [widgetItemStorageKey("fav-1")]: loaded.items[0]
    });

    loaded.items[0].label = "Mutated after get";
    assert.equal((await store.getState()).items[0].label, "Example");

    await store.clearState();
    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
    assert.deepEqual(await storageArea.get(null), {});
  });

  it("returns initial state when stored favorites are absent or corrupt", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });

    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));

    await storageArea.set({ [WIDGETS_META_KEY]: { version: 3, order: "bad" } });
    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
  });

  it("preserves item order via meta.order across get/set roundtrips, independent of insertion", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const state = currentState([
      placed({ id: "fav-b", url: "https://b.example/", domain: "b.example" }, 0),
      placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" }, 1)
    ]);

    await store.setState(state);
    const loaded = await store.getState();
    assert.deepEqual(loaded.items.map((item) => item.id), ["fav-b", "fav-a"]);
  });

  it("removes the per-item key for a deleted favorite, leaving no orphan", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" }, 0);
    const itemB = placed({ id: "fav-b", url: "https://b.example/", domain: "b.example" }, 1);

    await store.setState(currentState([itemA, itemB]));
    await store.setState(currentState([itemA]));

    assert.deepEqual(await storageArea.get(widgetItemStorageKey("fav-b")), {});
    const loaded = await store.getState();
    assert.deepEqual(loaded.items.map((item) => item.id), ["fav-a"]);
  });

  it("tolerates a meta entry whose item key hasn't synced yet, rather than discarding everything", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" });

    await storageArea.set({
      [WIDGETS_META_KEY]: {
        version: 3,
        order: ["fav-a", "fav-missing"],
        createdAt: NOW,
        updatedAt: NOW
      },
      [widgetItemStorageKey("fav-a")]: itemA
    });

    const loaded = await store.getState();
    assert.deepEqual(loaded.items.map((item) => item.id), ["fav-a"]);
  });

  it("clearState removes the meta key and every currently-referenced item key", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" });

    await store.setState(currentState([itemA]));
    await store.clearState();

    assert.deepEqual(await storageArea.get(null), {});
  });

  it("surfaces a friendly error when the sync write exceeds quota, without leaving partial state", async () => {
    const storageArea = createMemoryStorageArea({}, { quotaBytesPerItem: 50 });
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" });

    await assert.rejects(
      () => store.setState(currentState([itemA])),
      /Couldn't save this change to Chrome Sync/
    );

    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
  });

  it("accepts the favorite, weather-metric and chrome types and rejects a missing or unknown type", () => {
    assert.equal(isWidgetItem(favorite()), true);
    assert.equal(isWidgetItem(favorite({ type: undefined })), false);
    assert.equal(isWidgetItem(favorite({ type: "weather-metric" })), false);
    assert.equal(isWidgetItem(favorite({ type: "widget" })), false);
  });

  it("caps favorites at 200 per type", () => {
    const items = Array.from({ length: MAX_FAVORITE_WIDGETS + 1 }, (_, index) =>
      placed({
        id: `fav-${index}`,
        url: `https://example-${index}.com/`,
        domain: `example-${index}.com`
      }, index)
    );
    const state = currentState(items);
    assert.equal(isWidgetsState(state), false);
    assert.equal(isWidgetsState({ ...state, items: items.slice(0, MAX_FAVORITE_WIDGETS) }), true);
  });

  it("persists each item's grid and writes a meta without columns or position", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    await store.setState(currentState([placed({ grid: cell(3, 2) })]));

    const loaded = await store.getState();
    assert.deepEqual(loaded.items[0].grid, cell(3, 2));
    assert.deepEqual((await storageArea.get(WIDGETS_META_KEY))[WIDGETS_META_KEY], {
      version: 3,
      order: ["fav-1"],
      createdAt: NOW,
      updatedAt: NOW
    });
  });

  it("keeps a state with an empty item list readable", async () => {
    const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
    await store.setState(currentState([]));
    assert.deepEqual((await store.getState()).items, []);
  });

  it("accepts a wide tile when it carries a grid (the grid, not the column count, owns placement)", () => {
    assert.equal(isWidgetsState(currentState([placed({ tileSize: "wide", grid: cell(0, 0, 2, 1) })])), true);
  });
});

function metric(id = "weather:temperature", overrides = {}) {
  return { id, type: "weather-metric", enabled: true, ...overrides };
}
function metaOf(order, overrides = {}) {
  return { version: 3, order, createdAt: NOW, updatedAt: NOW, ...overrides };
}

describe("weather-metric widgets", () => {
  it("validates metric items strictly", () => {
    assert.equal(isWidgetItem(metric()), true);
    assert.equal(isWidgetItem(metric("weather:nope")), false);
    assert.equal(isWidgetItem(metric("weather:uv", { tileSize: "huge" })), false);
    assert.equal(isWidgetItem(metric("weather:uv", { enabled: "yes" })), false);
    const { enabled, ...missing } = metric();
    assert.equal(isWidgetItem(missing), false);
  });

  it("accepts 200 favorites plus 4 metrics (204) and rejects a fifth metric or duplicate ids", () => {
    const favs = Array.from({ length: 200 }, (_, i) => placed({ id: `f${i}` }, i));
    const metrics = WEATHER_METRIC_IDS.map((id, i) => metric(id, { grid: cell(i, 20) }));
    const state = { version: 3, createdAt: NOW, updatedAt: NOW, items: [...favs, ...metrics] };
    assert.equal(isWidgetsState(state), true);
    assert.equal(isWidgetsState({ ...state, items: [...state.items, metric("weather:uv", { grid: cell(5, 20) })] }), false);
    assert.equal(isWidgetsState({ ...state, items: [favs[0], favs[0]] }), false);
  });

  it("round-trips metrics through the store in order", async () => {
    const area = createMemoryStorageArea();
    const store = createWidgetsStore(area, { now: () => NOW });
    const items = [placed({ id: "a" }), metric("weather:uv", { enabled: false, grid: cell(1, 0) })];
    await store.setState({ ...createInitialWidgetsState(NOW), items });
    assert.deepEqual((await store.getState()).items, items);
  });
});

describe("inspectWidgetsMeta", () => {
  it("classifies missing, valid (v3), newer and invalid; a v2 or v1 meta is invalid", () => {
    assert.equal(inspectWidgetsMeta({}), "missing");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: metaOf(["a"]) }), "valid");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: metaOf(["a"], { version: 2 }) }), "invalid");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: metaOf(["a"], { version: 4 }) }), "newer");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 4 } }), "newer");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 3 } }), "invalid");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 2, order: "x" } }), "invalid");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 3, order: "x" } }), "invalid");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: null }), "invalid");
    assert.equal(
      inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 1, order: [], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW } }),
      "invalid"
    );
  });
});

describe("setState over a newer meta", () => {
  it("refuses to write and leaves storage untouched", async () => {
    const newer = metaOf(["a"], { version: 4 });
    const area = createMemoryStorageArea({ [WIDGETS_META_KEY]: newer });
    const store = createWidgetsStore(area, { now: () => NOW });
    await assert.rejects(
      store.setState({ ...createInitialWidgetsState(NOW), items: [placed()] }),
      { message: NEWER_WIDGETS_MESSAGE }
    );
    assert.deepEqual(await area.get(null), { [WIDGETS_META_KEY]: newer });
  });

  it("assertWritable rejects a newer or invalid meta (a v2 or v1 meta included) and resolves for a valid or missing one", async () => {
    const newerStore = createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: metaOf(["a"], { version: 4 }) }));
    const v2Old = metaOf(["a"], { version: 2 });
    await assert.rejects(createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: v2Old })).assertWritable(), { message: INVALID_WIDGETS_MESSAGE });
    await assert.rejects(newerStore.assertWritable(), { message: NEWER_WIDGETS_MESSAGE });
    await createWidgetsStore(createMemoryStorageArea()).assertWritable();
    await createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: metaOf(["a"]) })).assertWritable();
    await assert.rejects(createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: { version: 3, order: "x" } })).assertWritable(), { message: INVALID_WIDGETS_MESSAGE });
    const v1 = { version: 1, order: ["a"], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW };
    await assert.rejects(createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: v1 })).assertWritable(), { message: INVALID_WIDGETS_MESSAGE });
  });
  it("no refusal message mentions an upgrade in progress", async () => {
    for (const meta of [metaOf(["a"], { version: 2 }), { version: 1, order: ["a"], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW }, { version: 3, order: "x" }]) {
      await assert.rejects(createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: meta })).assertWritable(), (error) => !/updated to the new layout|upgrade/i.test(error.message));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Layout version 3 (run 15, docs/centered-grid.md): stored `grid.x` is signed and counts from the center line.
// ---------------------------------------------------------------------------------------------------------------------
const chromeAt = (role, grid) => ({ id: `chrome:${role}`, type: "chrome", role, grid });
const v2Meta = (order, extra = {}) => ({ version: 2, order, createdAt: NOW, updatedAt: NOW, ...extra });
const itemKeyOf = widgetItemStorageKey;
function v2Area(items, { order = items.map((item) => item.id), meta = {}, area: areaOptions } = {}) {
  return createMemoryStorageArea(
    { [WIDGETS_META_KEY]: v2Meta(order, meta), ...Object.fromEntries(items.map((item) => [itemKeyOf(item.id), item])) },
    areaOptions
  );
}
describe("layout version 3: validators and reads", () => {
  it("a negative x is a valid stored grid; a negative y or a chrome tile larger than 1x1 is not", () => {
    assert.equal(isWidgetsState(currentState([placed({ grid: cell(-7, 0) })])), true);
    assert.equal(isWidgetsState(currentState([placed({ grid: cell(-1, -1) })])), false);
    assert.equal(isWidgetsState(currentState([placed({ grid: cell(-0.5, 0) })])), false);
    assert.equal(isWidgetsState(currentState([chromeAt("settings", cell(-1, 0, 2, 1))])), false);
    assert.equal(isWidgetsState(currentState([chromeAt("settings", cell(-1, 0))])), true);
  });
  it("round-trips negative x through the store and reads a bad y as unplaced", async () => {
    const area = createMemoryStorageArea();
    const store = createWidgetsStore(area, { now: () => NOW });
    await store.setState(currentState([placed({ id: "left", grid: cell(-7, 0) }), placed({ id: "right", grid: cell(6, 2) })]));
    assert.deepEqual((await store.getState()).items.map((item) => item.grid), [cell(-7, 0), cell(6, 2)]);
    await area.set({ [itemKeyOf("left")]: placed({ id: "left", grid: cell(-7, -1) }) });
    assert.equal((await store.getState()).items[0].grid, undefined);
  });
  it("a v2 meta reads as an empty state and nothing is written (it is invalid, not migrated)", async () => {
    const area = v2Area([placed({ id: "a", grid: cell(0, 0) })]);
    const before = await area.get(null);
    assert.deepEqual((await createWidgetsStore(area, { now: () => NOW }).getState()).items, []);
    assert.deepEqual(await area.get(null), before);
  });
});

describe("a v2 meta is never written over", () => {
  it("setState refuses with the invalid-data message and leaves storage untouched", async () => {
    const area = v2Area([placed({ id: "a", grid: cell(0, 0) })]);
    const before = await area.get(null);
    await assert.rejects(createWidgetsStore(area, { now: () => NOW }).setState(currentState([placed({ id: "z" })])), { message: INVALID_WIDGETS_MESSAGE });
    assert.deepEqual(await area.get(null), before);
  });
});

// Run 49 (docs/typography-copy.md decision 4, AS-TYP-04): the store's messages and the shared newer-meta message say grid and
// links. The unreadable-data message is unit only: an invalid meta draws an empty grid with no text, so the UI does not show it
// until its reset flow (row Р51); `assertWritable` is where it surfaces.
describe("store messages say grid and links (run 49)", () => {
  const INVALID = "Your saved grid could not be read, so changes are paused. Reload this tab; if this keeps happening, update Quiet Tab.";
  const NEWER = "Your saved grid was written by a newer version of Quiet Tab and can't be edited here. Update Quiet Tab to keep using it.";
  const SYNC = "Couldn't save this change to Chrome Sync — it may be full, offline, or temporarily unavailable. Try removing a few links or try again shortly.";

  it("the unreadable-data message is exactly the new text", () => {
    assert.equal(INVALID_WIDGETS_MESSAGE, INVALID);
  });

  it("the newer-meta message is exactly the new text", () => {
    assert.equal(NEWER_WIDGETS_MESSAGE, NEWER);
  });

  it("assertWritable on an unreadable meta (invalid, a v2, a v1) rejects with the new text", async () => {
    for (const meta of [{ version: 3, order: "x" }, metaOf(["a"], { version: 2 }), { version: 1, order: ["a"], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW }]) {
      await assert.rejects(createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: meta })).assertWritable(), { message: INVALID });
    }
  });

  it("assertWritable on a newer meta rejects with the new text", async () => {
    await assert.rejects(createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: metaOf(["a"], { version: 4 }) })).assertWritable(), { message: NEWER });
  });

  it("a failed sync write says links, not favorites, and keeps its em dash", async () => {
    const store = createWidgetsStore(createMemoryStorageArea({}, { quotaBytesPerItem: 50 }), { now: () => NOW });
    await assert.rejects(() => store.setState(currentState([placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" })])), { message: SYNC });
  });

  it("an invalid state on set says grid state", async () => {
    const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
    await assert.rejects(() => store.setState({ version: 3, items: "bad", createdAt: NOW, updatedAt: NOW }), { message: "Invalid grid state" });
  });

  it("none of the messages holds favorite, widget, desktop or bookmark, or a hyphen used as a dash", () => {
    for (const text of [INVALID_WIDGETS_MESSAGE, NEWER_WIDGETS_MESSAGE]) {
      assert.doesNotMatch(text, /\b(?:favou?rite|widget|desktop|bookmark)s?\b/i, text);
      assert.doesNotMatch(text, / - /, text);
    }
  });
});
