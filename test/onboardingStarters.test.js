import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ONBOARDING_STARTER_LINKS } from "../src/onboardingStarters.js";

describe("ONBOARDING_STARTER_LINKS", () => {
  it("lists eight starters in spec order with three default-checked", () => {
    assert.equal(ONBOARDING_STARTER_LINKS.length, 8);
    assert.deepEqual(
      ONBOARDING_STARTER_LINKS.filter((row) => row.defaultChecked).map((row) => row.label),
      ["ChatGPT", "YouTube", "X"]
    );
    assert.equal(ONBOARDING_STARTER_LINKS[4].label, "Gmail");
    assert.equal(ONBOARDING_STARTER_LINKS[4].backgroundColor, "#1a73e8");
    assert.equal(ONBOARDING_STARTER_LINKS[4].backgroundColorSource, "manual");
  });
});
