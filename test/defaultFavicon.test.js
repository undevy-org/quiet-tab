import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FAVICON_SENTINEL_PAGE,
  DEFAULT_FAVICON_TIMEOUT_MS,
  createDefaultFaviconChecker,
  isDefaultFaviconPixels
} from "../src/defaultFavicon.js";

const SENTINEL_URL = "chrome-extension://abc/_favicon/?pageUrl=sentinel&size=32";
const GLOBE = [10, 20, 30, 255, 40, 50, 60, 255];
const OTHER = [10, 20, 30, 255, 40, 50, 61, 255];

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeImage(bytes, { width = 2, height = 1, throws = false } = {}) {
  return { naturalWidth: width, naturalHeight: height, bytes, throws };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A fake environment: loadImage (sentinel only), one reusable canvas, a manual timer pair.
function setup({ sentinel = fakeImage(GLOBE), sentinelLoad = null, timeoutMs = DEFAULT_FAVICON_TIMEOUT_MS } = {}) {
  const env = {
    loads: [],
    canvases: [],
    reads: [],
    timers: new Map(),
    cleared: [],
    nextTimer: 1
  };
  const loadImage = (url) => {
    env.loads.push(url);
    return sentinelLoad ? sentinelLoad.promise : Promise.resolve(sentinel);
  };
  const createCanvas = (width, height) => {
    const canvas = { width, height };
    env.canvases.push(canvas);
    canvas.getContext = (kind, options) => {
      canvas.contextArgs = [kind, options];
      let current = null;
      return {
        drawImage(image) {
          current = image;
        },
        getImageData(x, y, w, h) {
          env.reads.push({ image: current, x, y, w, h });
          if (current.throws) throw new Error("tainted canvas");
          return { data: current.bytes };
        }
      };
    };
    return canvas;
  };
  const setTimer = (fn, ms) => {
    const id = env.nextTimer++;
    env.timers.set(id, { fn, ms });
    return id;
  };
  const clearTimer = (id) => {
    env.cleared.push(id);
    env.timers.delete(id);
  };
  env.fire = () => {
    for (const [id, timer] of [...env.timers]) {
      env.timers.delete(id);
      timer.fn();
    }
  };
  env.readsOf = (image) => env.reads.filter((read) => read.image === image).length;
  env.checker = createDefaultFaviconChecker({
    sentinelUrl: SENTINEL_URL,
    loadImage,
    createCanvas,
    timeoutMs,
    setTimer,
    clearTimer
  });
  return env;
}

describe("defaultFavicon constants", () => {
  it("exports the 2 s timeout and the sentinel page", () => {
    assert.equal(DEFAULT_FAVICON_TIMEOUT_MS, 2000);
    assert.equal(DEFAULT_FAVICON_SENTINEL_PAGE, "https://quiet-tab-no-favicon.invalid/");
  });
});

describe("isDefaultFaviconPixels", () => {
  it("is true only for byte-equal arrays", () => {
    assert.equal(isDefaultFaviconPixels(Uint8ClampedArray.from(GLOBE), Uint8ClampedArray.from(GLOBE)), true);
    assert.equal(isDefaultFaviconPixels([1, 2, 3, 4], [1, 2, 3, 4]), true);
    assert.equal(isDefaultFaviconPixels(Uint8ClampedArray.from(GLOBE), GLOBE.slice()), true);
  });

  it("is false when one byte differs", () => {
    assert.equal(isDefaultFaviconPixels(Uint8ClampedArray.from(OTHER), Uint8ClampedArray.from(GLOBE)), false);
    assert.equal(isDefaultFaviconPixels([1, 2, 3, 4], [1, 2, 3, 5]), false);
  });

  it("is false for different lengths", () => {
    assert.equal(isDefaultFaviconPixels([1, 2, 3, 4], [1, 2, 3, 4, 5, 6, 7, 8]), false);
    assert.equal(isDefaultFaviconPixels([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4]), false);
  });

  it("is false for empty arrays", () => {
    assert.equal(isDefaultFaviconPixels([], []), false);
    assert.equal(isDefaultFaviconPixels(new Uint8ClampedArray(0), new Uint8ClampedArray(0)), false);
  });

  it("is false when the sentinel or the candidate is missing", () => {
    assert.equal(isDefaultFaviconPixels([1, 2, 3, 4], null), false);
    assert.equal(isDefaultFaviconPixels([1, 2, 3, 4], undefined), false);
    assert.equal(isDefaultFaviconPixels(null, [1, 2, 3, 4]), false);
    assert.equal(isDefaultFaviconPixels(undefined, [1, 2, 3, 4]), false);
    assert.equal(isDefaultFaviconPixels(null, null), false);
  });
});

describe("createDefaultFaviconChecker", () => {
  it("makes no sentinel request and starts no timer when check is never called", async () => {
    const env = setup();
    await tick();
    assert.deepEqual(env.loads, []);
    assert.equal(env.timers.size, 0);
    assert.equal(env.canvases.length, 0);
    assert.equal(env.checker.failed, false);
    assert.equal(env.checker.verdictFor("any"), undefined);
  });

  it("loads the sentinel lazily on the first check and starts the timer there", async () => {
    const env = setup({ timeoutMs: 1234 });
    const pending = env.checker.check("u1", fakeImage(OTHER));
    assert.deepEqual(env.loads, [SENTINEL_URL]);
    assert.equal(env.timers.size, 1);
    assert.equal([...env.timers.values()][0].ms, 1234);
    assert.equal(await pending, "real");
  });

  it("shares one sentinel request among N parallel checks", async () => {
    const env = setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => env.checker.check(`u${i}`, fakeImage(i % 2 ? OTHER : GLOBE)))
    );
    assert.deepEqual(results, ["default", "real", "default", "real", "default", "real"]);
    assert.equal(env.loads.length, 1);
    assert.equal(env.timers.size, 0);
    assert.ok(env.cleared.length >= 1, "the timer is cleared once the sentinel resolves");
  });

  it("uses one reusable canvas with willReadFrequently and the natural size", async () => {
    const env = setup();
    await env.checker.check("u1", fakeImage(GLOBE));
    await env.checker.check("u2", fakeImage(OTHER));
    assert.equal(env.canvases.length, 1);
    assert.deepEqual(env.canvases[0].contextArgs, ["2d", { willReadFrequently: true }]);
    assert.ok(env.reads.length >= 3, "the sentinel and both candidates were read");
    for (const read of env.reads) {
      assert.deepEqual([read.x, read.y, read.w, read.h], [0, 0, 2, 1]);
    }
  });

  it("calls an image with the sentinel's bytes default and caches the verdict by URL", async () => {
    const env = setup();
    const first = fakeImage(GLOBE);
    assert.equal(await env.checker.check("u1", first), "default");
    assert.equal(env.checker.verdictFor("u1"), "default");
    const readsAfterFirst = env.reads.length;
    const second = fakeImage(OTHER);
    assert.equal(await env.checker.check("u1", second), "default");
    assert.equal(env.reads.length, readsAfterFirst, "a cached URL does not read the canvas again");
    assert.equal(env.readsOf(second), 0);
    assert.equal(env.loads.length, 1);
  });

  it("calls an image with different bytes real and caches it", async () => {
    const env = setup();
    assert.equal(await env.checker.check("u1", fakeImage(OTHER)), "real");
    assert.equal(env.checker.verdictFor("u1"), "real");
    const again = fakeImage(GLOBE);
    assert.equal(await env.checker.check("u1", again), "real");
    assert.equal(env.readsOf(again), 0);
  });

  it("compares natural sizes before bytes: another size is real without reading the candidate", async () => {
    const env = setup();
    const wider = fakeImage(GLOBE, { width: 4, height: 1 });
    assert.equal(await env.checker.check("u1", wider), "real");
    assert.equal(env.readsOf(wider), 0);
    const taller = fakeImage(GLOBE, { width: 2, height: 2 });
    assert.equal(await env.checker.check("u2", taller), "real");
    assert.equal(env.readsOf(taller), 0);
    assert.equal(env.checker.verdictFor("u1"), "real");
  });

  it("returns unknown for a candidate whose canvas read throws, caches nothing and does not fail the checker", async () => {
    const env = setup();
    const broken = fakeImage(GLOBE, { throws: true });
    assert.equal(await env.checker.check("u1", broken), "unknown");
    assert.equal(env.checker.verdictFor("u1"), undefined);
    assert.equal(env.checker.failed, false);
    assert.equal(await env.checker.check("u1", fakeImage(GLOBE)), "default");
    assert.equal(env.checker.verdictFor("u1"), "default");
  });

  it("fails open when the sentinel cannot be loaded: every result is unknown, failed is true, nothing is cached", async () => {
    const sentinelLoad = deferred();
    const env = setup({ sentinelLoad });
    const a = env.checker.check("u1", fakeImage(GLOBE));
    const b = env.checker.check("u2", fakeImage(OTHER));
    sentinelLoad.reject(new Error("aborted"));
    assert.equal(await a, "unknown");
    assert.equal(await b, "unknown");
    assert.equal(env.checker.failed, true);
    assert.equal(env.checker.verdictFor("u1"), undefined);
    assert.equal(await env.checker.check("u3", fakeImage(GLOBE)), "unknown");
    assert.equal(env.loads.length, 1, "no second sentinel request in the same page load");
  });

  it("times out: the waiting checks are released as unknown and failed is true", async () => {
    const sentinelLoad = deferred();
    const env = setup({ sentinelLoad });
    let settled = null;
    const pending = env.checker.check("u1", fakeImage(GLOBE)).then((result) => {
      settled = result;
    });
    await tick();
    assert.equal(settled, null, "still waiting for the sentinel");
    assert.equal(env.checker.failed, false);
    env.fire();
    await pending;
    assert.equal(settled, "unknown");
    assert.equal(env.checker.failed, true);
    assert.equal(env.checker.verdictFor("u1"), undefined);
  });

  it("ignores a sentinel answer that arrives after the timeout", async () => {
    const sentinelLoad = deferred();
    const env = setup({ sentinelLoad });
    const waiting = env.checker.check("u1", fakeImage(GLOBE));
    env.fire();
    assert.equal(await waiting, "unknown");
    sentinelLoad.resolve(fakeImage(GLOBE));
    await tick();
    assert.equal(env.checker.failed, true);
    assert.equal(env.checker.verdictFor("u1"), undefined);
    assert.equal(await env.checker.check("u2", fakeImage(GLOBE)), "unknown");
    assert.equal(env.checker.verdictFor("u2"), undefined);
    assert.equal(env.loads.length, 1);
  });

  it("verdictFor is undefined for an unknown URL and the verdict afterwards", async () => {
    const env = setup();
    assert.equal(env.checker.verdictFor("u1"), undefined);
    await env.checker.check("u1", fakeImage(GLOBE));
    await env.checker.check("u2", fakeImage(OTHER));
    assert.equal(env.checker.verdictFor("u1"), "default");
    assert.equal(env.checker.verdictFor("u2"), "real");
    assert.equal(env.checker.verdictFor("u3"), undefined);
  });

  it("classifyImage (accent path) shares the verdict cache and the sentinel with check", async () => {
    const env = setup();
    assert.equal(await env.checker.classifyImage("u1", fakeImage(GLOBE)), "default");
    assert.equal(env.checker.verdictFor("u1"), "default");
    const readsAfter = env.reads.length;
    assert.equal(await env.checker.check("u1", fakeImage(OTHER)), "default");
    assert.equal(env.reads.length, readsAfter);
    assert.equal(await env.checker.check("u2", fakeImage(OTHER)), "real");
    assert.equal(await env.checker.classifyImage("u2", fakeImage(GLOBE)), "real");
    assert.equal(env.loads.length, 1);
  });

  it("classifyImage on an already failed checker returns unknown", async () => {
    const sentinelLoad = deferred();
    const env = setup({ sentinelLoad });
    const first = env.checker.check("u0", fakeImage(GLOBE));
    sentinelLoad.reject(new Error("aborted"));
    assert.equal(await first, "unknown");
    assert.equal(env.checker.failed, true, "the checker has failed before classifyImage is called");
    assert.equal(await env.checker.classifyImage("u1", fakeImage(GLOBE)), "unknown");
    assert.equal(env.checker.verdictFor("u1"), undefined);
    assert.equal(env.loads.length, 1, "no second sentinel request");
  });

  it("fails open when the sentinel loads but cannot be read: unknown, failed is true, nothing is cached, one sentinel load", async () => {
    const env = setup({ sentinel: fakeImage(GLOBE, { throws: true }) });
    assert.equal(await env.checker.check("u1", fakeImage(GLOBE)), "unknown");
    assert.equal(env.checker.failed, true);
    assert.equal(env.checker.verdictFor("u1"), undefined);
    assert.equal(await env.checker.classifyImage("u2", fakeImage(OTHER)), "unknown");
    assert.equal(env.checker.verdictFor("u2"), undefined);
    assert.equal(env.loads.length, 1, "the sentinel is loaded once");
  });
});
