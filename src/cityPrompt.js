// Whether the first-run city modal opens by itself on this page load. Every input must be
// known and favourable; unknown (a read that failed or has not finished) never shows it.
export function shouldAutoShowCityPrompt(input) {
  const state = input ?? {};
  return (
    state.locationRead === true &&
    state.hasLocation === false &&
    state.flagRead === true &&
    state.dismissed === false &&
    state.anyMetricEnabled === true &&
    state.weatherAvailable === true &&
    state.gridLocked === false
  );
}

// The early check that runs BEFORE the dismissal flag is read (docs/first-run-empty-desk.md, decision 3a): every input of
// shouldAutoShowCityPrompt except the flag, with the same fail-closed semantics. The flag is only read when this passes, and
// shouldAutoShowCityPrompt stays the final rule. Pure.
export function firstRunPromptPossible(input) {
  const state = input ?? {};
  return (
    state.locationRead === true &&
    state.hasLocation === false &&
    state.anyMetricEnabled === true &&
    state.weatherAvailable === true &&
    state.gridLocked === false
  );
}
