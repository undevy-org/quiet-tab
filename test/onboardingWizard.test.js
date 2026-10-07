import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkedStarterInputs,
  defaultStarterChecks,
  progressPillCount,
  step2GuardActive
} from "../src/onboardingWizard.js";

describe("onboardingWizard helpers", () => {
  it("defaults three starter checkboxes", () => {
    const checks = defaultStarterChecks();
    assert.equal(checks.filter(Boolean).length, 3);
    assert.equal(checks.length, 8);
  });

  it("maps checked rows to 2x1 favorite inputs", () => {
    const checks = defaultStarterChecks();
    checks[3] = true;
    const inputs = checkedStarterInputs(checks);
    assert.equal(inputs.length, 4);
    assert.deepEqual(inputs[0], {
      url: "https://chatgpt.com/",
      label: "ChatGPT",
      w: 2,
      h: 1,
      iconMode: "favicon",
      backgroundColorSource: "auto"
    });
    assert.equal(inputs[3].label, "GitHub");
  });

  it("progress pills follow variant D counts", () => {
    assert.equal(progressPillCount(1), 1);
    assert.equal(progressPillCount(2), 2);
  });

  it("step 2 entry guard blocks for 300ms", () => {
    const entered = 1000;
    assert.equal(step2GuardActive(entered, 1100), true);
    assert.equal(step2GuardActive(entered, 1300), false);
  });
});
