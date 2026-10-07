import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstRunPromptPossible, shouldAutoShowCityPrompt } from "../src/cityPrompt.js";

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

// AS-FE-07/08 (docs/first-run-empty-desk.md, decision 3a): the pure early check that runs BEFORE the dismissal flag is read.
// Every input of shouldAutoShowCityPrompt except the flag; the flag is only read (capped) when this passes.
describe("firstRunPromptPossible", () => {
  const early = {
    locationRead: true, hasLocation: false,
    anyMetricEnabled: true, weatherAvailable: true, gridLocked: false
  };

  it("is true only when every input except the flag allows the prompt", () => {
    assert.equal(firstRunPromptPossible(early), true);
  });

  it("flipping any single input to its blocking value makes it false (no flag read then)", () => {
    const blockers = { locationRead: false, hasLocation: true, anyMetricEnabled: false, weatherAvailable: false, gridLocked: true };
    for (const [key, value] of Object.entries(blockers)) {
      assert.equal(firstRunPromptPossible({ ...early, [key]: value }), false, key);
    }
  });

  it("treats unknown (missing or non-boolean) inputs as blocking, weather unavailable included", () => {
    for (const key of Object.keys(early)) {
      const { [key]: _omitted, ...rest } = early;
      assert.equal(firstRunPromptPossible(rest), false, `${key} missing`);
      assert.equal(firstRunPromptPossible({ ...early, [key]: null }), false, `${key} null`);
      assert.equal(firstRunPromptPossible({ ...early, [key]: "true" }), false, `${key} string`);
    }
    assert.equal(firstRunPromptPossible(undefined), false);
    assert.equal(firstRunPromptPossible({}), false);
  });

  it("ignores the flag inputs: they are not part of the early check", () => {
    assert.equal(firstRunPromptPossible({ ...early, flagRead: false, dismissed: true }), true);
  });

  it("never allows less than the full rule: a full-rule `true` implies the early check passes", () => {
    const full = { ...early, flagRead: true, dismissed: false };
    assert.equal(shouldAutoShowCityPrompt(full), true);
    assert.equal(firstRunPromptPossible(full), true);
    for (const key of Object.keys(early)) {
      for (const value of [true, false, null, undefined, "x"]) {
        const input = { ...full, [key]: value };
        if (shouldAutoShowCityPrompt(input)) assert.equal(firstRunPromptPossible(input), true, `${key}=${String(value)}`);
      }
    }
  });
});
