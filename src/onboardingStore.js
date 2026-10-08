import { WEATHER_PROMPT_DISMISSED_KEY } from "./weatherStore.js";

export const ONBOARDING_WIZARD_COMPLETE_KEY = "quietTabOnboardingWizardComplete";

const LOCAL_BOOT_KEYS = [WEATHER_PROMPT_DISMISSED_KEY, ONBOARDING_WIZARD_COMPLETE_KEY];

// Per-device "the user finished the onboarding wizard" flag. Only the exact value `true` counts.
export function createOnboardingStore(storageArea) {
  return {
    async isComplete() {
      const result = await storageArea.get(ONBOARDING_WIZARD_COMPLETE_KEY);
      return result?.[ONBOARDING_WIZARD_COMPLETE_KEY] === true;
    },
    async markComplete() {
      await storageArea.set({ [ONBOARDING_WIZARD_COMPLETE_KEY]: true });
    }
  };
}

// One capped read of dismissal + completion before the first render (docs/onboarding-wizard.md decision 1).
export async function readOnboardingLocalFlags(storageArea, capMs = 250) {
  const unknown = { flagRead: false, dismissed: false, completeRead: false, complete: false };
  if (!storageArea || typeof storageArea.get !== "function") return unknown;

  let timer = 0;
  const cap = new Promise((resolve) => {
    timer = setTimeout(() => resolve(unknown), capMs);
  });
  const read = storageArea
    .get(LOCAL_BOOT_KEYS)
    .then(
      (result) => ({
        flagRead: true,
        dismissed: result?.[WEATHER_PROMPT_DISMISSED_KEY] === true,
        completeRead: true,
        complete: result?.[ONBOARDING_WIZARD_COMPLETE_KEY] === true
      }),
      () => unknown
    );
  try {
    return await Promise.race([read, cap]);
  } finally {
    clearTimeout(timer);
  }
}
