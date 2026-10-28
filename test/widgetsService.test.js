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

  // Run 51 (docs/unreadable-grid-reset.md decision 3): a stored tileSize is ignored data; a write neither strips nor validates it.
  it("leaves an extra tileSize alone on any edit of a link, size or not", async () => {
    const { service, store } = await createHarness();
    await seed(store, [favorite({ tileSize: "wide", grid: g(0, 0, 2, 1) }), favorite({ id: "fav-2", tileSize: "huge", grid: g(2, 0) })]);
    assert.equal((await store.getState()).items[0].tileSize, "wide", "the seed keeps the field");

    const labelOnly = await service.updateFavorite("fav-1", { label: "Renamed" }, COLS);
    assert.equal(labelOnly.items[0].tileSize, "wide");
    assert.deepEqual(shown(labelOnly.items[0].grid), g(0, 0, 2, 1));
    const resized = await service.updateFavorite("fav-2", { w: 2, h: 2 }, COLS);
    assert.equal(resized.items[1].tileSize, "huge");
    assert.equal(resized.items[1].label, "Example");
    const stored = await store.getState();
    assert.deepEqual(stored.items.map((item) => item.tileSize), ["wide", "huge"]);
  });

  it("leaves an extra tileSize alone on a weather metric: hide, restore and resize", async () => {
    const { service, store } = await createHarness();
    await seed(store, [metric("weather:uv", { tileSize: "wide", grid: g(0, 0) }), metric("weather:temperature", { tileSize: "huge", grid: g(2, 0) })]);
    const hidden = await service.updateWeatherMetric("weather:uv", { enabled: false }, COLS);
    assert.equal(hidden.items[0].tileSize, "wide");
    const restored = await service.updateWeatherMetric("weather:uv", { enabled: true }, COLS);
    assert.equal(restored.items[0].tileSize, "wide");
    const resized = await service.updateWeatherMetric("weather:temperature", { w: 2 }, COLS);
    assert.equal(resized.items[1].tileSize, "huge");
    assert.deepEqual((await store.getState()).items.map((item) => item.tileSize), ["wide", "huge"]);
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
      new RegExp(`up to ${MAX_FAVORITE_WIDGETS} links`)
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
    await assert.rejects(service.deleteFavorite("weather:uv", COLS), /Link not found/);
    await assert.rejects(service.updateFavorite("weather:uv", { label: "x" }, COLS), /Link not found/);
  });

  it("a metric id is not a gone link: Link not found for update/delete; a hidden metric cannot be moved (Tile not found)", async () => {
    const { service } = await serviceWithMetrics();
    await assert.rejects(service.deleteFavorite("weather:uv", COLS), (error) => !(error instanceof LinkGoneError) && /Link not found/.test(error.message));
    await assert.rejects(service.updateFavorite("weather:uv", { label: "x" }, COLS), (error) => !(error instanceof LinkGoneError) && /Link not found/.test(error.message));
    await service.updateWeatherMetric("weather:uv", { enabled: false }, COLS);
    await assert.rejects(service.moveWidget("weather:uv", { x: 0, y: 5 }, COLS), (error) => !(error instanceof LinkGoneError) && /Tile not found/.test(error.message));
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
    await assert.rejects(service.addFavorites(Array.from({ length: MAX_FAVORITE_WIDGETS + 1 }, (_, i) => starter(i + 1)), { columns: 12, island: { rows: 9 } }), /up to 200 links/);
    assert.equal(sets.length, 0);
  });

  it("assertWritable runs before the no-op path (a locked store refuses a zero-link call)", async () => {
    const area = createMemoryStorageArea({ quietTabWidgetsMeta: { version: 99 } });
    const store = createWidgetsStore(area, { now: () => NOW });
    const service = createWidgetsService({ store, now: () => NOW, createId: () => "x" });
    await assert.rejects(service.addFavorites([], { columns: 12, island: { rows: 9 } }));
  });
});

// Run 43 (docs/link-dialog-validation.md decisions 1-3): a link must look like a web address, length limits with plain
// messages, and every validation error carries the field it is about. Built-in `new URL` accepts several of these inputs
// (`example.com/a b`, `http://bad!host.com`, a tab inside the path), so these are red until the service checks them itself.
describe("widgetsService link dialog validation (run 43)", async () => {
  const shared = await import("../src/favoritesShared.js"); // namespace import: a missing constant fails its test, not the whole file
  const URL_MAX = 2000;
  const LABEL_MAX = 100;
  const BASE = "https://example.com/";
  const urlOfLength = (total) => BASE + "a".repeat(total - BASE.length);
  const hostOfLength = (len) => {
    const host = ("a".repeat(49) + ".").repeat(Math.ceil(len / 50) + 1).slice(0, len);
    return host.endsWith(".") ? `${host.slice(0, -1)}a` : host;
  };
  const failsWith = (message, field) => (error) => {
    assert.equal(error.message, message);
    assert.equal(error.field, field, `error.field for "${message}"`);
    return true;
  };

  it("exports the limits as constants (2000 for links, 100 for names)", () => {
    assert.equal(shared.LINK_URL_MAX_LENGTH, URL_MAX);
    assert.equal(shared.LINK_LABEL_MAX_LENGTH, LABEL_MAX);
  });

  describe("decision 1: accepted addresses (stay saved)", () => {
    const accepted = [
      ["example.com", "https://example.com/", "example.com"],
      ["localhost", "https://localhost/", "localhost"],
      ["localhost:3000/a", "https://localhost:3000/a", "localhost"],
      ["intranet/wiki", "https://intranet/wiki", "intranet"],
      ["192.168.0.1", "https://192.168.0.1/", "192.168.0.1"],
      ["[::1]:8080", "https://[::1]:8080/", "[::1]"],
      ["http://my_host.local", "http://my_host.local/", "my_host.local"],
      ["example.com/a%20b", "https://example.com/a%20b", "example.com"],
      ["example.com/path?q=a+b", "https://example.com/path?q=a+b", "example.com"],
      ["пример.рф", "https://xn--e1afmkfd.xn--p1ai/", "xn--e1afmkfd.xn--p1ai"],
      ["  example.org/ok  ", "https://example.org/ok", "example.org"]
    ];
    for (const [input, url, domain] of accepted) {
      it(`accepts "${input}"`, () => {
        assert.deepEqual(normalizeFavoriteUrl(input), { url, domain });
      });
    }
  });

  describe("decision 1: rejected addresses", () => {
    // Node's URL parser already throws for the first group; the second group (and the whitespace the parser strips or encodes) is
    // accepted by `new URL` and rejected only by the new rules.
    const rejected = [
      "not a url !!",
      "a b.com",
      "https://exa mple.com",
      "example.com/a b",
      "example.com/path?q=a b",
      "example.com/a\tb",
      "example.com/a\nb",
      "example.com/a b",
      "example.com/a b",
      "http://bad!host.com",
      "http://bad,host.com",
      "http://bad$host.com",
      "http://bad(host).com",
      "http://bad'host.com",
      "http://bad*host.com",
      "https://",
      "http://"
    ];
    for (const input of rejected) {
      it(`rejects ${JSON.stringify(input)} with "Enter a valid URL" for the url field`, () => {
        assert.throws(() => normalizeFavoriteUrl(input), failsWith("Enter a valid URL", "url"));
      });
    }
  });

  describe("order of the checks in normalizeFavoriteUrl", () => {
    it("empty wins: 'Enter a URL' (field url)", () => {
      assert.throws(() => normalizeFavoriteUrl("   "), failsWith("Enter a URL", "url"));
    });

    it("length wins over whitespace and parsing: a 2001-character spaced string is 'too long'", () => {
      const spaced = "x ".repeat(1000) + "xy"; // 2002 characters, 2002 after trim
      assert.equal(spaced.trim().length > URL_MAX, true);
      assert.throws(() => normalizeFavoriteUrl(spaced), failsWith("That link is too long (up to 2000 characters)", "url"));
    });

    it("whitespace and parse win over the protocol: 'ftp://bad host' is 'Enter a valid URL'", () => {
      assert.throws(() => normalizeFavoriteUrl("ftp://bad host"), failsWith("Enter a valid URL", "url"));
    });

    it("the protocol wins over the host: 'ftp://bad!host.com' is the protocol message", () => {
      assert.throws(() => normalizeFavoriteUrl("ftp://bad!host.com"), failsWith("Only http and https URLs are supported", "url"));
      assert.throws(() => normalizeFavoriteUrl("javascript:alert(1)"), failsWith("Only http and https URLs are supported", "url"));
    });
  });

  describe("decision 2: link length (typed text and normalized href)", () => {
    it("2000 characters pass, 2001 fail (boundary)", () => {
      assert.equal(normalizeFavoriteUrl(urlOfLength(URL_MAX)).url.length, URL_MAX);
      assert.throws(() => normalizeFavoriteUrl(urlOfLength(URL_MAX + 1)), failsWith("That link is too long (up to 2000 characters)", "url"));
      assert.throws(() => normalizeFavoriteUrl(urlOfLength(9000)), failsWith("That link is too long (up to 2000 characters)", "url"));
    });

    it("surrounding spaces do not count (the trimmed text is measured)", () => {
      assert.equal(normalizeFavoriteUrl(`  ${urlOfLength(URL_MAX)}  `).url.length, URL_MAX);
    });

    it("a typed text of 2000 characters whose https-prefixed href is longer is rejected on the href", () => {
      const typed = "example.com/" + "a".repeat(URL_MAX - "example.com/".length);
      assert.equal(typed.length, URL_MAX);
      assert.throws(() => normalizeFavoriteUrl(typed), failsWith("That link is too long (up to 2000 characters)", "url"));
    });

    it("a short non-ASCII path that grows past 2000 once percent-encoded is rejected", () => {
      const typed = BASE + "я".repeat(700);
      assert.equal(typed.length, 720);
      assert.equal(new URL(typed).href.length > URL_MAX, true, "premise: the normalized href grows");
      assert.throws(() => normalizeFavoriteUrl(typed), failsWith("That link is too long (up to 2000 characters)", "url"));
      assert.throws(() => normalizeFavoriteUrl(BASE + "😀".repeat(500)), failsWith("That link is too long (up to 2000 characters)", "url"));
    });

    it("a non-ASCII path whose encoded href stays within 2000 characters passes", () => {
      const result = normalizeFavoriteUrl(BASE + "я".repeat(300));
      assert.equal(result.url.length <= URL_MAX, true);
    });
  });

  describe("normalizeNullableImageUrl: icon link", () => {
    it("2000 pass, 2001 fail with the icon message for the customIconUrl field", () => {
      const icon = (total) => "https://example.com/i" + "b".repeat(total - "https://example.com/i".length);
      assert.equal(normalizeNullableImageUrl(icon(URL_MAX)).length, URL_MAX);
      assert.throws(() => normalizeNullableImageUrl(icon(URL_MAX + 1)), failsWith("That icon link is too long (up to 2000 characters)", "customIconUrl"));
    });

    it("the normalized href counts too (typed 2000 without a scheme, href longer)", () => {
      const typed = "example.com/i" + "b".repeat(URL_MAX - "example.com/i".length);
      assert.throws(() => normalizeNullableImageUrl(typed), failsWith("That icon link is too long (up to 2000 characters)", "customIconUrl"));
    });

    it("the existing icon messages carry the customIconUrl field", () => {
      assert.throws(() => normalizeNullableImageUrl("ftp://x/i.png"), failsWith("Only http and https image URLs are supported", "customIconUrl"));
      assert.throws(() => normalizeNullableImageUrl("http://"), failsWith("Enter a valid image URL", "customIconUrl"));
    });

    it("an icon link is not checked for spaces or junk (only its length)", () => {
      assert.equal(normalizeNullableImageUrl("example.com/a b.png"), "https://example.com/a%20b.png");
    });
  });

  describe("addFavorite", () => {
    const rejectsWithoutWriting = async (payload, message, field) => {
      const { service, store } = await createHarness();
      await assert.rejects(service.addFavorite(payload, COLS), failsWith(message, field));
      assert.deepEqual((await store.getState()).items, [], "nothing is written");
    };

    it("rejects a spaced address and writes nothing", async () => {
      await rejectsWithoutWriting({ url: "example.com/a b" }, "Enter a valid URL", "url");
      await rejectsWithoutWriting({ url: "http://bad!host.com" }, "Enter a valid URL", "url");
    });

    it("name: 100 characters pass, 101 fail with the name message for the label field (nothing written)", async () => {
      const { service } = await createHarness();
      const state = await service.addFavorite({ url: "example.com", label: "n".repeat(LABEL_MAX) }, COLS);
      assert.equal(state.items[0].label.length, LABEL_MAX);
      await rejectsWithoutWriting({ url: "example.com", label: "n".repeat(LABEL_MAX + 1) }, "That name is too long (up to 100 characters)", "label");
    });

    it("name: surrounding spaces do not count", async () => {
      const { service } = await createHarness();
      const state = await service.addFavorite({ url: "example.com", label: `  ${"n".repeat(LABEL_MAX)}  ` }, COLS);
      assert.equal(state.items[0].label, "n".repeat(LABEL_MAX));
    });

    it("icon link: 2000 pass, 2001 fail (field customIconUrl), even with the icon mode left on 'favicon'", async () => {
      const icon = (total) => "https://example.com/i" + "b".repeat(total - "https://example.com/i".length);
      const { service } = await createHarness();
      const state = await service.addFavorite({ url: "example.com", iconMode: "favicon", customIconUrl: icon(URL_MAX) }, COLS);
      assert.equal(state.items[0].customIconUrl.length, URL_MAX);
      await rejectsWithoutWriting({ url: "example.com", iconMode: "favicon", customIconUrl: icon(URL_MAX + 1) }, "That icon link is too long (up to 2000 characters)", "customIconUrl");
    });

    it("order of the field checks: Link, then Name, then Custom icon, then colour and icon mode", async () => {
      const longIcon = "https://example.com/i" + "b".repeat(URL_MAX);
      const longName = "n".repeat(LABEL_MAX + 1);
      const longUrl = urlOfLength(URL_MAX + 1);
      await rejectsWithoutWriting({ url: longUrl, label: longName, customIconUrl: longIcon, backgroundColor: "red" }, "That link is too long (up to 2000 characters)", "url");
      await rejectsWithoutWriting({ url: "example.com", label: longName, customIconUrl: longIcon, backgroundColor: "red" }, "That name is too long (up to 100 characters)", "label");
      await rejectsWithoutWriting({ url: "example.com", customIconUrl: longIcon, backgroundColor: "red", iconMode: "bogus" }, "That icon link is too long (up to 2000 characters)", "customIconUrl");
      await rejectsWithoutWriting({ url: "example.com", backgroundColor: "red" }, "Use a hex color like #24292f", "backgroundColor");
    });

    it("the 200-links limit is checked first (before an invalid address)", async () => {
      const { service, store } = await createHarness();
      await seed(store, Array.from({ length: 200 }, (_, i) => favorite({ id: `f${i}`, url: `https://site${i}.example.com/`, domain: `site${i}.example.com`, label: `Site ${i}`, grid: g(i % 12, Math.floor(i / 12)) })));
      await assert.rejects(service.addFavorite({ url: "not a url !!" }, COLS), (error) => error.message === "You can save up to 200 links" && error.field === undefined);
    });

    it("an empty Name with a 300-character host stores a label of exactly 100 characters (the host cut)", async () => {
      const host = hostOfLength(300);
      const { service } = await createHarness();
      const state = await service.addFavorite({ url: `https://${host}/` }, COLS);
      assert.equal(state.items[0].domain, host);
      assert.equal(state.items[0].label, host.slice(0, LABEL_MAX));
    });

    it("a host of 1990 characters with an empty Name and a 2000-character icon link saves and stays under the 8 KB item budget", async () => {
      const host = hostOfLength(1990);
      const icon = "https://example.com/i" + "b".repeat(URL_MAX - "https://example.com/i".length);
      const { service } = await createHarness();
      const state = await service.addFavorite({ url: `https://${host}/`, iconMode: "custom", customIconUrl: icon }, COLS);
      const item = state.items[0];
      assert.equal(item.label.length, LABEL_MAX);
      assert.equal(item.customIconUrl.length, URL_MAX);
      assert.equal(JSON.stringify(item).length < 8000, true, `item is ${JSON.stringify(item).length} characters`);
    });

    it("url, name and icon at their maxima save in one write", async () => {
      const icon = "https://example.com/i" + "b".repeat(URL_MAX - "https://example.com/i".length);
      const { service } = await createHarness();
      const state = await service.addFavorite({ url: urlOfLength(URL_MAX), label: "m".repeat(LABEL_MAX), iconMode: "custom", customIconUrl: icon }, COLS);
      assert.equal(state.items[0].url.length, URL_MAX);
      assert.equal(state.items[0].label.length, LABEL_MAX);
    });
  });

  describe("updateFavorite (Edit uses the same rules)", () => {
    const withLink = async (extra = {}) => {
      const { service, store } = await createHarness();
      await service.addFavorite({ url: "example.com", label: "Example", ...extra }, COLS);
      return { service, store };
    };
    const rejects = async (payload, message, field) => {
      const { service, store } = await withLink();
      const before = JSON.stringify((await store.getState()).items);
      await assert.rejects(service.updateFavorite("fav-1", payload, COLS), failsWith(message, field));
      assert.equal(JSON.stringify((await store.getState()).items), before, "nothing is written");
    };

    it("rejects spaced or junk addresses", async () => {
      await rejects({ url: "not a url !!" }, "Enter a valid URL", "url");
      await rejects({ url: "example.com/a b" }, "Enter a valid URL", "url");
      await rejects({ url: "http://bad!host.com" }, "Enter a valid URL", "url");
    });

    it("link: 2000 pass, 2001 fail", async () => {
      await rejects({ url: urlOfLength(URL_MAX + 1) }, "That link is too long (up to 2000 characters)", "url");
      const { service } = await withLink();
      const state = await service.updateFavorite("fav-1", { url: urlOfLength(URL_MAX) }, COLS);
      assert.equal(state.items[0].url.length, URL_MAX);
    });

    it("name: 100 pass, 101 fail", async () => {
      await rejects({ label: "n".repeat(LABEL_MAX + 1) }, "That name is too long (up to 100 characters)", "label");
      const { service } = await withLink();
      const state = await service.updateFavorite("fav-1", { label: "n".repeat(LABEL_MAX) }, COLS);
      assert.equal(state.items[0].label.length, LABEL_MAX);
    });

    it("icon link: 2001 fails with the customIconUrl field, 2000 pass", async () => {
      const icon = (total) => "https://example.com/i" + "b".repeat(total - "https://example.com/i".length);
      await rejects({ customIconUrl: icon(URL_MAX + 1) }, "That icon link is too long (up to 2000 characters)", "customIconUrl");
      const { service } = await withLink();
      const state = await service.updateFavorite("fav-1", { iconMode: "custom", customIconUrl: icon(URL_MAX) }, COLS);
      assert.equal(state.items[0].customIconUrl.length, URL_MAX);
    });

    it("an empty Name stores the host cut to 100 characters; an untouched Edit form (the stored 100-character label) saves", async () => {
      const host = hostOfLength(300);
      const { service } = await createHarness();
      const added = await service.addFavorite({ url: `https://${host}/` }, COLS);
      const item = added.items[0];
      assert.equal(item.label.length, LABEL_MAX);
      const untouched = await service.updateFavorite(item.id, { url: item.url, label: item.label, iconMode: item.iconMode, customIconUrl: item.customIconUrl ?? "" }, COLS);
      assert.equal(untouched.items[0].label, item.label);
      const cleared = await service.updateFavorite(item.id, { label: "" }, COLS);
      assert.equal(cleared.items[0].label, host.slice(0, LABEL_MAX));
    });

    it("existing longer values are not touched by reading, and an update that does not carry them still works", async () => {
      const { service, store } = await createHarness();
      await seed(store, [favorite({ id: "fav-1", url: "https://example.com/" + "a".repeat(2500), label: "L".repeat(150), grid: g(0, 0) })]);
      const read = await service.getState();
      assert.equal(read.items[0].label.length, 150);
      const resized = await service.updateFavorite("fav-1", { w: 2 }, COLS);
      assert.equal(resized.items[0].label.length, 150);
    });
  });

  describe("addFavorites (wizard starters) never fails on an old stored link", () => {
    it("an old link with a space, a 2500-character URL and a 150-character name does not break a wizard write and still de-duplicates", async () => {
      const { service, store } = await createHarness();
      await seed(store, [
        favorite({ id: "old-1", url: "https://example.com/a b", domain: "example.com", label: "Old", grid: g(0, 0) }),
        favorite({ id: "old-2", url: "https://long.example.com/" + "a".repeat(2500), domain: "long.example.com", label: "L".repeat(150), grid: g(1, 0) })
      ]);
      const ids = await service.addFavorites(
        [{ url: "https://github.com/", label: "GitHub" }, { url: "https://example.com/a%20b", label: "Duplicate of the old spaced link" }],
        COLS
      );
      assert.equal(ids.length, 1, "only the new starter is added; the old spaced link is recognised by its lenient href");
      const urls = (await store.getState()).items.map((item) => item.url);
      assert.equal(urls.includes("https://github.com/"), true);
      assert.equal(urls.filter((u) => u.startsWith("https://example.com/a")).length, 1);
    });

    it("a new starter is still validated by the new rules (a spaced starter address is refused)", async () => {
      const { service } = await createHarness();
      await assert.rejects(service.addFavorites([{ url: "example.com/a b" }], COLS), failsWith("Enter a valid URL", "url"));
    });
  });

  describe("error.field on the other validators", () => {
    it("the colour error names backgroundColor", async () => {
      const { service } = await createHarness();
      await assert.rejects(service.addFavorite({ url: "example.com", backgroundColor: "red" }, COLS), failsWith("Use a hex color like #24292f", "backgroundColor"));
    });
  });
});

// Run 49 (docs/typography-copy.md decision 7, item 104, AS-TYP-07): a host the URL parser accepts but that cannot name a site is
// rejected with the one existing message. Red until `normalizeFavoriteUrl` checks the parsed host; the rest of the tables are
// regression guards that stay green (what a person really types must keep working).
describe("widgetsService junk hosts (run 49, AS-TYP-07)", () => {
  const invalidUrl = (error) => {
    assert.equal(error.message, "Enter a valid URL");
    assert.equal(error.field, "url");
    return true;
  };

  describe("rejected: Enter a valid URL for the url field, by the rule that rejects it", () => {
    const rules = {
      "an empty label": ["http://a..b", "a..b", "example.com..", "http://.com", ".com", "http://..", "http://a.b.."],
      "a label that begins or ends with a hyphen": ["http://-a.com", "http://a-.com", "http://a.-b", "http://-", "http://-.com", "http://a.b-", "http://-a-.com"],
      "a label with no letter or digit": ["http://_", "http://_.com", "http://a.__.com"],
      "a number the parser expands to an IPv4 address (the typed host differs from the parsed one)": [
        "1", "127.1", "2130706433", "0x7f.0.0.1", "010.1.1.1", "1.2.3", "http://0300.0250.0.1/", "http://3232235521/", "http://192.168.1/", "http://0xC0A80001/",
        "127.1:8080", "http://127.1:8080/x"
      ],
      "a spelling the parser normalizes (leading zeros, a rooted address, percent-encoded and full-width digits)": [
        "192.168.001.1", "192.168.0.1.", "http://%31%32%37.0.0.1", "http://%31%32%37.0.0.1:8080/", "１２７.０.０.１"
      ],
      "a short form behind credentials (the host is what follows the last @ of the authority)": ["http://u:p@127.1/", "admin@127.1", "http://192.168.0.1:80@127.1/"]
    };
    for (const [rule, inputs] of Object.entries(rules)) {
      describe(rule, () => {
        for (const input of inputs) {
          it(`rejects ${JSON.stringify(input)}`, () => {
            assert.throws(() => normalizeFavoriteUrl(input), invalidUrl);
          });
        }
      });
    }
  });

  describe("accepted (the host is real, or an IPv4 address typed in full)", () => {
    const accepted = [
      ["localhost:3000", "https://localhost:3000/", "localhost"],
      ["router:8080", "https://router:8080/", "router"],
      ["nas:9000/share", "https://nas:9000/share", "nas"],
      ["intranet/wiki", "https://intranet/wiki", "intranet"],
      ["192.168.0.1", "https://192.168.0.1/", "192.168.0.1"],
      ["192.168.0.1:8080/x", "https://192.168.0.1:8080/x", "192.168.0.1"],
      ["[::1]:8080", "https://[::1]:8080/", "[::1]"],
      ["http://[::1]/", "http://[::1]/", "[::1]"],
      ["http://my_host.local", "http://my_host.local/", "my_host.local"],
      ["http://_dmarc.example.com", "http://_dmarc.example.com/", "_dmarc.example.com"],
      ["http://a_b", "http://a_b/", "a_b"],
      ["example.com.", "https://example.com./", "example.com."],
      ["a--b.com", "https://a--b.com/", "a--b.com"],
      ["xn--80ak6aa92e.com", "https://xn--80ak6aa92e.com/", "xn--80ak6aa92e.com"],
      ["пример.рф", "https://xn--e1afmkfd.xn--p1ai/", "xn--e1afmkfd.xn--p1ai"],
      ["https://example.com/path?q=a+b", "https://example.com/path?q=a+b", "example.com"],
      ["http://Example.COM", "http://example.com/", "example.com"],
      ["http://1-2.example.com", "http://1-2.example.com/", "1-2.example.com"]
    ];
    for (const [input, url, domain] of accepted) {
      it(`accepts ${JSON.stringify(input)}`, () => {
        assert.deepEqual(normalizeFavoriteUrl(input), { url, domain });
      });
    }
  });

  describe("the typed host (decision 7): read by URL grammar before the parser normalizes anything", () => {
    const passes = [
      ["admin@192.168.0.1", "https://admin@192.168.0.1/"], // credentials without a scheme
      ["http://u:p@192.168.0.1:8080/x", "http://u:p@192.168.0.1:8080/x"], // credentials and a port
      ["http://a@b@192.168.0.1/", "http://a%40b@192.168.0.1/"], // several @: what follows the last one is the host
      ["HTTP://192.168.0.1", "http://192.168.0.1/"], // the scheme in any case
      ["HtTpS://192.168.0.1:8080", "https://192.168.0.1:8080/"],
      ["http://192.168.0.1\\x", "http://192.168.0.1/x"], // a backslash ends the host
      ["http://192.168.0.1?x=1", "http://192.168.0.1/?x=1"], // so do ? and #
      ["http://192.168.0.1#top", "http://192.168.0.1/#top"],
      ["192.168.0.1/path", "https://192.168.0.1/path"],
      // the authority ends at the first / \ ? or #: an @ after it is part of the path, query or fragment, never credentials (the order of decision 7)
      ["http://192.168.0.1/p@q", "http://192.168.0.1/p@q"],
      ["192.168.0.1?e=a@b", "https://192.168.0.1/?e=a@b"],
      ["http://192.168.0.1#u@v", "http://192.168.0.1/#u@v"],
      ["http:192.168.0.1", "http://192.168.0.1/"], // a scheme without slashes
      ["http://192.168.0.1:/", "http://192.168.0.1/"] // an empty port is no part of the host
    ];
    for (const [input, url] of passes) {
      it(`an IPv4 address typed in full passes: ${JSON.stringify(input)}`, () => {
        assert.deepEqual(normalizeFavoriteUrl(input), { url, domain: "192.168.0.1" });
      });
    }
    it("a trailing dot is allowed on a name (example.com.) but a rooted IP address is not something anyone types", () => {
      assert.equal(normalizeFavoriteUrl("example.com.").domain, "example.com.");
      assert.throws(() => normalizeFavoriteUrl("192.168.0.1."), invalidUrl);
      assert.throws(() => normalizeFavoriteUrl("http://192.168.0.1./x"), invalidUrl);
      assert.throws(() => normalizeFavoriteUrl("example.com.."), invalidUrl);
    });
    it("one underscore alone names nothing, an underscore inside a label is fine", () => {
      assert.throws(() => normalizeFavoriteUrl("http://_"), invalidUrl);
      assert.throws(() => normalizeFavoriteUrl("http://a._.b"), invalidUrl);
      assert.equal(normalizeFavoriteUrl("http://_dmarc.example.com").domain, "_dmarc.example.com");
    });
  });

  describe("what stays rejected as before", () => {
    for (const input of ["http://a b", "999.1.1.1", "http://1.1.1.1.1", "localhost:99999", "http://bad!host.com"]) {
      it(`${JSON.stringify(input)} still gives Enter a valid URL`, () => {
        assert.throws(() => normalizeFavoriteUrl(input), invalidUrl);
      });
    }
    it("the protocol wins over the host: ftp://-a.com is the protocol message", () => {
      assert.throws(() => normalizeFavoriteUrl("ftp://-a.com"), (error) => error.message === "Only http and https URLs are supported" && error.field === "url");
    });
    it("the length wins over the host: a 2001-character junk host is 'too long'", () => {
      assert.throws(() => normalizeFavoriteUrl(`http://-${"a".repeat(2000)}`), (error) => error.message === "That link is too long (up to 2000 characters)" && error.field === "url");
    });
  });

  describe("one function for Add, Edit and the wizard starters", () => {
    it("addFavorite refuses a junk host and writes nothing", async () => {
      const { service, store } = await createHarness();
      await assert.rejects(service.addFavorite({ url: "http://a..b" }, COLS), invalidUrl);
      await assert.rejects(service.addFavorite({ url: "127.1" }, COLS), invalidUrl);
      assert.deepEqual((await store.getState()).items, [], "nothing is written");
    });

    it("updateFavorite refuses a junk host on a good link and writes nothing", async () => {
      const { service, store } = await createHarness();
      await service.addFavorite({ url: "example.com", label: "Example" }, COLS);
      const before = JSON.stringify((await store.getState()).items);
      await assert.rejects(service.updateFavorite("fav-1", { url: "http://a..b" }, COLS), invalidUrl);
      await assert.rejects(service.updateFavorite("fav-1", { url: "2130706433" }, COLS), invalidUrl);
      assert.equal(JSON.stringify((await store.getState()).items), before, "nothing is written");
    });

    it("addFavorites (wizard starters) refuses a junk host like any other address", async () => {
      const { service, store } = await createHarness();
      await assert.rejects(service.addFavorites([{ url: "http://-a.com" }], COLS), invalidUrl);
      assert.deepEqual((await store.getState()).items, []);
    });

    it("every starter link of the wizard passes the host rule", async () => {
      const { ONBOARDING_STARTER_LINKS } = await import("../src/onboardingStarters.js");
      for (const starter of ONBOARDING_STARTER_LINKS) {
        assert.deepEqual(normalizeFavoriteUrl(starter.url), { url: starter.url, domain: new URL(starter.url).hostname }, starter.label);
      }
    });
  });

  describe("a stored link that fails the new rule (it can only be seeded; Accepted exception 8)", () => {
    const seededHarness = async () => {
      const harness = await createHarness();
      await seed(harness.store, [favorite({ id: "old-junk", url: "http://a..b/", domain: "a..b", label: "a..b", grid: g(0, 0) })]);
      return harness;
    };

    it("stays on the grid: a read keeps it untouched", async () => {
      const { service } = await seededHarness();
      const state = await service.getState();
      assert.deepEqual(state.items.map((item) => [item.id, item.url, item.domain]), [["old-junk", "http://a..b/", "a..b"]]);
    });

    it("Edit -> Save unchanged (the url is always sent) reports Enter a valid URL and writes nothing", async () => {
      const { service, store } = await seededHarness();
      const before = JSON.stringify((await store.getState()).items);
      await assert.rejects(service.updateFavorite("old-junk", { url: "http://a..b/", label: "a..b" }, COLS), invalidUrl);
      assert.equal(JSON.stringify((await store.getState()).items), before);
    });

    it("typing a valid address fixes it", async () => {
      const { service } = await seededHarness();
      const state = await service.updateFavorite("old-junk", { url: "https://example.net/" }, COLS);
      assert.deepEqual([state.items[0].url, state.items[0].domain], ["https://example.net/", "example.net"]);
    });

    it("an update that does not carry the url (a resize, a label) is not host-checked, and Delete works", async () => {
      const { service } = await seededHarness();
      const labelled = await service.updateFavorite("old-junk", { label: "Renamed" }, COLS);
      assert.equal(labelled.items[0].label, "Renamed");
      const deleted = await service.deleteFavorite("old-junk", COLS);
      assert.deepEqual(deleted.items, []);
    });

    it("does not break a wizard write: the stored link is never validated, only the new starters are", async () => {
      const { service, store } = await seededHarness();
      const ids = await service.addFavorites([{ url: "https://github.com/", label: "GitHub" }], COLS);
      assert.equal(ids.length, 1);
      assert.deepEqual((await store.getState()).items.map((item) => item.url).sort(), ["http://a..b/", "https://github.com/"]);
    });
  });
});
