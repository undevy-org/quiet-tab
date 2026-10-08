import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { onboardingWizardPossible, shouldShowOnboardingWizard } from "../src/cityPrompt.js";

const possible = {
  locationRead: true,
  anyMetricEnabled: true,
  weatherAvailable: true,
  gridLocked: false
};

const ok = {
  ...possible,
  flagRead: true,
  dismissed: false,
  completeRead: true,
  complete: false,
  wizardShownThisLoad: false
};

describe("onboardingWizardPossible", () => {
  it("is true when every gate except hasLocation holds", () => {
    assert.equal(onboardingWizardPossible(possible), true);
    assert.equal(onboardingWizardPossible({ ...possible, hasLocation: true }), true);
    assert.equal(onboardingWizardPossible({ ...possible, hasLocation: false }), true);
  });

  it("flipping any single input to its blocking value hides the wizard", () => {
    const blockers = {
      locationRead: false,
      anyMetricEnabled: false,
      weatherAvailable: false,
      gridLocked: true
    };
    for (const [key, value] of Object.entries(blockers)) {
      assert.equal(onboardingWizardPossible({ ...possible, [key]: value }), false, key);
    }
  });

  it("treats unknown (missing or non-boolean) inputs as blocking", () => {
    for (const key of Object.keys(possible)) {
      const { [key]: _omitted, ...rest } = possible;
      assert.equal(onboardingWizardPossible(rest), false, `${key} missing`);
      assert.equal(onboardingWizardPossible({ ...possible, [key]: null }), false, `${key} null`);
    }
    assert.equal(onboardingWizardPossible(undefined), false);
  });
});

describe("shouldShowOnboardingWizard", () => {
  it("shows only when every condition holds", () => {
    assert.equal(shouldShowOnboardingWizard(ok), true);
  });

  it("flipping any single input to its blocking value hides the wizard", () => {
    const blockers = {
      locationRead: false,
      anyMetricEnabled: false,
      weatherAvailable: false,
      gridLocked: true,
      flagRead: false,
      dismissed: true,
      completeRead: false,
      complete: true,
      wizardShownThisLoad: true
    };
    for (const [key, value] of Object.entries(blockers)) {
      assert.equal(shouldShowOnboardingWizard({ ...ok, [key]: value }), false, key);
    }
  });

  it("treats unknown flag or completion reads as blocking", () => {
    assert.equal(shouldShowOnboardingWizard({ ...ok, flagRead: false }), false);
    assert.equal(shouldShowOnboardingWizard({ ...ok, completeRead: false }), false);
    assert.equal(shouldShowOnboardingWizard(undefined), false);
  });

  it("never allows less than the possible rule: a full-rule true implies possible passes", () => {
    for (const key of Object.keys(possible)) {
      for (const value of [true, false, null, undefined, "x"]) {
        const input = { ...ok, [key]: value };
        if (shouldShowOnboardingWizard(input)) assert.equal(onboardingWizardPossible(input), true, `${key}=${String(value)}`);
      }
    }
  });
});
