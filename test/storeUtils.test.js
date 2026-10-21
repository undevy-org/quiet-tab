import assert from "node:assert/strict";
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

  it("does not change its inputs", () => {
    const a = { b: [1, { c: undefined, d: -0 }], e: NaN };
    const before = structuredClone(a);
    isSameValue(a, { b: [], e: 0 });
    assert.deepEqual(Object.keys(a), Object.keys(before));
    assert.equal(Object.is(a.b[1].d, -0), true);
    assert.equal(Number.isNaN(a.e), true);
  });
});
