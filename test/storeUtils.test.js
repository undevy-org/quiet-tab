import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { isSameValue } from "../src/storeUtils.js";

// isSameValue(a, b) says whether two values are the same after a trip through storage, which is JSON (docs/tab-return-refresh.md decision 7).
describe("isSameValue (the semantics of a JSON round trip)", () => {
  it("key order does not matter, at any depth", () => {
    assert.equal(isSameValue({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
    assert.equal(isSameValue({ a: { x: 1, y: [1, { p: 1, q: 2 }] }, b: 2 }, { b: 2, a: { y: [1, { q: 2, p: 1 }], x: 1 } }), true);
  });

  it("arrays are compared in order", () => {
    assert.equal(isSameValue([1, 2, 3], [1, 2, 3]), true);
    assert.equal(isSameValue([1, 2, 3], [3, 2, 1]), false);
    assert.equal(isSameValue({ order: ["a", "b"] }, { order: ["b", "a"] }), false);
    assert.equal(isSameValue([1, 2], [1, 2, 3]), false);
    assert.equal(isSameValue([], []), true);
  });

  it("an undefined property equals an absent one (JSON drops it), an undefined array item is null", () => {
    assert.equal(isSameValue({ a: 1, b: undefined }, { a: 1 }), true);
    assert.equal(isSameValue({ a: 1 }, { a: 1, b: undefined }), true);
    assert.equal(isSameValue({ a: 1, b: undefined }, { a: 1, b: null }), false);
    assert.equal(isSameValue([1, undefined], [1, null]), true);
  });

  it("-0 equals 0", () => {
    assert.equal(isSameValue(-0, 0), true);
    assert.equal(isSameValue({ x: -0 }, { x: 0 }), true);
    assert.equal(isSameValue([0], [-0]), true);
  });

  it("NaN and Infinity are not equal to numbers (storage turns them into null)", () => {
    assert.equal(isSameValue(NaN, 0), false);
    assert.equal(isSameValue(NaN, 1), false);
    assert.equal(isSameValue(Infinity, 1), false);
    assert.equal(isSameValue(-Infinity, -1), false);
    assert.equal(isSameValue({ x: NaN }, { x: 0 }), false);
    assert.equal(isSameValue({ x: NaN }, { x: null }), true, "as stored, both are null");
    assert.equal(isSameValue([Infinity], [null]), true);
  });

  it("numbers, strings and booleans by value; different types differ", () => {
    assert.equal(isSameValue(1, 1), true);
    assert.equal(isSameValue(1, 2), false);
    assert.equal(isSameValue("a", "a"), true);
    assert.equal(isSameValue("1", 1), false);
    assert.equal(isSameValue(true, 1), false);
    assert.equal(isSameValue(false, 0), false);
    assert.equal(isSameValue({}, []), false);
    assert.equal(isSameValue([], null), false);
    assert.equal(isSameValue({ a: 1 }, "a"), false);
  });

  it("null is a value of its own", () => {
    assert.equal(isSameValue(null, null), true);
    assert.equal(isSameValue(null, undefined), false);
    assert.equal(isSameValue({ a: null }, { a: null }), true);
    assert.equal(isSameValue({ a: null }, {}), false);
    assert.equal(isSameValue(null, 0), false);
    assert.equal(isSameValue(null, {}), false);
  });

  it("undefined against undefined is the same, against anything else it is not", () => {
    assert.equal(isSameValue(undefined, undefined), true);
    assert.equal(isSameValue(undefined, null), false);
    assert.equal(isSameValue(undefined, {}), false);
  });

  it("is not fooled by a missing key against an extra key, nested", () => {
    assert.equal(isSameValue({ a: { b: 1 } }, { a: { b: 1, c: 2 } }), false);
    assert.equal(isSameValue({ a: { b: 1, c: 2 } }, { a: { b: 1 } }), false);
    assert.equal(isSameValue({ a: 1, b: 2 }, { a: 1, c: 2 }), false);
  });

  it("a widgets state is the same before and after structuredClone, and differs after one field changes", () => {
    const state = {
      version: 3,
      items: [
        { id: "f0", type: "favorite", url: "https://a.example/", label: "A", grid: { x: -1, y: 1, w: 1, h: 1 }, createdAt: "2026-09-01T00:00:00.000Z" },
        { id: "weather:temperature", type: "weather-metric", enabled: true, grid: { x: 0, y: 0, w: 2, h: 1 } },
        { id: "chrome:settings", type: "chrome", role: "settings", grid: { x: 2, y: 0, w: 1, h: 1 } }
      ],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z"
    };
    const copy = structuredClone(state);
    assert.equal(isSameValue(state, copy), true);
    assert.equal(isSameValue(copy, state), true);
    copy.items[0].grid.x = 0;
    assert.equal(isSameValue(state, copy), false);
    const reordered = structuredClone(state);
    reordered.items.reverse();
    assert.equal(isSameValue(state, reordered), false);
    const touched = structuredClone(state);
    touched.updatedAt = "2026-09-03T00:00:00.000Z";
    assert.equal(isSameValue(state, touched), false);
  });

  it("values storage cannot hold follow JSON: a Date is its string, a Map and a Set are empty objects, a function is dropped", () => {
    const at = new Date("2026-09-01T00:00:00.000Z");
    assert.equal(isSameValue(at, "2026-09-01T00:00:00.000Z"), true);
    assert.equal(isSameValue(new Map([[1, 2]]), {}), true);
    assert.equal(isSameValue(new Set([1]), {}), true);
    assert.equal(isSameValue({ a: 1, f() {} }, { a: 1 }), true);
  });

  it("a value that cannot be written as JSON (a cycle, a BigInt) is never the same, and never throws", () => {
    const cycle = {};
    cycle.self = cycle;
    assert.equal(isSameValue(cycle, cycle), false);
    assert.equal(isSameValue({ n: 1n }, { n: 1n }), false);
    assert.equal(isSameValue({ n: 1n }, { n: 1 }), false);
  });

  it("a function or a symbol at the top level is undefined (JSON drops it), so it equals undefined and nothing else", () => {
    assert.equal(isSameValue(() => 1, undefined), true);
    assert.equal(isSameValue(Symbol("s"), undefined), true);
    assert.equal(isSameValue(() => 1, null), false);
    assert.equal(isSameValue(Symbol("s"), {}), false);
    assert.equal(isSameValue({ f: () => 1 }, {}), true, "inside an object it is dropped");
    assert.equal(isSameValue([() => 1], [null]), true, "inside an array it is null");
  });

  it("a nesting so deep that the comparison itself overflows the stack never throws, and two such nestings that differ are not the same", () => {
    const nest = (levels, leaf = 1) => {
      let value = leaf;
      for (let i = 0; i < levels; i += 1) value = [value];
      return value;
    };
    // The depth at which JSON or the comparison runs out of stack differs between engines and with the state of the JIT, so a series of
    // depths from shallow to far past the limit (6000 levels is past JSON itself on Node 20) is tried; none of them may throw, and a
    // different leaf is never the same, however it ends. What equal nestings answer past the limit is not pinned: it depends on the engine.
    for (let levels = 1000; levels <= 9000; levels += 250) {
      assert.doesNotThrow(() => isSameValue(nest(levels), nest(levels)), `${levels} levels`);
      assert.equal(isSameValue(nest(levels, 1), nest(levels, 2)), false, `${levels} levels with a different leaf`);
    }
    assert.equal(isSameValue(nest(9000), nest(1)), false);
    assert.equal(isSameValue(nest(2), nest(2)), true, "a shallow nesting is still compared");
    assert.equal(isSameValue(nest(2, 1), nest(2, 2)), false);
  });

  it("when the stack runs out inside the comparison itself (not in JSON), it still does not throw and says not the same", () => {
    // Runs in a fresh process: whether the stack runs out first in JSON or in the comparison depends on how warm the JIT is, and the other
    // cases of this file have already warmed it. The function is serialized, so it uses nothing from this file.
    const sweep = async (moduleUrl) => {
      const { isSameValue } = await import(moduleUrl);
      const nest = (levels, leaf = 1) => {
        let value = leaf;
        for (let i = 0; i < levels; i += 1) value = [value];
        return value;
      };
      const a = nest(300);
      const b = nest(300);
      const c = nest(300, 2); // differs from a at the leaf only
      isSameValue(a, b); // compiled before the stack is nearly full, so a call that cannot start is not mistaken for an escape
      isSameValue(a, c);
      const room = (frames) => (frames === 0 ? 0 : 1 + room(frames - 1)); // throws a RangeError when `frames` frames do not fit
      let lastEscape = null; // the last error that came out of isSameValue
      let gaveUp = 0; // equal values answered "not the same": the stack ran out in JSON or in the comparison and it was caught
      let enough = 0; // equal values answered "the same": the stack had room
      let wrong = 0; // values that differ answered "the same"
      // Overflow the stack on purpose, then unwind it one frame at a time: the catch of each frame runs with a little more room than the one
      // before, so one of them runs isSameValue with just too little room for the recursion of the comparison, wherever it is cut off. A call
      // that cannot even start (no room for a few hundred frames) is not counted: only an error that escapes from inside the call is.
      const unwind = (depth) => {
        try {
          unwind(depth + 1);
        } catch (error) {
          let started = true;
          try {
            room(300);
          } catch {
            started = false;
          }
          if (started && enough === 0) {
            try {
              const same = isSameValue(a, b);
              if (isSameValue(a, c)) wrong += 1; // never the same, whatever the stack allows
              if (same) enough += 1;
              else gaveUp += 1;
            } catch (e) {
              lastEscape = e;
            }
          }
          throw error;
        }
      };
      try {
        unwind(0);
      } catch {
        // the overflow that was provoked
      }
      // An error counts as an escape only if the stack overflowed inside the call (its trace names the comparison or JSON), not at its entry.
      const escaped = lastEscape !== null && /sameJson|toJson|isSameValue/.test(String(lastEscape.stack)) ? 1 : 0;
      console.log(JSON.stringify({ escaped, gaveUp, enough, wrong, lastEscape: lastEscape === null ? null : String(lastEscape.stack).split("\n").slice(0, 3) }));
    };
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const url = new URL("../src/storeUtils.js", import.meta.url).href;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", `(${sweep.toString()})(${JSON.stringify(url)});`], { encoding: "utf8", env, timeout: 20000 });
    assert.equal(run.status, 0, run.stderr);
    const seen = JSON.parse(run.stdout.trim().split("\n").at(-1));
    assert.equal(seen.escaped, 0, `no error escapes from isSameValue: ${JSON.stringify(seen.lastEscape)}`);
    assert.equal(seen.wrong, 0, "values that differ are never answered the same, even when the stack runs out inside the call");
    assert.ok(seen.gaveUp > 0, "the sweep reached a call that gave up for lack of stack (in JSON or in the comparison) and answered not the same");
    assert.ok(seen.enough > 0, "and past it, where the same values are the same");
  });

  it("does not change its inputs", () => {
    const a = { b: [1, { c: undefined, d: -0 }], e: NaN };
    const before = structuredClone(a);
    isSameValue(a, { b: [], e: 0 });
    assert.deepEqual(Object.keys(a), Object.keys(before));
    assert.equal(Object.is(a.b[1].d, -0), true);
    assert.equal(Number.isNaN(a.e), true);
  });
});
