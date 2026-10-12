import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWidgetsStore, createInitialWidgetsState, isWidgetsState } from "../src/widgetsStore.js";
import { MAX_FAVORITE_WIDGETS, NEWER_WIDGETS_MESSAGE } from "../src/widgetsShared.js";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  LinkGoneError,
  PlacementError,
  createWidgetsService,
  normalizeFavoriteUrl,
  normalizeNullableImageUrl
} from "../src/widgetsService.js";

const NOW = "2026-07-07T10:00:00.000Z";
const COLS = { columns: 12 };
const g = (x, y, w = 1, h = 1) => ({ x, y, w, h });
const metric = (id, extra = {}) => ({ id, type: "weather-metric", enabled: true, ...extra });

// Run 15 (centered grid): the stored `grid.x` counts from the center line, origin = floor(columns / 2). These tests keep
// thinking in DISPLAYED cells: `seed` takes the cells a person sees at `columns` columns (default 12) and stores them
// as displayed - origin; `gridsOf` and `shown` read stored grids back as displayed cells. `stored` is the raw frame.
const originOf = (columns) => Math.floor(columns / 2); // independent of the engine
const shift = (grid, dx) => (grid ? { ...grid, x: grid.x + dx } : grid);
const shown = (grid, columns = 12) => shift(grid, originOf(columns));
// v3 seed with a validity guard, so a malformed fixture fails loudly instead of testing nothing.
async function seed(store, items, columns = 12) {
  const state = {
    version: 3,
    items: items.map((item) => (item.grid ? { ...item, grid: shift(item.grid, -originOf(columns)) } : item)),
    createdAt: NOW,
    updatedAt: NOW
  };
  assert.equal(isWidgetsState(state), true, "seed state must be a valid v3 state");
  await store.setState(state);
}
const gridsOf = (state, columns = 12) => Object.fromEntries(state.items.map((item) => [item.id, shown(item.grid, columns)]));
const storedGridsOf = (state) => Object.fromEntries(state.items.map((item) => [item.id, item.grid]));

async function createHarness() {
  let id = 0;
  const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
  const service = createWidgetsService({
    store,
    now: () => NOW,
    createId: () => `fav-${++id}`,
    defaultBackgroundColor: () => "#24292f"
  });

  return { service, store };
}

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

describe("widgetsService", () => {
  describe("normalizeFavoriteUrl", () => {
    it("normalizes URLs without an explicit protocol", () => {
      assert.deepEqual(normalizeFavoriteUrl("example.com/path"), {
        url: "https://example.com/path",
        domain: "example.com"
      });
    });

    it("normalizes localhost URLs while preserving http", () => {
      assert.deepEqual(normalizeFavoriteUrl(" http://localhost:3000/a "), {
        url: "http://localhost:3000/a",
        domain: "localhost"
      });
    });

    it("normalizes host-with-port URLs without an explicit protocol", () => {
      assert.deepEqual(normalizeFavoriteUrl("example.com:8443/path"), {
        url: "https://example.com:8443/path",
        domain: "example.com"
      });
    });

    it("normalizes bare host:port URLs without a dot in the host", () => {
      assert.deepEqual(normalizeFavoriteUrl("router:8080"), {
        url: "https://router:8080/",
        domain: "router"
      });
      assert.deepEqual(normalizeFavoriteUrl("nas:9000/share"), {
        url: "https://nas:9000/share",
        domain: "nas"
      });
    });

    it("rejects empty URLs", () => {
      assert.throws(() => normalizeFavoriteUrl(""), /Enter a URL/);
    });

    it("rejects unsupported URL protocols", () => {
      assert.throws(
        () => normalizeFavoriteUrl("javascript:alert(1)"),
        /Only http and https URLs are supported/
      );
      assert.throws(
        () => normalizeFavoriteUrl("file:///tmp/icon.png"),
        /Only http and https URLs are supported/
      );
    });
  });

  describe("normalizeNullableImageUrl", () => {
    it("normalizes empty image URLs to null", () => {
      assert.equal(normalizeNullableImageUrl(""), null);
      assert.equal(normalizeNullableImageUrl("   "), null);
      assert.equal(normalizeNullableImageUrl(null), null);
    });

    it("normalizes image URLs without an explicit protocol", () => {
      assert.equal(
        normalizeNullableImageUrl("cdn.example.com/icon.png"),
        "https://cdn.example.com/icon.png"
      );
    });

    it("normalizes host-with-port image URLs without an explicit protocol", () => {
      assert.equal(
        normalizeNullableImageUrl("cdn.example.com:8443/icon.png"),
        "https://cdn.example.com:8443/icon.png"
      );
    });

    it("normalizes bare host:port image URLs without a dot in the host", () => {
      assert.equal(
        normalizeNullableImageUrl("router:9000/icon.png"),
        "https://router:9000/icon.png"
      );
    });

    it("preserves explicit https image URLs", () => {
      assert.equal(
        normalizeNullableImageUrl("https://cdn.example.com/icon.png"),
        "https://cdn.example.com/icon.png"
      );
    });

    it("rejects unsupported image URL protocols", () => {
      assert.throws(
        () => normalizeNullableImageUrl("data:image/png;base64,abc"),
        /Only http and https image URLs are supported/
      );
    });
  });

  it("adds a favorite with normalized defaults and persists it", async () => {
    const { service, store } = await createHarness();

    const state = await service.addFavorite({ url: "example.com/path" }, COLS);

    assert.deepEqual(state.items, [
      {
        id: "fav-1",
        type: "favorite",
        url: "https://example.com/path",
        label: "example.com",
        domain: "example.com",
        iconMode: "favicon",
        customIconUrl: null,
        backgroundColor: "#24292f",
        backgroundColorSource: "auto",
        grid: g(0, 0), // stored from the center line: displayed (6, 0) at 12 columns
        createdAt: NOW,
        updatedAt: NOW
      }
    ]);
    assert.deepEqual(await store.getState(), state);
  });

  it("derives manual background color source when adding a custom color", async () => {
    const { service } = await createHarness();

    const state = await service.addFavorite({
      url: "example.com",
      backgroundColor: "#112233"
    }, COLS);

    assert.equal(state.items[0].backgroundColor, "#112233");
    assert.equal(state.items[0].backgroundColorSource, "manual");
  });

  it("updates favorite fields", async () => {
    const { service, store } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    const state = await service.updateFavorite("fav-1", {
      url: "news.ycombinator.com/item",
      label: "HN item",
      iconMode: "custom",
      customIconUrl: "cdn.example.com/icon.png",
      backgroundColor: "#ABCDEF",
      backgroundColorSource: "manual"
    }, COLS);

    assert.deepEqual(state.items[0], {
      id: "fav-1",
      type: "favorite",
      url: "https://news.ycombinator.com/item",
      label: "HN item",
      domain: "news.ycombinator.com",
      iconMode: "custom",
      customIconUrl: "https://cdn.example.com/icon.png",
      backgroundColor: "#abcdef",
      backgroundColorSource: "manual",
      grid: g(0, 0),
      createdAt: NOW,
      updatedAt: NOW
    });
    assert.deepEqual(await store.getState(), state);
  });

  it("derives manual background color source when updating only color", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    const state = await service.updateFavorite("fav-1", {
      backgroundColor: "#445566"
    }, COLS);

    assert.equal(state.items[0].backgroundColor, "#445566");
    assert.equal(state.items[0].backgroundColorSource, "manual");
  });

  it("preserves a manual background color when color fields are omitted", async () => {
    const { service } = await createHarness();
    await service.addFavorite({
      url: "example.com",
      backgroundColor: "#ffcc00",
      backgroundColorSource: "manual"
    }, COLS);

    const state = await service.updateFavorite("fav-1", { label: "Example" }, COLS);

    assert.equal(state.items[0].backgroundColor, "#ffcc00");
    assert.equal(state.items[0].backgroundColorSource, "manual");
  });

  it("defaults the size to 1x1 when adding, and allows choosing a 2x1 span", async () => {
    const { service } = await createHarness();

    const defaulted = await service.addFavorite({ url: "example.com" }, COLS);
    assert.deepEqual(shown(defaulted.items[0].grid), g(6, 0));

    const wide = await service.addFavorite({
      url: "wide.example.com",
      w: 2
    }, COLS);
    // changed in run 15: the nearest free pair to the center (block center 5 of 6), not the first free cell from the left
    assert.deepEqual(shown(wide.items[1].grid), g(4, 0, 2, 1));
    assert.deepEqual(wide.items[1].grid, g(-2, 0, 2, 1));
  });

  it("updates the size", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    const state = await service.updateFavorite("fav-1", { w: 2 }, COLS);
    assert.deepEqual(state.items[0].grid, g(0, 0, 2, 1));
    assert.equal("tileSize" in state.items[0], false);
  });

  it("drops a stored legacy tileSize from a favorite on any edit, size or not", async () => {
    const { service, store } = await createHarness();
    await seed(store, [favorite({ tileSize: "wide", grid: g(0, 0, 2, 1) }), favorite({ id: "fav-2", tileSize: "square", grid: g(2, 0) })]);
    assert.equal((await store.getState()).items[0].tileSize, "wide", "the seed keeps the legacy field");

    const labelOnly = await service.updateFavorite("fav-1", { label: "Renamed" }, COLS);
    assert.equal("tileSize" in labelOnly.items[0], false);
    assert.deepEqual(shown(labelOnly.items[0].grid), g(0, 0, 2, 1));
    const resized = await service.updateFavorite("fav-2", { w: 2, h: 2 }, COLS);
    assert.equal("tileSize" in resized.items[1], false);
    assert.equal(resized.items[1].label, "Example");
    const stored = await store.getState();
    assert.equal(stored.items.some((item) => "tileSize" in item), false);
  });

  it("rejects an unsupported span", async () => {
    const { service } = await createHarness();

    await assert.rejects(
      () => service.addFavorite({ url: "example.com", w: 3 }, COLS),
      /Choose a supported tile width/
    );
    await assert.rejects(
      () => service.addFavorite({ url: "example.com", h: "tall" }, COLS),
      /Choose a supported tile height/
    );
  });

  it("rejects an unsupported span on update", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    await assert.rejects(
      () => service.updateFavorite("fav-1", { w: 3 }, COLS),
      /Choose a supported tile width/
    );
  });

  it("deletes favorites", async () => {
    const { service, store } = await createHarness();
    await service.addFavorite({ url: "one.example.com" }, COLS);
    await service.addFavorite({ url: "two.example.com" }, COLS);

    const state = await service.deleteFavorite("fav-1", COLS);

    assert.deepEqual(
      state.items.map((item) => item.id),
      ["fav-2"]
    );
    assert.deepEqual(gridsOf(state), { "fav-2": g(5, 0) }); // fav-1 took the middle (6,0), fav-2 the cell left of it
    assert.deepEqual(await store.getState(), state);
  });

  it("an unknown id raises LinkGoneError (a link deleted in another tab) for update, delete and move, and writes nothing", async () => {
    const { service, store } = await createHarness();
    const before = JSON.stringify(await store.getState());
    const gone = (id) => (error) => {
      assert.ok(error instanceof LinkGoneError);
      assert.equal(error.name, "LinkGoneError");
      assert.equal(error.code, "link-gone");
      assert.equal(error.id, id);
      assert.equal(error.message, "This link was deleted in another tab.");
      return true;
    };
    await assert.rejects(() => service.updateFavorite("missing", { label: "Missing" }, COLS), gone("missing"));
    await assert.rejects(() => service.deleteFavorite("missing", COLS), gone("missing"));
    await assert.rejects(() => service.moveWidget("missing", { x: 0, y: 0 }, COLS), gone("missing"));
    assert.equal(JSON.stringify(await store.getState()), before);
  });

  it("rejects invalid favorite background colors", async () => {
    const { service } = await createHarness();

    await assert.rejects(
      () => service.addFavorite({ url: "example.com", backgroundColor: "red" }, COLS),
      /Use a hex color/
    );
  });

  it("rejects adding a favorite once the limit is reached", async () => {
    const { service, store } = await createHarness();
    const items = Array.from({ length: MAX_FAVORITE_WIDGETS }, (_, index) =>
      favorite({
        id: `fav-seed-${index}`,
        url: `https://example-${index}.com/`,
        domain: `example-${index}.com`,
        grid: g(index % 12, Math.floor(index / 12))
      })
    );
    await seed(store, items);

    await assert.rejects(
      () => service.addFavorite({ url: "https://new.example.com" }, COLS),
      new RegExp(`up to ${MAX_FAVORITE_WIDGETS} favorites`)
    );
    assert.equal((await store.getState()).items.length, MAX_FAVORITE_WIDGETS);
  });

  it("serializes simultaneous mutations from services sharing one store", async () => {
    const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
    await seed(store, [
      favorite({ id: "fav-a", url: "https://a.example.com/", domain: "a.example.com", grid: g(0, 0) }),
      favorite({ id: "fav-b", url: "https://b.example.com/", domain: "b.example.com", grid: g(1, 0) }),
      favorite({ id: "fav-c", url: "https://c.example.com/", domain: "c.example.com", grid: g(2, 0) })
    ]);

    const serviceA = createWidgetsService({
      store,
      now: () => NOW,
      defaultBackgroundColor: () => "#24292f"
    });
    const serviceB = createWidgetsService({
      store,
      now: () => NOW,
      defaultBackgroundColor: () => "#24292f"
    });

    // The move targets the cell the delete frees: it only succeeds if the two run one after the other.
    await Promise.all([
      serviceA.deleteFavorite("fav-a", COLS),
      serviceB.moveWidget("fav-c", { x: 0, y: 0 }, COLS)
    ]);

    const stored = await store.getState();
    assert.deepEqual(gridsOf(stored), { "fav-b": g(1, 0), "fav-c": g(0, 0) });
  });

  it("keeps the favorites lock available after a rejected mutation", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    await assert.rejects(
      () => service.moveWidget("missing", { x: 0, y: 0 }, COLS),
      LinkGoneError // an unknown id is a link gone elsewhere (docs/stale-link-and-host-contrast.md); the lock must still be free
    );

    const state = await service.moveWidget("fav-1", { x: 3, y: 0 }, COLS);
    assert.deepEqual(gridsOf(state), { "fav-1": g(3, 0) });
  });

  it("tags added favorites with type: 'favorite'", async () => {
    const { service } = await createHarness();
    const state = await service.addFavorite({ url: "example.com" }, COLS);
    assert.equal(state.items[0].type, "favorite");
  });

  it("rejects a move onto an occupied cell with a PlacementError", async () => {
    const { service, store } = await createHarness();
    await seed(store, [favorite({ id: "a", grid: g(0, 0) }), favorite({ id: "b", grid: g(1, 0) })]);
    await assert.rejects(() => service.moveWidget("a", { x: 1, y: 0 }, COLS), PlacementError);
  });
});

describe("widgetsService: whole-window drag (AS-DL-11)", () => {
  // Layout A (0,0), B (0,1); every call starts from a fresh store.
  async function twoTiles() {
    const h = await createHarness();
    await seed(h.store, [favorite({ id: "A", grid: g(0, 0) }), favorite({ id: "B", grid: g(0, 1) })], 15);
    return h;
  }

  it("moveWidget with viewportRows 9 accepts a row of the first screen and stores it", async () => {
    const { service, store } = await twoTiles();
    const state = await service.moveWidget("A", { x: 4, y: 7 }, { columns: 15, viewportRows: 9 });
    assert.deepEqual(gridsOf(state, 15), { A: g(4, 7), B: g(0, 1) });
    assert.deepEqual(gridsOf(await store.getState(), 15), { A: g(4, 7), B: g(0, 1) });
  });

  it("without viewportRows the old rule holds (lowest row 1: row 2 at most)", async () => {
    const { service, store } = await twoTiles();
    await assert.rejects(() => service.moveWidget("A", { x: 4, y: 7 }, { columns: 15 }), PlacementError);
    assert.deepEqual(gridsOf(await store.getState(), 15), { A: g(0, 0), B: g(0, 1) });
    const state = await service.moveWidget("A", { x: 4, y: 2 }, { columns: 15 });
    assert.deepEqual(gridsOf(state, 15), { A: g(4, 2), B: g(0, 1) });
  });

  it("a viewportRows that is not an integer in 0..4096 is treated as 0: it only narrows the area", async () => {
    for (const bad of [Number.NaN, 1.5, -1, "9", null, Number.POSITIVE_INFINITY, 4097, 1e9]) {
      const { service, store } = await twoTiles();
      await assert.rejects(
        () => service.moveWidget("A", { x: 4, y: 7 }, { columns: 15, viewportRows: bad }),
        PlacementError,
        String(bad)
      );
      assert.deepEqual(gridsOf(await store.getState(), 15), { A: g(0, 0), B: g(0, 1) }, String(bad));
    }
  });

  it("the upper bound 4096 itself is a valid viewportRows", async () => {
    const { service } = await twoTiles();
    const state = await service.moveWidget("A", { x: 4, y: 7 }, { columns: 15, viewportRows: 4096 });
    assert.deepEqual(shown(state.items.find((item) => item.id === "A").grid, 15), g(4, 7));
  });

  it("the last column is a target; one past it is not", async () => {
    const { service } = await twoTiles();
    const state = await service.moveWidget("A", { x: 14, y: 0 }, { columns: 15 });
    assert.deepEqual(shown(state.items.find((item) => item.id === "A").grid, 15), g(14, 0));
    const fresh = await twoTiles();
    await assert.rejects(() => fresh.service.moveWidget("A", { x: 15, y: 0 }, { columns: 15 }), PlacementError);
  });

  it("a 2-wide block ends at the last column: x 21 of 23 fits, x 22 does not", async () => {
    const h = await createHarness();
    await seed(h.store, [favorite({ id: "A", grid: g(0, 0, 2, 1) })], 23);
    const state = await h.service.moveWidget("A", { x: 21, y: 0 }, { columns: 23 });
    assert.deepEqual(shown(state.items[0].grid, 23), g(21, 0, 2, 1));
    const fresh = await createHarness();
    await seed(fresh.store, [favorite({ id: "A", grid: g(0, 0, 2, 1) })], 23);
    await assert.rejects(() => fresh.service.moveWidget("A", { x: 22, y: 0 }, { columns: 23 }), PlacementError);
  });

  it("a column count above 12 is accepted for every mutation", async () => {
    for (const columns of [13, 15, 62]) {
      const { service } = await twoTiles();
      const added = await service.addFavorite({ url: "example.com" }, { columns });
      assert.equal(added.items.length, 3, `add at ${columns}`);
      const moved = await service.moveWidget("A", { x: columns - 1, y: 0 }, { columns });
      assert.deepEqual(shown(moved.items.find((item) => item.id === "A").grid, columns), g(columns - 1, 0), `move at ${columns}`);
      const resized = await service.updateFavorite("A", { w: 2 }, { columns });
      assert.equal(resized.items.find((item) => item.id === "A").grid.w, 2, `resize at ${columns}`);
    }
  });

  it("an invalid column count still throws the same error", async () => {
    for (const columns of [1, 1.5, Number.NaN, "15", undefined, null, 0, -4]) {
      const { service } = await twoTiles();
      const message = /The current column count is required/;
      await assert.rejects(() => service.moveWidget("A", { x: 1, y: 0 }, { columns }), message, String(columns));
      await assert.rejects(() => service.addFavorite({ url: "example.com" }, { columns }), message, String(columns));
      await assert.rejects(() => service.deleteFavorite("A", { columns }), message, String(columns));
    }
  });

  it("own row (N1): a tile that sits below the allowed area may stay in its row without viewportRows", async () => {
    const { service, store } = await createHarness();
    await seed(store, [favorite({ id: "A", grid: g(0, 5) }), favorite({ id: "B", grid: g(1, 0) }), favorite({ id: "C", grid: g(2, 0) })], 15);
    const state = await service.moveWidget("A", { x: 3, y: 5 }, { columns: 15 });
    assert.deepEqual(shown(state.items.find((item) => item.id === "A").grid, 15), g(3, 5));
    await assert.rejects(() => service.moveWidget("A", { x: 3, y: 6 }, { columns: 15 }), PlacementError);
    // and with viewportRows (the first screen is shorter than the own row)
    const up = await service.moveWidget("A", { x: 4, y: 8 }, { columns: 15, viewportRows: 9 });
    assert.deepEqual(shown(up.items.find((item) => item.id === "A").grid, 15), g(4, 8));
  });

  it("every drop the page's rule accepts, the service accepts (same helper, same numbers)", async () => {
    // lowest row 12, 9 viewport rows: row 13 is the last target, 14 is not.
    const h = await createHarness();
    await seed(h.store, [favorite({ id: "A", grid: g(0, 0) }), favorite({ id: "L", grid: g(10, 12) })], 15);
    const state = await h.service.moveWidget("A", { x: 3, y: 13 }, { columns: 15, viewportRows: 9 });
    assert.deepEqual(shown(state.items.find((item) => item.id === "A").grid, 15), g(3, 13));
    const fresh = await createHarness();
    await seed(fresh.store, [favorite({ id: "A", grid: g(0, 0) }), favorite({ id: "L", grid: g(10, 12) })], 15);
    await assert.rejects(() => fresh.service.moveWidget("A", { x: 3, y: 14 }, { columns: 15, viewportRows: 9 }), PlacementError);
  });
});

describe("stored backgroundColorSource enum survives the label rename", () => {
  it("accepts items whose backgroundColorSource is auto or manual", () => {
    const base = createInitialWidgetsState("2026-07-11T00:00:00.000Z");
    for (const source of ["auto", "manual"]) {
      const state = {
        ...base,
        items: [
          {
            id: "fav-1",
            type: "favorite",
            url: "https://example.com/",
            label: "Example",
            domain: "example.com",
            iconMode: "favicon",
            customIconUrl: null,
            backgroundColor: "#24292f",
            backgroundColorSource: source,
            grid: g(0, 0),
            createdAt: base.createdAt,
            updatedAt: base.updatedAt
          }
        ]
      };
      assert.equal(isWidgetsState(state), true, `source=${source}`);
    }
  });

  it("rejects a renamed/localized backgroundColorSource value", () => {
    const base = createInitialWidgetsState("2026-07-11T00:00:00.000Z");
    const valid = {
      ...base,
      items: [
        {
          id: "fav-1",
          type: "favorite",
          url: "https://example.com/",
          label: "Example",
          domain: "example.com",
          iconMode: "favicon",
          customIconUrl: null,
          backgroundColor: "#24292f",
          backgroundColorSource: "auto",
          grid: g(0, 0),
          createdAt: base.createdAt,
          updatedAt: base.updatedAt
        }
      ]
    };
    assert.equal(isWidgetsState(valid), true, "the fixture is otherwise valid");
    const state = { ...valid, items: [{ ...valid.items[0], backgroundColorSource: "auto-detect" }] };
    assert.equal(isWidgetsState(state), false);
  });
});

// Two favorites and the four weather tiles on a 12-column grid.
async function serviceWithMetrics() {
  const area = createMemoryStorageArea();
  const store = createWidgetsStore(area);
  let n = 0;
  const service = createWidgetsService({ store, createId: () => `new${n++}` });
  await seed(store, [
    favorite({ id: "f0", url: "https://f0.example.com/", domain: "f0.example.com", grid: g(0, 0) }),
    favorite({ id: "f1", url: "https://f1.example.com/", domain: "f1.example.com", grid: g(1, 0) }),
    metric("weather:temperature", { grid: g(2, 0) }),
    metric("weather:precipitation", { grid: g(3, 0, 2, 1) }),
    metric("weather:airQuality", { grid: g(5, 0, 2, 1) }),
    metric("weather:uv", { grid: g(7, 0) })
  ]);
  return { area, store, service };
}

describe("widgetsService with weather metrics", () => {
  it("places a new favorite in the first free cell, leaving the weather tiles where they are", async () => {
    const { service } = await serviceWithMetrics();
    const state = await service.addFavorite({ url: "https://new.example.com" }, COLS);
    const grids = gridsOf(state);
    assert.deepEqual(grids.new0, g(8, 0));
    assert.deepEqual(grids["weather:temperature"], g(2, 0));
    assert.deepEqual(grids["weather:uv"], g(7, 0)); // displayed cells at 12 columns; the new link is the free cell nearest the center (8, then 9..)
  });

  it("updates a metric's size and enabled, rejects bad input and unknown ids", async () => {
    const { service } = await serviceWithMetrics();
    const state = await service.updateWeatherMetric("weather:temperature", { w: 2, enabled: false }, COLS);
    const t = state.items.find((i) => i.id === "weather:temperature");
    assert.deepEqual([t.grid.w, t.enabled], [2, false]);
    // docs/stale-tab-recovery-followups.md decision 2: an id nobody has is "gone" (a stale tab after the storage was cleared)
    await assert.rejects(service.updateWeatherMetric("weather:nope", { enabled: true }, COLS), (error) => error instanceof LinkGoneError && error.code === "link-gone" && error.id === "weather:nope");
    await assert.rejects(service.updateWeatherMetric("weather:uv", { w: 3 }, COLS), /tile width/);
    await assert.rejects(service.updateWeatherMetric("weather:uv", { enabled: "yes" }, COLS), /whether the weather tile is shown/);
    await assert.rejects(service.updateWeatherMetric("f0", { enabled: true }, COLS), /Weather tile not found/);
  });

  it("restoring a hidden metric keeps its 1×2 footprint (docs/tile-size-1x2.md, spec gate carry-over L0-06)", async () => {
    const { service } = await serviceWithMetrics();
    await service.updateWeatherMetric("weather:temperature", { w: 1, h: 2 }, COLS);
    await service.updateWeatherMetric("weather:temperature", { enabled: false }, COLS);
    const state = await service.updateWeatherMetric("weather:temperature", { enabled: true }, COLS);
    const t = state.items.find((i) => i.id === "weather:temperature");
    assert.deepEqual([t.enabled, t.grid.w, t.grid.h], [true, 1, 2]);
  });

  it("does not let favorite operations touch a metric", async () => {
    const { service } = await serviceWithMetrics();
    await assert.rejects(service.deleteFavorite("weather:uv", COLS), /Favorite not found/);
    await assert.rejects(service.updateFavorite("weather:uv", { label: "x" }, COLS), /Favorite not found/);
  });

  it("a metric id is not a gone link: Favorite not found for update/delete; a hidden metric cannot be moved (Widget not found)", async () => {
    const { service } = await serviceWithMetrics();
    await assert.rejects(service.deleteFavorite("weather:uv", COLS), (error) => !(error instanceof LinkGoneError) && /Favorite not found/.test(error.message));
    await assert.rejects(service.updateFavorite("weather:uv", { label: "x" }, COLS), (error) => !(error instanceof LinkGoneError) && /Favorite not found/.test(error.message));
    await service.updateWeatherMetric("weather:uv", { enabled: false }, COLS);
    await assert.rejects(service.moveWidget("weather:uv", { x: 0, y: 5 }, COLS), (error) => !(error instanceof LinkGoneError) && /Widget not found/.test(error.message));
    await assert.rejects(service.moveWidget("f0", { x: 99, y: 99 }, COLS), (error) => !(error instanceof LinkGoneError)); // an existing id keeps the old paths (here a placement refusal)
  });

  it("every mutation reports the newer-version message (not 'not found') when the meta became newer", async () => {
    const { area, service } = await serviceWithMetrics();
    const before = await area.get(null);
    const newer = { ...before.quietTabWidgetsMeta, version: 4 };
    await area.set({ quietTabWidgetsMeta: newer });
    const snapshot = await area.get(null);
    const message = { message: NEWER_WIDGETS_MESSAGE };
    await assert.rejects(service.updateWeatherMetric("weather:uv", { enabled: false }, COLS), message);
    await assert.rejects(service.moveWidget("weather:uv", { x: 0, y: 1 }, COLS), message);
    await assert.rejects(service.deleteFavorite("f0", COLS), message);
    await assert.rejects(service.updateFavorite("f0", { label: "x" }, COLS), message);
    await assert.rejects(service.addFavorite({ url: "https://n.example.com" }, COLS), message);
    assert.deepEqual(await area.get(null), snapshot);
  });
});

describe("addFavorites island (docs/post-onboarding-grid.md)", () => {
  const starter = (n) => ({ url: `https://site${n}.example/`, label: `Site ${n}`, w: 2, h: 1 });
  const FRESH = () => [
    metric("weather:temperature", { grid: g(2, 4) }),
    metric("weather:precipitation", { grid: g(3, 4, 2, 1) }),
    metric("weather:airQuality", { grid: g(5, 4, 2, 1) }),
    metric("weather:uv", { grid: g(7, 4) }),
    { id: "chrome:settings", type: "chrome", role: "settings", grid: g(8, 4) },
    { id: "chrome:add", type: "chrome", role: "add", grid: g(9, 4) }
  ];

  async function harness(items) {
    const area = createMemoryStorageArea();
    const sets = [];
    const set = area.set.bind(area);
    area.set = async (values) => {
      sets.push(Object.keys(values));
      return set(values);
    };
    const store = createWidgetsStore(area, { now: () => NOW });
    let id = 0;
    const service = createWidgetsService({ store, now: () => NOW, createId: () => `fav-${++id}`, defaultBackgroundColor: () => "#24292f" });
    await seed(store, items);
    sets.length = 0;
    return { service, store, sets };
  }

  it("fresh desk, k = 3: one set(), the table grids (rows 9: dx -2, dy 2), 3 ids", async () => {
    const { service, store, sets } = await harness(FRESH());
    const ids = await service.addFavorites([starter(1), starter(2), starter(3)], { columns: 12, island: { rows: 9 } });
    assert.deepEqual(ids, ["fav-1", "fav-2", "fav-3"]);
    assert.equal(sets.length, 1, "exactly one chrome.storage.sync.set");
    assert.deepEqual(storedGridsOf(await store.getState()), {
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

  it("fresh desk, k = 0: the system-only island is written (temperature 1×2), one set(), no ids", async () => {
    const { service, store, sets } = await harness(FRESH());
    assert.deepEqual(await service.addFavorites([], { columns: 12, island: { rows: 9 } }), []);
    assert.equal(sets.length, 1);
    const grids = storedGridsOf(await store.getState());
    assert.deepEqual(grids["weather:temperature"], { x: -1, y: 3, w: 1, h: 2 });
    assert.deepEqual(grids["chrome:add"], { x: 1, y: 5, w: 1, h: 1 });
  });

  it("fresh desk keeps the added links as favorites with their data (island only moves grids)", async () => {
    const { service, store } = await harness(FRESH());
    await service.addFavorites([starter(1)], { columns: 12, island: { rows: 9 } });
    const item = (await store.getState()).items.find((x) => x.id === "fav-1");
    assert.equal(item.type, "favorite");
    assert.equal(item.url, "https://site1.example/");
    assert.equal(item.label, "Site 1");
  });

  it("not fresh (an existing favorite): 2×1 placeNew links, no system tile moves, no island", async () => {
    const { service, store } = await harness([...FRESH(), favorite({ id: "old", url: "https://old.example/", grid: g(2, 9) })]);
    const before = storedGridsOf(await store.getState());
    const ids = await service.addFavorites([starter(1), starter(2)], { columns: 12, island: { rows: 9 } });
    const after = storedGridsOf(await store.getState());
    for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], key);
    for (const id of ids) assert.deepEqual([after[id].w, after[id].h], [2, 1], id);
  });

  it("not fresh and no link added: nothing is written and the state is returned (no-op rule)", async () => {
    const { service, store, sets } = await harness([...FRESH(), favorite({ id: "old", url: "https://old.example/", grid: g(2, 9) })]);
    const before = JSON.stringify(await store.getState());
    assert.deepEqual(await service.addFavorites([], { columns: 12, island: { rows: 9 } }), []);
    assert.equal(sets.length, 0, "no set()");
    assert.equal(JSON.stringify(await store.getState()), before);
  });

  it("a dedupe-only call on a not-fresh desk writes nothing (AS-POG-19 shape)", async () => {
    const { service, sets } = await harness([...FRESH(), favorite({ id: "old", url: "https://site1.example/", grid: g(2, 9) })]);
    assert.deepEqual(await service.addFavorites([starter(1)], { columns: 12, island: { rows: 9 } }), []);
    assert.equal(sets.length, 0);
  });

  it("a hidden metric or a resized temperature is not fresh (AS-POG-05)", async () => {
    const hiddenUv = FRESH().map((item) => (item.id === "weather:uv" ? { ...item, enabled: false } : item));
    // temperature 2×1 pushes the rest one cell right so the seed has no overlap
    const wideTemperature = FRESH().map((item) =>
      item.id === "weather:temperature" ? { ...item, grid: g(2, 4, 2, 1) } : { ...item, grid: { ...item.grid, x: item.grid.x + 1 } });
    for (const items of [hiddenUv, wideTemperature]) {
      const { service, store } = await harness(items);
      const before = storedGridsOf(await store.getState());
      const ids = await service.addFavorites([starter(1), starter(2), starter(3)], { columns: 12, island: { rows: 9 } });
      const after = storedGridsOf(await store.getState());
      for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], key);
      for (const id of ids) assert.deepEqual([after[id].w, after[id].h], [2, 1]);
    }
  });

  it("too narrow: k = 6 at 4 columns falls back (links 2×1, system grids = the usual rebase), k = 3 still applies", async () => {
    const six = Array.from({ length: 6 }, (_, i) => starter(i + 1));
    {
      const { service, store } = await harness(FRESH());
      const state = await store.getState();
      const ids = await service.addFavorites(six, { columns: 4, island: { rows: 9 } });
      const after = await store.getState();
      assert.equal(ids.length, 6);
      for (const id of ids) {
        const grid = after.items.find((x) => x.id === id).grid;
        assert.deepEqual([grid.w, grid.h], [2, 1]);
      }
      assert.equal(after.items.find((x) => x.id === "weather:temperature").grid.h, 1, "no island: temperature stays 1×1");
      assert.equal(state.items.length + 6, after.items.length);
    }
    {
      const { service, store } = await harness(FRESH());
      await service.addFavorites(six.slice(0, 3), { columns: 4, island: { rows: 9 } });
      assert.equal((await store.getState()).items.find((x) => x.id === "weather:temperature").grid.h, 2, "k = 3 (W = 4) fits 4 columns");
    }
  });

  it("island: null behaves as no island option", async () => {
    const { service, store } = await harness(FRESH());
    const ids = await service.addFavorites([starter(1)], { columns: 12, island: null });
    assert.equal(ids.length, 1);
    assert.equal((await store.getState()).items.find((x) => x.id === "weather:temperature").grid.h, 1);
  });

  it("k counts the links really added: a repeated URL on a fresh desk gives k = 1", async () => {
    const { service, store } = await harness(FRESH());
    const ids = await service.addFavorites([starter(1), starter(1)], { columns: 12, island: { rows: 9 } });
    assert.equal(ids.length, 1);
    const state = await store.getState();
    assert.equal(state.items.length, 7);
    assert.deepEqual(storedGridsOf(state)["weather:temperature"], { x: -1, y: 3, w: 1, h: 1 }, "k = 1 island: W = 3");
  });

  it("more than 8 links: no island (AS-POG-17)", async () => {
    const { service, store } = await harness(FRESH());
    const ids = await service.addFavorites(Array.from({ length: 9 }, (_, i) => starter(i + 1)), { columns: 12, island: { rows: 9 } });
    assert.equal(ids.length, 9);
    assert.equal((await store.getState()).items.find((x) => x.id === "weather:temperature").grid.h, 1);
  });

  it("invalid rows: dy = 0 (AS-POG-17)", async () => {
    for (const rows of [0, 1.5, "9", undefined]) {
      const { service, store } = await harness(FRESH());
      await service.addFavorites([starter(1), starter(2), starter(3)], { columns: 12, island: { rows } });
      assert.equal((await store.getState()).items.find((x) => x.id === "weather:temperature").grid.y, 0, String(rows));
    }
  });

  it("without `island` addFavorites behaves as before (links by placeNew, system tiles untouched)", async () => {
    const { service, store } = await harness(FRESH());
    const before = storedGridsOf(await store.getState());
    const ids = await service.addFavorites([starter(1), starter(2)], COLS);
    const after = storedGridsOf(await store.getState());
    for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], key);
    for (const id of ids) assert.deepEqual([after[id].w, after[id].h], [2, 1]);
  });

  it("the cap error still wins and nothing is written", async () => {
    const { service, sets } = await harness(FRESH());
    await assert.rejects(service.addFavorites(Array.from({ length: MAX_FAVORITE_WIDGETS + 1 }, (_, i) => starter(i + 1)), { columns: 12, island: { rows: 9 } }));
    assert.equal(sets.length, 0);
  });

  it("assertWritable runs before the no-op path (a locked store refuses a zero-link call)", async () => {
    const area = createMemoryStorageArea({ quietTabWidgetsMeta: { version: 99 } });
    const store = createWidgetsStore(area, { now: () => NOW });
    const service = createWidgetsService({ store, now: () => NOW, createId: () => "x" });
    await assert.rejects(service.addFavorites([], { columns: 12, island: { rows: 9 } }));
  });
});
