// Pure onboarding wizard helpers (no DOM, no I/O). docs/onboarding-wizard.md

import { ONBOARDING_STARTER_LINKS } from "./onboardingStarters.js";

export const ONBOARDING_STEP2_GUARD_MS = 300;

export const ONBOARDING_FINISH_ERRORS = {
  batch: "Couldn't add links. Try again.",
  flag: "Couldn't save setup. Try again.",
  limit: "Too many links on your grid. Uncheck some starters."
};

/** @returns {boolean[]} default checked state in table order */
export function defaultStarterChecks() {
  return ONBOARDING_STARTER_LINKS.map((row) => row.defaultChecked === true);
}

/** @param {boolean[]} checks */
export function checkedStarterInputs(checks) {
  const selected = [];
  for (let i = 0; i < ONBOARDING_STARTER_LINKS.length; i += 1) {
    if (checks[i] !== true) continue;
    const row = ONBOARDING_STARTER_LINKS[i];
    const input = {
      url: row.url,
      label: row.label,
      w: 2,
      h: 1,
      iconMode: "favicon",
      backgroundColorSource: row.backgroundColorSource ?? "auto"
    };
    if (row.backgroundColor) input.backgroundColor = row.backgroundColor;
    selected.push(input);
  }
  return selected;
}

export function step2GuardActive(enteredAt, now = performance.now()) {
  return enteredAt > 0 && now - enteredAt < ONBOARDING_STEP2_GUARD_MS;
}

export function progressPillCount(step) {
  return step >= 2 ? 2 : 1;
}
