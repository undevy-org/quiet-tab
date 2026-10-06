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

// The room kept for an error message under the city field, in px: the full two-line reserve where the window holds the dialog with it,
// shrinking one pixel per window pixel to 0 where it holds only the dialog without it (docs/dialog-threshold-jump.md). Pure.
// With room for everything the reserve is returned exactly as given (no rounding, so the dialog keeps its full height); only a smaller
// room is rounded down to 0.01 px, so the dialog is never taller than the window by a rounding error. Unusable input fails closed to the
// full reserve (the roomy layout); an unusable reserve is 0.
export function feedbackReserve({ viewportHeight, baseHeight, fullReserve, margin } = {}) {
  const full = Number.isFinite(fullReserve) && fullReserve >= 0 ? fullReserve : 0;
  if (![viewportHeight, baseHeight, margin].every(Number.isFinite)) return full;
  const room = viewportHeight - 2 * margin - baseHeight;
  if (room >= full - 1e-6) return full; // float noise at the exact threshold is not a smaller room
  if (room <= 0) return 0;
  return Math.floor(room * 100) / 100;
}
