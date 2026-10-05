import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { feedbackReserve, shouldAutoShowCityPrompt } from "../src/cityPrompt.js";

const ok = {
  locationRead: true, hasLocation: false, flagRead: true, dismissed: false,
  anyMetricEnabled: true, weatherAvailable: true, gridLocked: false
};

describe("shouldAutoShowCityPrompt", () => {
  it("shows only when every condition holds", () => {
    assert.equal(shouldAutoShowCityPrompt(ok), true);
  });

  it("flipping any single input to its blocking value hides the prompt", () => {
    const blockers = {
      locationRead: false, hasLocation: true, flagRead: false, dismissed: true,
      anyMetricEnabled: false, weatherAvailable: false, gridLocked: true
    };
    for (const [key, value] of Object.entries(blockers)) {
      assert.equal(shouldAutoShowCityPrompt({ ...ok, [key]: value }), false, key);
    }
  });

  it("treats unknown (missing or non-boolean) inputs as blocking", () => {
    for (const key of Object.keys(ok)) {
      const { [key]: _omitted, ...rest } = ok;
      assert.equal(shouldAutoShowCityPrompt(rest), false, `${key} missing`);
      assert.equal(shouldAutoShowCityPrompt({ ...ok, [key]: null }), false, `${key} null`);
    }
    assert.equal(shouldAutoShowCityPrompt({ ...ok, dismissed: "false" }), false);
    assert.equal(shouldAutoShowCityPrompt(undefined), false);
  });
});

// AS-DJ-07 (docs/dialog-threshold-jump.md): the room kept for an error shrinks continuously with the window.
describe("feedbackReserve", () => {
  const FULL = 39.2;
  const BASE = 266.36;
  const call = (viewportHeight, extra = {}) => feedbackReserve({ viewportHeight, baseHeight: BASE, fullReserve: FULL, margin: 16, ...extra });
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 0.011, `${label}: ${actual} vs ${expected}`);

  it("returns the full reserve exactly as given when the window holds everything", () => {
    assert.equal(call(BASE + FULL + 32), FULL);
    assert.equal(call(800), FULL);
    assert.equal(call(BASE + 39.1875 + 32, { fullReserve: 39.1875 }), 39.1875);
    assert.equal(call(800, { fullReserve: 39.1875 }), 39.1875);
  });

  it("returns the room, rounded down to 0.01, when the window holds only a part", () => {
    near(call(BASE + FULL + 32 - 1), FULL - 1, "one pixel below the threshold");
    assert.ok(call(BASE + FULL + 32 - 1) <= FULL - 1 + 1e-9, "never above the exact room");
    assert.equal(feedbackReserve({ viewportHeight: 100 + 32 + 12.349, baseHeight: 100, fullReserve: 39.2, margin: 16 }), 12.34);
  });

  it("returns 0 at and below the height without the reserve", () => {
    assert.equal(call(BASE + 32), 0);
    assert.equal(call(BASE + 31), 0);
    assert.equal(call(200), 0);
    assert.equal(call(0), 0);
  });

  it("is monotonic in the window height and stays within [0, fullReserve]", () => {
    let previous = -1;
    for (let h = 100; h <= 700; h += 0.5) {
      const r = call(h);
      assert.ok(r >= previous, `monotonic at ${h}`);
      assert.ok(r >= 0 && r <= FULL, `range at ${h}`);
      previous = r;
    }
  });

  it("honours a margin other than 16", () => {
    assert.equal(feedbackReserve({ viewportHeight: 300, baseHeight: 266, fullReserve: 39.2, margin: 10 }), 14);
    assert.equal(feedbackReserve({ viewportHeight: 300, baseHeight: 266, fullReserve: 39.2, margin: 17 }), 0);
  });

  it("fails closed on non-finite or missing input: the full reserve when it is a usable number, else 0", () => {
    assert.equal(call(NaN), FULL);
    assert.equal(call(undefined), FULL);
    assert.equal(call(300, { baseHeight: Infinity }), FULL);
    assert.equal(call(300, { baseHeight: undefined }), FULL);
    assert.equal(call(300, { margin: undefined }), FULL);
    assert.equal(call(300, { fullReserve: -5 }), 0);
    assert.equal(call(300, { fullReserve: NaN }), 0);
    assert.equal(call(300, { fullReserve: undefined }), 0);
    assert.equal(feedbackReserve(undefined), 0);
    assert.equal(feedbackReserve({}), 0);
  });
});
