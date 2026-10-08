// Whether the first-run onboarding wizard may open on this page load. Every input must be
// known and favourable; unknown (a read that failed or has not finished) never shows it.

// Mirrors the former first-run gates except the user may already have a city (decision 1).
export function onboardingWizardPossible(input) {
  const state = input ?? {};
  return (
    state.locationRead === true &&
    state.anyMetricEnabled === true &&
    state.weatherAvailable === true &&
    state.gridLocked === false
  );
}

export function shouldShowOnboardingWizard(input) {
  const state = input ?? {};
  return (
    onboardingWizardPossible(state) &&
    state.flagRead === true &&
    state.dismissed === false &&
    state.completeRead === true &&
    state.complete === false &&
    state.wizardShownThisLoad === false
  );
}
