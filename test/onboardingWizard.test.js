import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ONBOARDING_FINISH_ERRORS,
  checkedStarterInputs,
  defaultStarterChecks,
  onboardingFinishErrorForAddFailure,
  progressPillCount,
  step2GuardActive
} from "../src/onboardingWizard.js";
import { MAX_FAVORITE_WIDGETS } from "../src/widgetsShared.js";

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

  it("maps add failures to batch vs limit copy (the texts of run 49: links, not favorites)", () => {
    const syncError =
      "Couldn't save this change to Chrome Sync — it may be full, offline, or temporarily unavailable. Try removing a few links or try again shortly.";
    assert.equal(onboardingFinishErrorForAddFailure(syncError), ONBOARDING_FINISH_ERRORS.batch);
    assert.equal(
      onboardingFinishErrorForAddFailure(`You can save up to ${MAX_FAVORITE_WIDGETS} links`),
      ONBOARDING_FINISH_ERRORS.limit
    );
  });

  it("the wizard's limit mapping matches `up to 200`, which the new wording keeps, and the copy shown is the existing one", () => {
    assert.equal(ONBOARDING_FINISH_ERRORS.limit, "Too many links on your grid. Uncheck some starters.");
    assert.equal(ONBOARDING_FINISH_ERRORS.batch, "Couldn't add links. Try again.");
    assert.equal(onboardingFinishErrorForAddFailure("You can save up to 200 links"), ONBOARDING_FINISH_ERRORS.limit);
    assert.equal(onboardingFinishErrorForAddFailure("Link not found"), ONBOARDING_FINISH_ERRORS.batch);
  });
});
