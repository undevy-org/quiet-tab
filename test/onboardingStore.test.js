import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ONBOARDING_WIZARD_COMPLETE_KEY,
  createOnboardingStore,
  readOnboardingLocalFlags
} from "../src/onboardingStore.js";
import { WEATHER_PROMPT_DISMISSED_KEY } from "../src/weatherStore.js";
import { createMemoryStorageArea } from "./memoryStorageArea.js";

describe("createOnboardingStore", () => {
  it("treats only exact true as complete", async () => {
    for (const value of [undefined, false, "true", 1]) {
      const area = createMemoryStorageArea(value === undefined ? {} : { [ONBOARDING_WIZARD_COMPLETE_KEY]: value });
      assert.equal(await createOnboardingStore(area).isComplete(), false, String(value));
    }
    const area = createMemoryStorageArea({ [ONBOARDING_WIZARD_COMPLETE_KEY]: true });
    assert.equal(await createOnboardingStore(area).isComplete(), true);
  });

  it("markComplete writes the flag", async () => {
    const area = createMemoryStorageArea({});
    const store = createOnboardingStore(area);
    await store.markComplete();
    assert.equal((await area.get(ONBOARDING_WIZARD_COMPLETE_KEY))[ONBOARDING_WIZARD_COMPLETE_KEY], true);
  });
});

describe("readOnboardingLocalFlags", () => {
  it("reads dismissal and completion in one get", async () => {
    const area = createMemoryStorageArea({
      [WEATHER_PROMPT_DISMISSED_KEY]: true,
      [ONBOARDING_WIZARD_COMPLETE_KEY]: true
    });
    const flags = await readOnboardingLocalFlags(area, 250);
    assert.deepEqual(flags, { flagRead: true, dismissed: true, completeRead: true, complete: true });
  });

  it("fails closed on rejection", async () => {
    const failing = {
      get() {
        return Promise.reject(new Error("fail"));
      }
    };
    const flags = await readOnboardingLocalFlags(failing, 50);
    assert.deepEqual(flags, { flagRead: false, dismissed: false, completeRead: false, complete: false });
  });

  it("fails closed on timeout", async () => {
    const slow = {
      get() {
        return new Promise(() => {});
      }
    };
    const flags = await readOnboardingLocalFlags(slow, 20);
    assert.deepEqual(flags, { flagRead: false, dismissed: false, completeRead: false, complete: false });
  });
});
